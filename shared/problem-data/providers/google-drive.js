/**
 * Google Drive 同步提供方
 * 版本：1.1.4
 */

(function () {
    'use strict';

    const modules = window.NoteHelperProblemDataModules = window.NoteHelperProblemDataModules || {};
    const constants = modules.constants || {};
    const helpers = modules.helpers || {};
    const syncCore = modules.syncCore || {};

    const TOKEN_STORAGE_KEY = 'note_helper_google_drive_token_v1';
    const DEFAULT_FILE_NAME = constants.GOOGLE_DRIVE_DEFAULT_FILE_NAME || 'code-note-helper-full-backup.json';
    const DRIVE_SCOPE = constants.GOOGLE_DRIVE_SCOPE || 'https://www.googleapis.com/auth/drive.file';
    const BACKUP_FOLDER_NAME = constants.GOOGLE_DRIVE_BACKUP_FOLDER_NAME || 'CodeNote Helper Backups';
    const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
    const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

    function createGoogleDriveError(message, detail = {}) {
        const error = new Error(message || 'Google Drive 同步失败');
        Object.assign(error, detail || {});
        return error;
    }

    function getErrorMessage(error, fallback = '未知错误') {
        if (!error) return fallback;
        return String(error.message || error || fallback).trim() || fallback;
    }

    function normalizeGoogleDriveAuthError(error, fallback = 'Google Drive 授权失败') {
        const rawMessage = getErrorMessage(error, fallback);
        const lowerMessage = rawMessage.toLowerCase();
        const rawErrorType = String(error && error.errorType || '').toLowerCase();

        if (rawErrorType === 'permission_denied' ||
            lowerMessage.includes('user did not approve') ||
            lowerMessage.includes('access_denied')) {
            return {
                message: '你取消了 Google Drive 授权，备份不会上传。需要备份时，请重新点击“登录并测试”或“立即备份到 Google Drive”。',
                errorType: 'permission_denied'
            };
        }
        if (lowerMessage.includes('redirect_uri_mismatch') ||
            lowerMessage.includes('invalid_client') ||
            lowerMessage.includes('origin_mismatch')) {
            return {
                message: 'Google Drive 授权配置与当前扩展不匹配。请核对 Client ID 和重定向 URI 后，再回到设置页重新登录。',
                errorType: 'auth_config'
            };
        }
        if (rawErrorType === 'auth-required') {
            return {
                message: 'Google Drive 需要重新登录。请到设置页点击“登录并测试”，或手动点击“立即备份到 Google Drive”完成授权。',
                errorType: 'auth-required'
            };
        }
        if (lowerMessage.includes('login_required') ||
            lowerMessage.includes('interaction_required') ||
            lowerMessage.includes('consent_required')) {
            return {
                message: 'Google Drive 需要重新登录。请到设置页点击“登录并测试”，或手动点击“立即备份到 Google Drive”完成授权。',
                errorType: 'auth-required'
            };
        }
        if (rawErrorType === 'auth' || error && (error.status === 401 || error.status === 403)) {
            return {
                message: 'Google Drive 授权已失效。请重新登录后再备份。',
                errorType: 'auth'
            };
        }
        return {
            message: rawMessage,
            errorType: error && error.errorType || 'google-drive'
        };
    }

    function isGoogleDriveAuthError(error) {
        const errorType = String(error && error.errorType || '').toLowerCase();
        return errorType === 'auth' ||
            errorType === 'auth-required' ||
            errorType === 'permission_denied' ||
            errorType === 'auth_config' ||
            error && (error.status === 401 || error.status === 403);
    }

    async function sendRuntimeMessage(type, payload = {}) {
        let response;
        if (helpers && typeof helpers.sendRuntimeMessage === 'function') {
            response = await helpers.sendRuntimeMessage(type, {
                type,
                ...payload
            });
        } else if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
            throw createGoogleDriveError('浏览器授权能力不可用，请在扩展设置页重试', {
                errorType: 'runtime'
            });
        } else {
            response = await chrome.runtime.sendMessage({
                type,
                ...payload
            });
        }

        if (response && response.error) {
            throw createGoogleDriveError(response.error, {
                errorType: response.errorType || 'runtime'
            });
        }
        return response;
    }

    function normalizeFileName(fileName) {
        const value = String(fileName || '').trim();
        return value || DEFAULT_FILE_NAME;
    }

    function normalizeClientId(clientId) {
        return String(clientId || '').trim();
    }

    function isClientIdConfigured(clientId) {
        const value = normalizeClientId(clientId);
        if (!value) return false;
        if (value.includes('REPLACE_WITH_') || value.includes('{0}')) return false;
        return value.endsWith('.apps.googleusercontent.com');
    }

    function createClientIdMissingError() {
        return createGoogleDriveError('请先在设置页填写 Google OAuth Client ID。', {
            stage: 'auth',
            errorType: 'auth_config'
        });
    }

    async function getGoogleDriveSettings() {
        const settings = await syncCore.getSyncSettings();
        const googleDrive = settings.googleDrive || {};
        return {
            enabled: Boolean(googleDrive.enabled),
            clientId: normalizeClientId(googleDrive.clientId),
            folderName: BACKUP_FOLDER_NAME,
            fileName: normalizeFileName(googleDrive.fileName)
        };
    }

    async function readCachedToken() {
        return helpers.readLocal(TOKEN_STORAGE_KEY, null);
    }

    async function writeCachedToken(tokenInfo) {
        await helpers.writeLocal(TOKEN_STORAGE_KEY, tokenInfo || null);
    }

    async function getGoogleDriveAuthStatus() {
        try {
            const settings = await getGoogleDriveSettings();
            if (!isClientIdConfigured(settings.clientId)) {
                return {
                    configured: false,
                    message: '请先填写 Google OAuth Client ID，再登录并测试。'
                };
            }
            return await sendRuntimeMessage('GET_GOOGLE_DRIVE_AUTH_STATUS');
        } catch (error) {
            return {
                configured: false,
                message: getErrorMessage(error, '请先填写 Google OAuth Client ID，再登录并测试。')
            };
        }
    }

    function isTokenUsable(tokenInfo, clientId) {
        if (!tokenInfo || !tokenInfo.accessToken) return false;
        if (normalizeClientId(tokenInfo.clientId) !== normalizeClientId(clientId)) return false;
        if (String(tokenInfo.scope || '') !== DRIVE_SCOPE) return false;
        const expiresAt = Number(tokenInfo.expiresAt || 0);
        return expiresAt > Date.now() + 60 * 1000;
    }

    async function requestAccessToken(settings, interactive, options = {}) {
        try {
            return await sendRuntimeMessage('GOOGLE_DRIVE_AUTHORIZE', {
                interactive: interactive === true,
                allowInteractiveFallback: options.allowInteractiveFallback === true,
                clientId: settings.clientId,
                scope: DRIVE_SCOPE
            });
        } catch (error) {
            const normalized = normalizeGoogleDriveAuthError(error);
            throw createGoogleDriveError(normalized.message, {
                stage: 'auth',
                errorType: normalized.errorType
            });
        }
    }

    async function ensureAccessToken(options = {}) {
        const config = {
            allowInteractiveFallback: false,
            ...(options || {})
        };
        const settings = await getGoogleDriveSettings();
        if (!isClientIdConfigured(settings.clientId)) {
            throw createClientIdMissingError();
        }
        const cached = await readCachedToken();
        if (isTokenUsable(cached, settings.clientId)) {
            return cached.accessToken;
        }

        let authResult = null;
        let silentError = null;
        try {
            authResult = await requestAccessToken(settings, false, {
                allowInteractiveFallback: config.allowInteractiveFallback === true
            });
        } catch (error) {
            silentError = error;
        }

        if ((!authResult || !authResult.accessToken) && config.allowInteractiveFallback === true) {
            if (silentError) {
                throw silentError;
            }
        } else if (!authResult || !authResult.accessToken) {
            if (silentError) {
                throw silentError;
            }
            throw createGoogleDriveError('Google Drive 授权没有完成。请在设置页重新登录后再重试。', {
                stage: 'auth',
                errorType: 'auth-required'
            });
        }

        if (!authResult || !authResult.accessToken) {
            throw createGoogleDriveError('Google Drive 授权没有完成。请在弹出的登录页面中确认授权后再重试。', {
                stage: 'auth',
                errorType: 'auth'
            });
        }

        await writeCachedToken({
            accessToken: authResult.accessToken,
            expiresAt: Number(authResult.expiresAt || 0),
            clientId: settings.clientId,
            scope: DRIVE_SCOPE,
            updatedAt: new Date().toISOString()
        });
        return authResult.accessToken;
    }

    async function requestGoogleDrive(accessToken, request) {
        const response = await sendRuntimeMessage('GOOGLE_DRIVE_REQUEST', {
            method: request.method || 'GET',
            url: request.url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...(request.headers || {})
            },
            body: request.body || null
        });

        if (!response || response.status === 0 || response.errorType) {
            throw createGoogleDriveError(response && response.errorMessage
                ? response.errorMessage
                : 'Google Drive 网络请求失败', {
                errorType: (response && response.errorType) || 'network',
                status: response && response.status,
                response
            });
        }

        const acceptStatuses = Array.isArray(request.acceptStatuses) && request.acceptStatuses.length
            ? request.acceptStatuses
            : [200, 201];
        if (!acceptStatuses.includes(response.status)) {
            const message = response.data && response.data.error && response.data.error.message
                ? response.data.error.message
                : `Google Drive 返回状态 ${response.status}`;
            const errorType = response.status === 401 || response.status === 403 ? 'auth' : 'http-status';
            throw createGoogleDriveError(message, {
                errorType,
                status: response.status,
                response
            });
        }

        return response;
    }

    async function runGoogleDriveBackup(accessToken, settings, jsonText) {
        const folder = await ensureBackupFolder(accessToken, settings.folderName);
        if (!folder || !folder.id) {
            throw createGoogleDriveError('Google Drive 备份文件夹创建失败，请稍后重试', {
                stage: 'folder',
                errorType: 'remote-folder'
            });
        }
        const existingFile = await findBackupFile(accessToken, folder.id, settings.fileName);

        let response;
        if (existingFile && existingFile.id) {
            response = await requestGoogleDrive(accessToken, {
                method: 'PATCH',
                url: `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(existingFile.id)}?uploadType=media&fields=id,name,modifiedTime,size`,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: jsonText,
                acceptStatuses: [200]
            });
        } else {
            const multipart = createMultipartBody({
                name: settings.fileName,
                mimeType: 'application/json',
                parents: [folder.id],
                appProperties: {
                    codenoteHelper: 'full-backup'
                }
            }, jsonText);
            response = await requestGoogleDrive(accessToken, {
                method: 'POST',
                url: `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,modifiedTime,size`,
                headers: {
                    'Content-Type': multipart.contentType
                },
                body: multipart.body,
                acceptStatuses: [200, 201]
            });
        }

        return {
            folder,
            existingFile,
            response
        };
    }

    function escapeDriveQueryValue(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function pickUniqueDriveFile(files, label) {
        if (!files.length) return null;
        if (files.length === 1) return files[0];
        throw createGoogleDriveError(`Google Drive 中找到多个同名${label}，请只保留一个后重试`, {
            stage: 'lookup',
            errorType: 'remote-duplicate'
        });
    }

    async function listDriveFiles(accessToken, query, fields = 'files(id,name,modifiedTime,size,appProperties)') {
        const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`;
        const response = await requestGoogleDrive(accessToken, {
            method: 'GET',
            url,
            acceptStatuses: [200]
        });
        return response.data && Array.isArray(response.data.files) ? response.data.files : [];
    }

    async function findBackupFolder(accessToken, folderName) {
        const name = escapeDriveQueryValue(folderName);
        const folderMime = 'application/vnd.google-apps.folder';
        const markerQuery = `name='${name}' and mimeType='${folderMime}' and trashed=false and appProperties has { key='codenoteHelper' and value='backup-folder' }`;
        const marked = await listDriveFiles(accessToken, markerQuery, 'files(id,name,appProperties)');
        if (marked.length) return pickUniqueDriveFile(marked, '备份文件夹');

        const nameQuery = `name='${name}' and mimeType='${folderMime}' and trashed=false`;
        const named = await listDriveFiles(accessToken, nameQuery, 'files(id,name,appProperties)');
        return pickUniqueDriveFile(named, '备份文件夹');
    }

    async function createBackupFolder(accessToken, folderName) {
        const response = await requestGoogleDrive(accessToken, {
            method: 'POST',
            url: `${DRIVE_API_BASE}/files?fields=id,name,appProperties`,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                appProperties: {
                    codenoteHelper: 'backup-folder'
                }
            }),
            acceptStatuses: [200, 201]
        });
        return response.data || null;
    }

    async function ensureBackupFolder(accessToken, folderName) {
        const existing = await findBackupFolder(accessToken, folderName);
        if (existing && existing.id) return existing;
        return createBackupFolder(accessToken, folderName);
    }

    async function findBackupFile(accessToken, folderId, fileName) {
        const name = escapeDriveQueryValue(fileName);
        const parent = escapeDriveQueryValue(folderId);
        const markerQuery = `name='${name}' and '${parent}' in parents and trashed=false and appProperties has { key='codenoteHelper' and value='full-backup' }`;
        const marked = await listDriveFiles(accessToken, markerQuery);
        if (marked.length) return pickUniqueDriveFile(marked, '备份文件');

        const nameQuery = `name='${name}' and '${parent}' in parents and trashed=false`;
        const named = await listDriveFiles(accessToken, nameQuery);
        return pickUniqueDriveFile(named, '备份文件');
    }

    function createMultipartBody(metadata, jsonText) {
        const boundary = `codenote_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const body = [
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8',
            '',
            JSON.stringify(metadata),
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8',
            '',
            jsonText,
            `--${boundary}--`,
            ''
        ].join('\r\n');
        return {
            body,
            contentType: `multipart/related; boundary=${boundary}`
        };
    }

    async function testGoogleDriveConnection(options = {}) {
        try {
            const accessToken = await ensureAccessToken({
                allowInteractiveFallback: options.interactive !== false
            });
            const settings = await getGoogleDriveSettings();
            const folder = await findBackupFolder(accessToken, settings.folderName);
            const file = folder && folder.id ? await findBackupFile(accessToken, folder.id, settings.fileName) : null;
            await syncCore.markSyncSuccess('googleDrive', 'Google Drive 授权可用', {
                markRevisionSynced: false
            });
            return {
                success: true,
                folderName: settings.folderName,
                folderFound: Boolean(folder),
                folderId: folder && folder.id || '',
                fileName: settings.fileName,
                fileFound: Boolean(file),
                fileId: file && file.id || ''
            };
        } catch (error) {
            const stageError = createGoogleDriveError(getErrorMessage(error, 'Google Drive 授权测试失败'), {
                stage: error && error.stage || 'auth',
                errorType: error && error.errorType || 'auth',
                status: error && error.status,
                originalError: error || null
            });
            await syncCore.markSyncError('googleDrive', stageError, 'Google Drive 授权失败');
            throw stageError;
        }
    }

    async function backupToGoogleDrive(options = {}) {
        try {
            let accessToken = await ensureAccessToken({
                allowInteractiveFallback: options.interactive === true
            });
            const settings = await getGoogleDriveSettings();
            const snapshot = await syncCore.buildFullSnapshot();
            const jsonText = JSON.stringify(snapshot, null, 2);
            let backupResult;
            try {
                backupResult = await runGoogleDriveBackup(accessToken, settings, jsonText);
            } catch (error) {
                if (!(options.interactive === true && isGoogleDriveAuthError(error))) {
                    throw error;
                }
                await writeCachedToken(null);
                accessToken = await ensureAccessToken({
                    allowInteractiveFallback: options.interactive === true
                });
                backupResult = await runGoogleDriveBackup(accessToken, settings, jsonText);
            }

            await syncCore.markSyncSuccess('googleDrive', 'Google Drive 备份成功');
            return {
                success: true,
                folderName: settings.folderName,
                folderId: backupResult.folder.id,
                fileName: settings.fileName,
                fileId: backupResult.response.data && backupResult.response.data.id || backupResult.existingFile && backupResult.existingFile.id || '',
                updated: Boolean(backupResult.existingFile && backupResult.existingFile.id)
            };
        } catch (error) {
            const normalized = isGoogleDriveAuthError(error)
                ? normalizeGoogleDriveAuthError(error, 'Google Drive 授权失败')
                : {
                    message: `上传失败：${getErrorMessage(error, '上传备份文件失败')}`,
                    errorType: error && error.errorType || 'google-drive'
                };
            const stageError = createGoogleDriveError(normalized.message, {
                stage: error && error.stage || 'upload',
                errorType: normalized.errorType,
                status: error && error.status,
                originalError: error || null
            });
            await syncCore.markSyncError('googleDrive', stageError, 'Google Drive 备份失败');
            throw stageError;
        }
    }

    async function restoreFromGoogleDrive(options = {}) {
        try {
            const accessToken = await ensureAccessToken({
                allowInteractiveFallback: options.interactive === true
            });
            const settings = await getGoogleDriveSettings();
            const folder = await findBackupFolder(accessToken, settings.folderName);
            const file = folder && folder.id ? await findBackupFile(accessToken, folder.id, settings.fileName) : null;
            if (!file || !file.id) {
                throw createGoogleDriveError('没有找到 Google Drive 备份文件，请先完成一次备份。', {
                    stage: 'restore',
                    errorType: 'remote-not-found'
                });
            }

            const response = await requestGoogleDrive(accessToken, {
                method: 'GET',
                url: `${DRIVE_API_BASE}/files/${encodeURIComponent(file.id)}?alt=media`,
                acceptStatuses: [200]
            });
            const snapshot = typeof response.data === 'string'
                ? helpers.safeJsonParse(response.data)
                : response.data;
            if (!snapshot) {
                throw createGoogleDriveError('Google Drive 备份内容不是有效的 JSON', {
                    stage: 'restore',
                    errorType: 'invalid-json'
                });
            }

            await syncCore.mergeSnapshotToLocal(snapshot, {
                autoSync: false
            });
            await syncCore.markSyncSuccess('googleDrive', 'Google Drive 恢复成功');
            return {
                success: true,
                fileName: settings.fileName,
                fileId: file.id
            };
        } catch (error) {
            const stageError = createGoogleDriveError(`恢复失败：${getErrorMessage(error, '恢复云端备份失败')}`, {
                stage: error && error.stage || 'restore',
                errorType: error && error.errorType || 'google-drive',
                status: error && error.status,
                originalError: error || null
            });
            await syncCore.markSyncError('googleDrive', stageError, 'Google Drive 恢复失败');
            throw stageError;
        }
    }

    async function disconnectGoogleDrive() {
        const cached = await readCachedToken();
        await writeCachedToken(null);
        await syncCore.setSyncStatus('googleDrive', 'warning', 'Google Drive 授权已断开');
        if (cached && cached.accessToken) {
            try {
                await sendRuntimeMessage('GOOGLE_DRIVE_REVOKE', {
                    accessToken: cached.accessToken
                });
            } catch (error) {
                console.warn('[ProblemData] Google Drive 远端授权撤销失败，已清除本地授权：', error);
            }
        }
        return { success: true };
    }

    modules.providers = modules.providers || {};
    modules.providers.googleDrive = {
        getGoogleDriveSettings,
        getGoogleDriveAuthStatus,
        ensureAccessToken,
        testGoogleDriveConnection,
        backupToGoogleDrive,
        restoreFromGoogleDrive,
        disconnectGoogleDrive
    };
})();
