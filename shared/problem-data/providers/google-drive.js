/**
 * Google Drive 同步提供方
 * 版本：1.1.3
 */

(function () {
    'use strict';

    const modules = window.NoteHelperProblemDataModules = window.NoteHelperProblemDataModules || {};
    const constants = modules.constants || {};
    const helpers = modules.helpers || {};
    const syncCore = modules.syncCore || {};

    const TOKEN_STORAGE_KEY = 'note_helper_google_drive_token_v1';
    const DEFAULT_FILE_NAME = constants.GOOGLE_DRIVE_DEFAULT_FILE_NAME || 'code-note-helper-full-backup.json';
    const DRIVE_SCOPE = constants.GOOGLE_DRIVE_SCOPE || 'https://www.googleapis.com/auth/drive.appdata';
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

    async function getGoogleDriveSettings() {
        const settings = await syncCore.getSyncSettings();
        const googleDrive = settings.googleDrive || {};
        return {
            enabled: Boolean(googleDrive.enabled),
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
            return await sendRuntimeMessage('GET_GOOGLE_DRIVE_AUTH_STATUS');
        } catch (error) {
            return {
                configured: false,
                message: '当前版本暂时不能使用 Google Drive 登录，请先使用本地 JSON 或坚果云备份。'
            };
        }
    }

    function isTokenUsable(tokenInfo) {
        if (!tokenInfo || !tokenInfo.accessToken) return false;
        const expiresAt = Number(tokenInfo.expiresAt || 0);
        return expiresAt > Date.now() + 60 * 1000;
    }

    async function ensureAccessToken(options = {}) {
        const config = {
            interactive: false,
            ...(options || {})
        };
        const cached = await readCachedToken();
        if (isTokenUsable(cached)) {
            return cached.accessToken;
        }

        if (!config.interactive) {
            throw createGoogleDriveError('Google Drive 需要重新登录，请到设置页点击“登录并测试”', {
                stage: 'auth',
                errorType: 'auth-required'
            });
        }

        let authResult;
        try {
            authResult = await sendRuntimeMessage('GOOGLE_DRIVE_AUTHORIZE', {
                interactive: true,
                scope: DRIVE_SCOPE
            });
        } catch (error) {
            throw createGoogleDriveError(`Google Drive 授权失败：${getErrorMessage(error)}`, {
                stage: 'auth',
                errorType: 'auth'
            });
        }

        if (!authResult || !authResult.accessToken) {
            throw createGoogleDriveError('Google Drive 授权未完成，请稍后重试', {
                stage: 'auth',
                errorType: 'auth'
            });
        }

        await writeCachedToken({
            accessToken: authResult.accessToken,
            expiresAt: Number(authResult.expiresAt || 0),
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

    function escapeDriveQueryValue(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    async function findBackupFile(accessToken, fileName) {
        const query = encodeURIComponent(`name='${escapeDriveQueryValue(fileName)}' and trashed=false`);
        const fields = encodeURIComponent('files(id,name,modifiedTime,size)');
        const url = `${DRIVE_API_BASE}/files?spaces=appDataFolder&pageSize=10&q=${query}&fields=${fields}`;
        const response = await requestGoogleDrive(accessToken, {
            method: 'GET',
            url,
            acceptStatuses: [200]
        });
        const files = response.data && Array.isArray(response.data.files) ? response.data.files : [];
        return files[0] || null;
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
                interactive: options.interactive !== false
            });
            const settings = await getGoogleDriveSettings();
            const file = await findBackupFile(accessToken, settings.fileName);
            await syncCore.markSyncSuccess('googleDrive', 'Google Drive 授权可用');
            return {
                success: true,
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
            const accessToken = await ensureAccessToken({
                interactive: options.interactive === true
            });
            const settings = await getGoogleDriveSettings();
            const snapshot = await syncCore.buildFullSnapshot();
            const jsonText = JSON.stringify(snapshot, null, 2);
            const existingFile = await findBackupFile(accessToken, settings.fileName);

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
                    parents: ['appDataFolder']
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

            await syncCore.markSyncSuccess('googleDrive', 'Google Drive 备份成功');
            return {
                success: true,
                fileName: settings.fileName,
                fileId: response.data && response.data.id || existingFile && existingFile.id || '',
                updated: Boolean(existingFile && existingFile.id)
            };
        } catch (error) {
            const stageError = createGoogleDriveError(`上传失败：${getErrorMessage(error, '上传备份文件失败')}`, {
                stage: error && error.stage || 'upload',
                errorType: error && error.errorType || 'google-drive',
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
                interactive: options.interactive === true
            });
            const settings = await getGoogleDriveSettings();
            const file = await findBackupFile(accessToken, settings.fileName);
            if (!file || !file.id) {
                throw createGoogleDriveError('Google Drive 中还没有找到备份文件，请先执行一次备份', {
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
