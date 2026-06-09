/**
 * 高级设置页脚本
 * 版本：1.1.4
 */

(function () {
    'use strict';

    const DEFAULT_WEBDAV_REMOTE_PATH = 'CodeNote-Helper/backups/full-backup.json';

    function resolveWebdavPanelVisible(webdavEnabled) {
        return Boolean(webdavEnabled);
    }

    function resolveGoogleDrivePanelVisible(googleDriveEnabled) {
        return Boolean(googleDriveEnabled);
    }

    function formatDateTime(value) {
        if (!value) return '暂无';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '暂无';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:${minute}`;
    }

    function formatStatusText(status) {
        if (!status || !status.state) return '暂无';
        const stateMap = {
            success: '成功',
            warning: '提示',
            error: '失败'
        };
        const label = stateMap[status.state] || status.state;
        const message = status.message ? `：${status.message}` : '';
        return `${label}${message}`;
    }

    function createToast(toastElement) {
        let timer = null;
        return function showToast(message, duration) {
            toastElement.textContent = message;
            toastElement.classList.add('show');
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                toastElement.classList.remove('show');
            }, duration || 2200);
        };
    }

    function setBusy(button, busy) {
        if (!button) return;
        button.disabled = busy;
    }

    function setDisabled(element, disabled) {
        if (!element) return;
        element.disabled = disabled;
    }

    function formatWebdavErrorMessage(error, action) {
        if (error && error.message) {
            return String(error.message);
        }
        const stageFallback = {
            config: '配置错误，请先填写坚果云邮箱和应用密码',
            connect: '连接失败，请检查账号、应用密码和 WebDAV 地址',
            directory: '目录确认失败，请检查远端目录是否可访问',
            upload: '上传失败，请稍后重试',
            restore: '恢复失败，请稍后重试'
        };
        if (error && error.stage && stageFallback[error.stage]) {
            return stageFallback[error.stage];
        }
        const actionFallback = {
            test: stageFallback.connect,
            backup: stageFallback.upload,
            restore: stageFallback.restore
        };
        return actionFallback[action] || '同步失败，请稍后重试';
    }

    function resolveErrorMessage(error) {
        if (error && typeof error.message === 'string') {
            return error.message.trim();
        }
        return String(error || '').trim();
    }

    function isExpectedWebdavFailure(error) {
        const stage = String(error && error.stage || '').trim();
        if (stage === 'config' || stage === 'connect' || stage === 'directory' || stage === 'upload' || stage === 'restore') {
            return true;
        }
        const message = resolveErrorMessage(error);
        if (!message) return false;
        const normalized = message.toLowerCase();
        return normalized.includes('请求超时') || normalized.includes('timeout');
    }

    function logWebdavFailure(prefix, error) {
        if (isExpectedWebdavFailure(error)) {
            // 可预期网络失败（超时/连接异常等）只走界面提示，不写控制台错误或警告。
            return;
        }
        console.error(prefix, error);
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const store = window.NoteHelperProblemData;
        const reviewSettingsModule = window.NoteHelperProblemDataModules && window.NoteHelperProblemDataModules.reviewSettings
            ? window.NoteHelperProblemDataModules.reviewSettings
            : null;
        if (!store) {
            console.error('[Options] 共享数据仓库未加载');
            return;
        }

        const elements = {
            timelineToggle: document.getElementById('timeline-toggle'),
            localLabel: document.getElementById('local-label'),
            localRevision: document.getElementById('local-revision'),
            lastLocalWrite: document.getElementById('last-local-write'),
            btnExportJson: document.getElementById('btn-export-json'),
            btnImportJson: document.getElementById('btn-import-json'),
            importJsonFile: document.getElementById('import-json-file'),
            webdavToggle: document.getElementById('webdav-toggle'),
            googleDriveToggle: document.getElementById('google-drive-toggle'),
            googleDriveSettingsPanel: document.getElementById('google-drive-settings-panel'),
            googleDriveClientId: document.getElementById('google-drive-client-id'),
            googleDriveClientIdGroup: document.getElementById('google-drive-client-id-group'),
            googleDriveAuthModeHint: document.getElementById('google-drive-auth-mode-hint'),
            googleDriveAuthModeBuiltIn: document.getElementById('google-drive-auth-mode-built-in'),
            googleDriveAuthModeCustom: document.getElementById('google-drive-auth-mode-custom'),
            btnTestGoogleDrive: document.getElementById('btn-test-google-drive'),
            btnBackupGoogleDrive: document.getElementById('btn-backup-google-drive'),
            btnRestoreGoogleDrive: document.getElementById('btn-restore-google-drive'),
            btnDisconnectGoogleDrive: document.getElementById('btn-disconnect-google-drive'),
            googleDriveAuthHint: document.getElementById('google-drive-auth-hint'),
            googleDriveFileLabel: document.getElementById('google-drive-file-label'),
            googleDriveLastAt: document.getElementById('google-drive-last-at'),
            googleDriveLastStatus: document.getElementById('google-drive-last-status'),
            googleDriveLastError: document.getElementById('google-drive-last-error'),
            webdavEmail: document.getElementById('webdav-email'),
            webdavPassword: document.getElementById('webdav-password'),
            webdavRemotePath: document.getElementById('webdav-remote-path'),
            btnSaveSync: document.getElementById('btn-save-sync'),
            btnTestWebdav: document.getElementById('btn-test-webdav'),
            btnBackupWebdav: document.getElementById('btn-backup-webdav'),
            btnRestoreWebdav: document.getElementById('btn-restore-webdav'),
            webdavBaseUrl: document.getElementById('webdav-base-url'),
            webdavRemoteLabel: document.getElementById('webdav-remote-label'),
            webdavLastAt: document.getElementById('webdav-last-at'),
            webdavLastStatus: document.getElementById('webdav-last-status'),
            webdavLastError: document.getElementById('webdav-last-error'),
            webdavSettingsPanel: document.getElementById('webdav-settings-panel'),
            reviewFsrsToggle: document.getElementById('review-fsrs-toggle'),
            reviewFsrsSettingsPanel: document.getElementById('review-fsrs-settings-panel'),
            reviewFsrsPresetOptions: Array.from(document.querySelectorAll('input[name="review-fsrs-preset"]')),
            reviewFsrsCustomPanel: document.getElementById('review-fsrs-custom-panel'),
            reviewFsrsRequestRetention: document.getElementById('review-fsrs-request-retention'),
            reviewFsrsMaximumInterval: document.getElementById('review-fsrs-maximum-interval'),
            apiUrl: document.getElementById('api-url'),
            apiKey: document.getElementById('api-key'),
            apiModel: document.getElementById('api-model'),
            overwriteConfirmToggle: document.getElementById('overwrite-confirm-toggle'),
            btnSaveApi: document.getElementById('btn-save-api'),
            btnResetApi: document.getElementById('btn-reset-api'),
            toast: document.getElementById('toast')
        };

        const syncDirtyHint = document.getElementById('sync-dirty-hint');
        const apiDirtyHint = document.getElementById('api-dirty-hint');

        let syncDirty = false;
        let apiDirty = false;
        let googleDriveAuthConfigured = true;
        let googleDriveAuthWarningMessage = '';

        const showToast = createToast(elements.toast);
        const permissionHelper = window.NoteHelperApiDomainPermission || null;

        function normalizeGoogleDriveClientId(value) {
            return String(value || '').trim();
        }

        function isGoogleDriveClientIdConfigured(value) {
            const clientId = normalizeGoogleDriveClientId(value);
            if (!clientId) return false;
            if (clientId.includes('REPLACE_WITH_') || clientId.includes('{0}')) return false;
            return clientId.endsWith('.apps.googleusercontent.com');
        }

        function getGoogleDriveClientIdInput() {
            return normalizeGoogleDriveClientId(elements.googleDriveClientId && elements.googleDriveClientId.value);
        }

        function isGoogleDriveClientIdReady(value) {
            const clientId = normalizeGoogleDriveClientId(value);
            return !clientId || isGoogleDriveClientIdConfigured(clientId);
        }

        function isGoogleDriveCustomAuthMode() {
            return Boolean(elements.googleDriveAuthModeCustom && elements.googleDriveAuthModeCustom.checked);
        }

        function getEffectiveGoogleDriveClientIdInput() {
            return isGoogleDriveCustomAuthMode() ? getGoogleDriveClientIdInput() : '';
        }

        function applyGoogleDriveAuthModeVisibility() {
            const customMode = isGoogleDriveCustomAuthMode();
            if (elements.googleDriveClientIdGroup) {
                elements.googleDriveClientIdGroup.style.display = customMode ? '' : 'none';
            }
            if (elements.googleDriveClientId) {
                elements.googleDriveClientId.disabled = !customMode;
            }
            if (elements.googleDriveAuthModeHint) {
                elements.googleDriveAuthModeHint.textContent = customMode
                    ? '当前使用自定义 Google 授权配置，请确认 Client ID 填写正确。'
                    : '当前使用内置 Google 授权配置，无需手动填写。';
            }
        }

        function isGoogleDriveBrowserUnsupported(authStatus) {
            const errorType = String(authStatus && authStatus.errorType || '').toLowerCase();
            const message = String(authStatus && authStatus.message || '');
            return errorType === 'browser_api_unsupported' ||
                errorType === 'browser-api-unsupported' ||
                message.includes('Microsoft Edge 暂不支持 Google Drive');
        }

        function getGoogleDriveBrowserUnsupportedMessage() {
            return 'Microsoft Edge 暂不支持 Google Drive 完整备份。请在 Chrome 中使用，或先使用本地 JSON / 坚果云备份。';
        }

        async function ensureGoogleDriveRuntimePermissionForUserGesture() {
            if (typeof chrome === 'undefined' || !chrome.permissions || typeof chrome.permissions.request !== 'function') {
                return;
            }
            const granted = await chrome.permissions.request({
                permissions: ['identity'],
                origins: [
                    'https://www.googleapis.com/*',
                    'https://oauth2.googleapis.com/*'
                ]
            });
            if (!granted) {
                throw new Error('你取消了 Google Drive 授权，备份不会上传。');
            }
        }

        function applyGoogleDriveAuthState(authStatus) {
            const customMode = isGoogleDriveCustomAuthMode();
            const advancedClientId = getEffectiveGoogleDriveClientIdInput();
            const browserUnsupported = isGoogleDriveBrowserUnsupported(authStatus);
            const clientIdReady = customMode
                ? isGoogleDriveClientIdConfigured(advancedClientId)
                : isGoogleDriveClientIdReady(advancedClientId);
            googleDriveAuthConfigured = customMode
                ? clientIdReady && !browserUnsupported
                : clientIdReady && !(authStatus && authStatus.configured === false);
            googleDriveAuthWarningMessage = '';
            const message = googleDriveAuthConfigured
                ? (customMode
                    ? '已准备好使用自定义 Google 授权配置。首次使用会打开 Google 登录页面，授权后会把备份保存到 CodeNote Helper Backups 文件夹。'
                    : '已准备好使用内置 Google 授权配置。首次使用会打开 Google 登录页面，授权后会把备份保存到 CodeNote Helper Backups 文件夹。')
                : (browserUnsupported
                    ? getGoogleDriveBrowserUnsupportedMessage()
                    : (clientIdReady
                        ? (authStatus && authStatus.message) || '当前浏览器缺少可用的 Google Drive 授权配置，请在高级授权设置中填写自定义 Client ID。'
                        : '请确认高级授权设置中填写的是有效的 Google OAuth Client ID。'));
            if (!googleDriveAuthConfigured) {
                googleDriveAuthWarningMessage = message;
            }
            if (elements.googleDriveAuthHint) {
                elements.googleDriveAuthHint.textContent = message;
            }
            setDisabled(elements.btnTestGoogleDrive, !googleDriveAuthConfigured);
            setDisabled(elements.btnBackupGoogleDrive, !googleDriveAuthConfigured);
            setDisabled(elements.btnRestoreGoogleDrive, !googleDriveAuthConfigured);
            setDisabled(elements.btnDisconnectGoogleDrive, !googleDriveAuthConfigured);
        }

        function markSyncDirty() {
            if (syncDirty) return;
            syncDirty = true;
            if (syncDirtyHint) {
                syncDirtyHint.style.display = '';
            }
        }

        function clearSyncDirty() {
            syncDirty = false;
            if (syncDirtyHint) {
                syncDirtyHint.style.display = 'none';
            }
        }

        function markApiDirty() {
            if (apiDirty) return;
            apiDirty = true;
            if (apiDirtyHint) {
                apiDirtyHint.style.display = '';
            }
        }

        function clearApiDirty() {
            apiDirty = false;
            if (apiDirtyHint) {
                apiDirtyHint.style.display = 'none';
            }
        }

        function applyWebdavPanelVisibility() {
            if (!elements.webdavSettingsPanel) return;
            elements.webdavSettingsPanel.style.display = resolveWebdavPanelVisible(
                elements.webdavToggle && elements.webdavToggle.checked
            )
                ? ''
                : 'none';
        }

        function applyGoogleDrivePanelVisibility() {
            if (!elements.googleDriveSettingsPanel) return;
            elements.googleDriveSettingsPanel.style.display = resolveGoogleDrivePanelVisible(
                elements.googleDriveToggle && elements.googleDriveToggle.checked
            )
                ? ''
                : 'none';
        }

        function getSelectedReviewFsrsPreset() {
            const selected = elements.reviewFsrsPresetOptions.find((input) => input.checked);
            return selected ? selected.value : 'custom';
        }

        function setSelectedReviewFsrsPreset(value) {
            const preset = String(value || 'custom').trim().toLowerCase();
            elements.reviewFsrsPresetOptions.forEach((input) => {
                input.checked = input.value === preset;
            });
        }

        function applyReviewFsrsPanelVisibility() {
            if (!elements.reviewFsrsSettingsPanel) return;
            const enabled = Boolean(elements.reviewFsrsToggle && elements.reviewFsrsToggle.checked);
            elements.reviewFsrsSettingsPanel.style.display = enabled ? '' : 'none';
            applyReviewFsrsCustomPanelVisibility();
        }

        function applyReviewFsrsCustomPanelVisibility() {
            if (!elements.reviewFsrsCustomPanel) return;
            const enabled = Boolean(elements.reviewFsrsToggle && elements.reviewFsrsToggle.checked);
            const isCustom = getSelectedReviewFsrsPreset() === 'custom';
            elements.reviewFsrsCustomPanel.style.display = enabled && isCustom ? '' : 'none';
        }

        function buildReviewFsrsSettingsFromInputs() {
            const defaultSettings = reviewSettingsModule && reviewSettingsModule.DEFAULT_REVIEW_FSRS_SETTINGS
                ? reviewSettingsModule.DEFAULT_REVIEW_FSRS_SETTINGS
                : {
                    enabled: false,
                    preset: 'custom',
                    custom: {
                        request_retention: 0.9,
                        maximum_interval: 365
                    }
                };
            const preset = getSelectedReviewFsrsPreset();
            const requestRetentionText = String(elements.reviewFsrsRequestRetention && elements.reviewFsrsRequestRetention.value || '').trim();
            const maximumIntervalText = String(elements.reviewFsrsMaximumInterval && elements.reviewFsrsMaximumInterval.value || '').trim();
            const custom = {
                request_retention: requestRetentionText === ''
                    ? defaultSettings.custom.request_retention
                    : Number(requestRetentionText),
                maximum_interval: maximumIntervalText === ''
                    ? defaultSettings.custom.maximum_interval
                    : Number(maximumIntervalText)
            };
            return {
                enabled: Boolean(elements.reviewFsrsToggle && elements.reviewFsrsToggle.checked),
                preset,
                custom
            };
        }

        function validateReviewFsrsSettings(settings) {
            if (!settings.enabled || settings.preset !== 'custom') {
                return { ok: true };
            }

            if (!(settings.custom.request_retention > 0 && settings.custom.request_retention <= 1)) {
                return {
                    ok: false,
                    message: '记忆保持率必须大于 0 且不超过 1'
                };
            }
            if (!Number.isFinite(settings.custom.maximum_interval) || settings.custom.maximum_interval < 1) {
                return {
                    ok: false,
                    message: '最大间隔天数必须是大于 0 的整数'
                };
            }

            return { ok: true };
        }

        async function loadApiSettings() {
            const result = await chrome.storage.local.get(['api_url', 'api_key', 'api_model']);
            elements.apiUrl.value = result.api_url || 'https://api.openai.com/v1';
            elements.apiKey.value = result.api_key || '';
            elements.apiModel.value = result.api_model || 'gpt-4o';
            if (elements.overwriteConfirmToggle) {
                if (permissionHelper && typeof permissionHelper.getOverwriteConfirmEnabled === 'function') {
                    elements.overwriteConfirmToggle.checked = await permissionHelper.getOverwriteConfirmEnabled(true);
                } else {
                    const fallback = await chrome.storage.local.get(['note_helper_overwrite_confirm_enabled']);
                    elements.overwriteConfirmToggle.checked = typeof fallback.note_helper_overwrite_confirm_enabled === 'boolean'
                        ? fallback.note_helper_overwrite_confirm_enabled
                        : true;
                }
            }
            clearApiDirty();
        }

        async function loadSyncSection() {
            const [overview, settings, timelineEnabled] = await Promise.all([
                store.getSyncOverview(),
                store.getSyncSettings(),
                store.getTimelineEnabled()
            ]);
            const googleDriveAuthStatus = typeof store.getGoogleDriveAuthStatus === 'function'
                ? await store.getGoogleDriveAuthStatus()
                : {
                    configured: false,
                    message: '请先填写 Google OAuth Client ID，再保存并登录测试。'
                };

            elements.timelineToggle.checked = timelineEnabled;
            elements.localLabel.textContent = overview.localLabel || '当前浏览器';
            elements.localRevision.textContent = String(overview.localRevision || 0);
            elements.lastLocalWrite.textContent = `最近写入：${formatDateTime(overview.lastLocalWriteAt)}`;

            elements.webdavToggle.checked = Boolean(settings.webdav && settings.webdav.enabled);
            if (elements.googleDriveClientId) {
                elements.googleDriveClientId.value = settings.googleDrive && settings.googleDrive.clientId || '';
            }
            if (elements.googleDriveAuthModeBuiltIn && elements.googleDriveAuthModeCustom) {
                const hasCustomClientId = Boolean(settings.googleDrive && settings.googleDrive.clientId);
                elements.googleDriveAuthModeBuiltIn.checked = !hasCustomClientId;
                elements.googleDriveAuthModeCustom.checked = hasCustomClientId;
            }
            applyGoogleDriveAuthModeVisibility();
            applyGoogleDriveAuthState(googleDriveAuthStatus);
            if (elements.googleDriveToggle) {
                elements.googleDriveToggle.checked = Boolean(settings.googleDrive && settings.googleDrive.enabled);
            }
            if (elements.googleDriveFileLabel) {
                elements.googleDriveFileLabel.textContent = overview.googleDriveFileName || '暂无';
            }
            if (elements.googleDriveLastAt) {
                elements.googleDriveLastAt.textContent = formatDateTime(overview.googleDriveLastSyncAt);
            }
            if (elements.googleDriveLastStatus) {
                elements.googleDriveLastStatus.textContent = formatStatusText(overview.googleDriveLastStatus);
            }
            if (elements.googleDriveLastError) {
                elements.googleDriveLastError.textContent = overview.googleDriveLastError?.message || '暂无';
            }
            elements.webdavEmail.value = settings.webdav?.email || '';
            elements.webdavPassword.value = settings.webdav?.appPassword || '';
            elements.webdavRemotePath.value = settings.webdav?.remotePath || DEFAULT_WEBDAV_REMOTE_PATH;
            elements.webdavBaseUrl.textContent = overview.webdavBaseUrl || '暂无';
            elements.webdavRemoteLabel.textContent = overview.webdavRemotePath || '暂无';
            elements.webdavLastAt.textContent = formatDateTime(overview.webdavLastSyncAt);
            elements.webdavLastStatus.textContent = formatStatusText(overview.webdavLastStatus);
            elements.webdavLastError.textContent = overview.webdavLastError?.message || '暂无';

            const reviewFsrsSettings = reviewSettingsModule && typeof reviewSettingsModule.extractReviewFsrsSettings === 'function'
                ? reviewSettingsModule.extractReviewFsrsSettings(settings)
                : (settings.reviewFsrs || {
                    enabled: false,
                    preset: 'custom',
                    custom: {
                        request_retention: 0.9,
                        maximum_interval: 365
                    }
                });
            if (elements.reviewFsrsToggle) {
                elements.reviewFsrsToggle.checked = Boolean(reviewFsrsSettings.enabled);
            }
            setSelectedReviewFsrsPreset(reviewFsrsSettings.preset || 'custom');
            if (elements.reviewFsrsRequestRetention) {
                elements.reviewFsrsRequestRetention.value = String(reviewFsrsSettings.custom.request_retention || 0.9);
            }
            if (elements.reviewFsrsMaximumInterval) {
                elements.reviewFsrsMaximumInterval.value = String(reviewFsrsSettings.custom.maximum_interval || 365);
            }

            applyWebdavPanelVisibility();
            applyGoogleDrivePanelVisibility();
            applyReviewFsrsPanelVisibility();
            clearSyncDirty();
        }

        async function refreshView() {
            await Promise.all([
                loadApiSettings(),
                loadSyncSection()
            ]);
        }

        async function saveSyncSettings() {
            const current = await store.getSyncSettings();
            const reviewFsrsDraft = buildReviewFsrsSettingsFromInputs();
            const validation = validateReviewFsrsSettings(reviewFsrsDraft);
            if (!validation.ok) {
                throw new Error(validation.message);
            }
            const normalizedReviewFsrs = reviewSettingsModule && typeof reviewSettingsModule.normalizeReviewFsrsSettings === 'function'
                ? reviewSettingsModule.normalizeReviewFsrsSettings(reviewFsrsDraft)
                : reviewFsrsDraft;
            const previousClientId = normalizeGoogleDriveClientId(current && current.googleDrive && current.googleDrive.clientId);
            const nextClientId = getEffectiveGoogleDriveClientIdInput();
            const clientIdReady = isGoogleDriveCustomAuthMode()
                ? isGoogleDriveClientIdConfigured(nextClientId)
                : isGoogleDriveClientIdReady(nextClientId);
            const nextSettings = {
                ...(current || {}),
                reviewFsrs: normalizedReviewFsrs,
                webdav: {
                    enabled: elements.webdavToggle.checked,
                    provider: 'nutstore',
                    email: elements.webdavEmail.value.trim(),
                    appPassword: elements.webdavPassword.value.trim(),
                    baseUrl: (current && current.webdav && current.webdav.baseUrl) || '',
                    remotePath: elements.webdavRemotePath.value.trim() || DEFAULT_WEBDAV_REMOTE_PATH
                },
                googleDrive: {
                    ...((current && current.googleDrive) || {}),
                    enabled: clientIdReady && googleDriveAuthConfigured && Boolean(elements.googleDriveToggle && elements.googleDriveToggle.checked),
                    clientId: nextClientId,
                    fileName: (current && current.googleDrive && current.googleDrive.fileName) || 'code-note-helper-full-backup.json'
                }
            };
            await store.setSyncSettings(nextSettings);
            if (previousClientId && previousClientId !== nextClientId && typeof store.disconnectGoogleDrive === 'function') {
                await store.disconnectGoogleDrive();
                showToast('Google Drive 配置已更新，请重新登录并测试', 3200);
            }
            return {
                nextSettings
            };
        }

        window.addEventListener('beforeunload', (event) => {
            if (!syncDirty && !apiDirty) return;
            event.preventDefault();
            event.returnValue = '';
        });

        elements.timelineToggle.addEventListener('change', async () => {
            try {
                await store.setTimelineEnabled(elements.timelineToggle.checked);
                showToast(elements.timelineToggle.checked ? 'AI 时间轴已开启' : 'AI 时间轴已关闭');
                await loadSyncSection();
            } catch (error) {
                console.error('[Options] 保存时间轴设置失败：', error);
                showToast('保存失败，请稍后重试');
            }
        });

        elements.webdavToggle.addEventListener('change', () => {
            applyWebdavPanelVisibility();
            markSyncDirty();
        });

        if (elements.googleDriveToggle) {
            elements.googleDriveToggle.addEventListener('change', () => {
                if (elements.googleDriveToggle.checked && !googleDriveAuthConfigured) {
                    elements.googleDriveToggle.checked = false;
                    applyGoogleDrivePanelVisibility();
                    showToast(googleDriveAuthWarningMessage || '当前 Google Drive 授权配置不可用，请先检查高级授权设置。', 3600);
                    return;
                }
                applyGoogleDrivePanelVisibility();
                markSyncDirty();
            });
        }

        if (elements.googleDriveClientId) {
            elements.googleDriveClientId.addEventListener('input', () => {
                if (elements.googleDriveToggle && isGoogleDriveCustomAuthMode() && !isGoogleDriveClientIdConfigured(getGoogleDriveClientIdInput())) {
                    elements.googleDriveToggle.checked = false;
                }
                applyGoogleDriveAuthState({ configured: isGoogleDriveClientIdConfigured(getGoogleDriveClientIdInput()) });
                applyGoogleDrivePanelVisibility();
                markSyncDirty();
            });
        }

        [elements.googleDriveAuthModeBuiltIn, elements.googleDriveAuthModeCustom].forEach((input) => {
            if (!input) return;
            input.addEventListener('change', async () => {
                applyGoogleDriveAuthModeVisibility();
                const googleDriveAuthStatus = typeof store.getGoogleDriveAuthStatus === 'function'
                    ? await store.getGoogleDriveAuthStatus()
                    : { configured: false };
                applyGoogleDriveAuthState(googleDriveAuthStatus);
                if (elements.googleDriveToggle && isGoogleDriveCustomAuthMode() && !isGoogleDriveClientIdConfigured(getGoogleDriveClientIdInput())) {
                    elements.googleDriveToggle.checked = false;
                }
                applyGoogleDrivePanelVisibility();
                markSyncDirty();
            });
        });

        if (elements.reviewFsrsToggle) {
            elements.reviewFsrsToggle.addEventListener('change', () => {
                applyReviewFsrsPanelVisibility();
                markSyncDirty();
            });
        }

        elements.reviewFsrsPresetOptions.forEach((input) => {
            input.addEventListener('change', () => {
                applyReviewFsrsCustomPanelVisibility();
                markSyncDirty();
            });
        });

        [elements.reviewFsrsRequestRetention, elements.reviewFsrsMaximumInterval].forEach((input) => {
            if (!input) return;
            input.addEventListener('input', () => {
                markSyncDirty();
            });
        });

        [elements.webdavEmail, elements.webdavPassword, elements.webdavRemotePath].forEach((input) => {
            if (!input) return;
            input.addEventListener('input', () => {
                markSyncDirty();
            });
        });

        elements.btnExportJson.addEventListener('click', async () => {
            try {
                const snapshot = await store.exportLocalSnapshot();
                const blob = new Blob([snapshot], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `code-note-helper-backup-${Date.now()}.json`;
                anchor.click();
                URL.revokeObjectURL(url);
                showToast('本地备份已导出');
            } catch (error) {
                console.error('[Options] 导出 JSON 失败：', error);
                showToast('导出失败，请稍后重试');
            }
        });

        elements.btnImportJson.addEventListener('click', () => {
            elements.importJsonFile.click();
        });

        elements.importJsonFile.addEventListener('change', async () => {
            const file = elements.importJsonFile.files && elements.importJsonFile.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                await store.importLocalSnapshot(text);
                await refreshView();
                showToast('本地数据已导入');
            } catch (error) {
                console.error('[Options] 导入 JSON 失败：', error);
                showToast(error.message || '导入失败，请检查文件内容', 2800);
            } finally {
                elements.importJsonFile.value = '';
            }
        });

        elements.btnSaveSync.addEventListener('click', async () => {
            try {
                setBusy(elements.btnSaveSync, true);
                await saveSyncSettings();
                await loadSyncSection();
                clearSyncDirty();
                showToast('同步设置已保存');
            } catch (error) {
                console.error('[Options] 保存同步设置失败：', error);
                showToast(error.message || '保存失败，请稍后重试', 2600);
            } finally {
                setBusy(elements.btnSaveSync, false);
            }
        });

        elements.btnTestWebdav.addEventListener('click', async () => {
            try {
                setBusy(elements.btnTestWebdav, true);
                await saveSyncSettings();
                await store.testNutstoreConnection();
                await loadSyncSection();
                showToast('连接成功，可以开始备份');
            } catch (error) {
                logWebdavFailure('[Options] 测试坚果云提示：', error);
                showToast(formatWebdavErrorMessage(error, 'test'), 3200);
            } finally {
                setBusy(elements.btnTestWebdav, false);
            }
        });

        elements.btnBackupWebdav.addEventListener('click', async () => {
            try {
                setBusy(elements.btnBackupWebdav, true);
                await saveSyncSettings();
                await store.backupToNutstore();
                await loadSyncSection();
                showToast('完整备份已上传到坚果云');
            } catch (error) {
                logWebdavFailure('[Options] 备份到坚果云提示：', error);
                showToast(formatWebdavErrorMessage(error, 'backup'), 3200);
            } finally {
                setBusy(elements.btnBackupWebdav, false);
            }
        });

        elements.btnRestoreWebdav.addEventListener('click', async () => {
            try {
                setBusy(elements.btnRestoreWebdav, true);
                await saveSyncSettings();
                await store.restoreFromNutstore();
                await refreshView();
                showToast('云端数据已恢复到当前浏览器');
            } catch (error) {
                logWebdavFailure('[Options] 从坚果云恢复提示：', error);
                showToast(formatWebdavErrorMessage(error, 'restore'), 3200);
            } finally {
                setBusy(elements.btnRestoreWebdav, false);
            }
        });

        if (elements.btnTestGoogleDrive) {
            elements.btnTestGoogleDrive.addEventListener('click', async () => {
                try {
                    await ensureGoogleDriveRuntimePermissionForUserGesture();
                    setBusy(elements.btnTestGoogleDrive, true);
                    await saveSyncSettings();
                    await store.testGoogleDriveConnection({
                        interactive: true
                    });
                    await loadSyncSection();
                    showToast('Google Drive 授权可用，可以开始备份');
                } catch (error) {
                    console.error('[Options] Google Drive 授权测试失败：', error);
                    showToast(error.message || 'Google Drive 授权失败，请稍后重试', 3600);
                } finally {
                    setBusy(elements.btnTestGoogleDrive, false);
                }
            });
        }

        if (elements.btnBackupGoogleDrive) {
            elements.btnBackupGoogleDrive.addEventListener('click', async () => {
                try {
                    await ensureGoogleDriveRuntimePermissionForUserGesture();
                    setBusy(elements.btnBackupGoogleDrive, true);
                    await saveSyncSettings();
                    await store.backupToGoogleDrive({
                        interactive: true
                    });
                    await loadSyncSection();
                    showToast('完整备份已上传到 Google Drive 的可见备份文件夹');
                } catch (error) {
                    console.error('[Options] 备份到 Google Drive 失败：', error);
                    showToast(error.message || '备份失败，请稍后重试', 3600);
                } finally {
                    setBusy(elements.btnBackupGoogleDrive, false);
                }
            });
        }

        if (elements.btnRestoreGoogleDrive) {
            elements.btnRestoreGoogleDrive.addEventListener('click', async () => {
                try {
                    setBusy(elements.btnRestoreGoogleDrive, true);
                    await saveSyncSettings();
                    await store.restoreFromGoogleDrive({
                        interactive: false
                    });
                    await refreshView();
                    showToast('Google Drive 数据已恢复到当前浏览器');
                } catch (error) {
                    console.error('[Options] 从 Google Drive 恢复失败：', error);
                    showToast(error.message || '恢复失败，请稍后重试', 3600);
                } finally {
                    setBusy(elements.btnRestoreGoogleDrive, false);
                }
            });
        }

        if (elements.btnDisconnectGoogleDrive) {
            elements.btnDisconnectGoogleDrive.addEventListener('click', async () => {
                try {
                    setBusy(elements.btnDisconnectGoogleDrive, true);
                    if (typeof store.disconnectGoogleDrive === 'function') {
                        await store.disconnectGoogleDrive();
                    }
                    await loadSyncSection();
                    showToast('已断开 Google Drive 授权');
                } catch (error) {
                    console.error('[Options] 断开 Google Drive 授权失败：', error);
                    showToast('断开授权失败，请稍后重试', 3000);
                } finally {
                    setBusy(elements.btnDisconnectGoogleDrive, false);
                }
            });
        }

        elements.btnSaveApi.addEventListener('click', async () => {
            try {
                const apiUrl = elements.apiUrl.value.trim();
                if (!apiUrl) {
                    showToast('请先填写 API Base URL');
                    elements.apiUrl.focus();
                    return;
                }

                if (!permissionHelper || typeof permissionHelper.ensureApiDomainPermission !== 'function') {
                    showToast('权限模块未加载，请刷新后重试');
                    return;
                }
                const permissionResult = await permissionHelper.ensureApiDomainPermission(apiUrl, {
                    requestIfMissing: true
                });
                if (!permissionResult.ok) {
                    showToast(permissionResult.message || '未授予该 API 服务的访问权限，API 配置暂未保存。', 3200);
                    return;
                }

                await chrome.storage.local.set({
                    api_url: apiUrl,
                    api_key: elements.apiKey.value.trim(),
                    api_model: elements.apiModel.value.trim() || 'gpt-4o'
                });
                if (elements.overwriteConfirmToggle) {
                    const overwriteConfirmEnabled = Boolean(elements.overwriteConfirmToggle.checked);
                    if (permissionHelper && typeof permissionHelper.setOverwriteConfirmEnabled === 'function') {
                        await permissionHelper.setOverwriteConfirmEnabled(overwriteConfirmEnabled);
                    } else {
                        await chrome.storage.local.set({
                            note_helper_overwrite_confirm_enabled: overwriteConfirmEnabled
                        });
                    }
                }
                clearApiDirty();
                showToast('API 配置已保存');
            } catch (error) {
                console.error('[Options] 保存 API 配置失败：', error);
                showToast('保存失败，请稍后重试');
            }
        });

        elements.btnResetApi.addEventListener('click', () => {
            elements.apiUrl.value = 'https://api.openai.com/v1';
            elements.apiKey.value = '';
            elements.apiModel.value = 'gpt-4o';
            markApiDirty();
            showToast('已恢复默认 API 配置，请点击“保存 API 配置”后生效');
        });

        [elements.apiUrl, elements.apiKey, elements.apiModel].forEach((input) => {
            input.addEventListener('input', () => {
                markApiDirty();
            });
        });

        if (elements.overwriteConfirmToggle) {
            elements.overwriteConfirmToggle.addEventListener('change', () => {
                markApiDirty();
            });
        }

        try {
            await refreshView();
        } catch (error) {
            console.error('[Options] 初始化失败：', error);
            showToast('设置页初始化失败，请刷新页面', 2600);
        }
    });
})();
