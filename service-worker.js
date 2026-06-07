/**
 * 后台 Service Worker
 * 版本：1.1.4
 */

const CODE_NOTE_AUTO_SYNC_ALARM_NAME = 'code-note-helper-auto-sync';
const CODE_NOTE_SYNC_META_KEY = 'note_helper_sync_meta_v1';
const CODE_NOTE_SYNC_SETTINGS_KEY = 'note_helper_sync_settings_v1';
const CODE_NOTE_AUTO_SYNC_INTERVAL_MS = 3 * 60 * 1000;
let problemDataApiReadyPromise = null;

if (!globalThis.window) {
    globalThis.window = globalThis;
}

importScripts(
    'shared/problem-data/constants.js',
    'shared/problem-data/helpers.js',
    'shared/problem-data/sync-core.js',
    'shared/problem-data/providers/nutstore-webdav.js',
    'shared/problem-data/providers/google-drive.js',
    'shared/problem-data/index.js'
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch((error) => {
            console.error('[Service Worker] 消息处理失败：', error);
            sendResponse({
                error: error && error.message ? error.message : String(error),
                errorType: error && error.errorType ? error.errorType : 'runtime'
            });
        });
    return true;
});

if (chrome.alarms && chrome.alarms.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (!alarm || alarm.name !== CODE_NOTE_AUTO_SYNC_ALARM_NAME) return;
        runBackgroundAutoSync()
            .catch((error) => {
                console.error('[Service Worker] 后台自动同步失败：', error);
            });
    });
}

if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        const metaChange = changes[CODE_NOTE_SYNC_META_KEY];
        const oldRevision = Number(metaChange && metaChange.oldValue && metaChange.oldValue.localRevision || 0);
        const newRevision = Number(metaChange && metaChange.newValue && metaChange.newValue.localRevision || 0);
        const localRevisionChanged = Boolean(metaChange && newRevision !== oldRevision);
        if (localRevisionChanged || changes[CODE_NOTE_SYNC_SETTINGS_KEY]) {
            scheduleBackgroundAutoSyncIfNeeded()
                .catch((error) => {
                    console.error('[Service Worker] 自动同步调度失败：', error);
                });
        }
    });
}

if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
        scheduleBackgroundAutoSyncIfNeeded()
            .catch((error) => {
                console.error('[Service Worker] 启动后自动同步调度失败：', error);
            });
    });
}

if (chrome.runtime.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => {
        scheduleBackgroundAutoSyncIfNeeded()
            .catch((error) => {
                console.error('[Service Worker] 安装后自动同步调度失败：', error);
            });
    });
}

async function handleMessage(message, sender) {
    const { type } = message || {};

    switch (type) {
        case 'FETCH_REQUEST':
            return handleFetchRequest(message);
        case 'CHECK_API_DOMAIN_PERMISSION':
            return handleCheckApiDomainPermission(message);
        case 'REQUEST_API_DOMAIN_PERMISSION':
            return handleRequestApiDomainPermission(message);
        case 'OPEN_TAB':
            return handleOpenTab(message);
        case 'GET_MONACO_CODE':
            return handleGetMonacoCode(sender.tab?.id);
        case 'GET_STORAGE':
            return handleGetStorage(message.keys);
        case 'SET_STORAGE':
            return handleSetStorage(message.data);
        case 'WEBDAV_REQUEST':
            return handleWebdavRequest(message);
        case 'GOOGLE_DRIVE_AUTHORIZE':
            return handleGoogleDriveAuthorize(message);
        case 'GET_GOOGLE_DRIVE_AUTH_STATUS':
            return getGoogleDriveAuthStatus();
        case 'GOOGLE_DRIVE_REQUEST':
            return handleGoogleDriveRequest(message);
        case 'GOOGLE_DRIVE_REVOKE':
            return handleGoogleDriveRevoke(message);
        case 'SCHEDULE_AUTO_SYNC':
            await scheduleBackgroundAutoSyncIfNeeded();
            return { success: true };
        default:
            throw new Error(`未知消息类型：${type}`);
    }
}

const GOOGLE_DRIVE_SYNC_SETTINGS_KEY = 'note_helper_sync_settings_v1';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

async function readLocalStorageValues(keys) {
    return chrome.storage.local.get(keys);
}

function isProviderEnabled(settings) {
    const syncSettings = settings && typeof settings === 'object' ? settings : {};
    return Boolean(
        syncSettings.webdav && syncSettings.webdav.enabled ||
        syncSettings.googleDrive && syncSettings.googleDrive.enabled
    );
}

function hasUnsyncedProvider(meta, settings) {
    if (!meta || !settings || !isProviderEnabled(settings)) return false;
    const localRevision = Number(meta.localRevision || 0);
    const syncedRevision = meta.syncedRevision || {};
    if (settings.webdav && settings.webdav.enabled && localRevision > Number(syncedRevision.webdav || 0)) {
        return true;
    }
    if (settings.googleDrive && settings.googleDrive.enabled && localRevision > Number(syncedRevision.googleDrive || 0)) {
        return true;
    }
    return false;
}

async function scheduleBackgroundAutoSyncIfNeeded() {
    if (!chrome.alarms || typeof chrome.alarms.create !== 'function') return;
    const storage = await readLocalStorageValues([
        CODE_NOTE_SYNC_META_KEY,
        CODE_NOTE_SYNC_SETTINGS_KEY
    ]);
    const meta = storage[CODE_NOTE_SYNC_META_KEY] || {};
    const settings = storage[CODE_NOTE_SYNC_SETTINGS_KEY] || {};

    if (!hasUnsyncedProvider(meta, settings)) {
        await chrome.alarms.clear(CODE_NOTE_AUTO_SYNC_ALARM_NAME);
        return;
    }

    await chrome.alarms.create(CODE_NOTE_AUTO_SYNC_ALARM_NAME, {
        when: Date.now() + CODE_NOTE_AUTO_SYNC_INTERVAL_MS
    });
}

async function ensureProblemDataApiForServiceWorker() {
    if (problemDataApiReadyPromise) return problemDataApiReadyPromise;
    problemDataApiReadyPromise = (async () => {
        const modules = globalThis.NoteHelperProblemDataModules || {};
        if (modules.helpers) {
            modules.helpers.sendRuntimeMessage = async (type, data) => handleMessage({
                type,
                ...(data || {})
            }, {});
        }
        if (typeof modules.createApi !== 'function') {
            throw new Error('自动同步模块未准备完成');
        }
        return modules.createApi();
    })();
    return problemDataApiReadyPromise;
}

async function runBackgroundAutoSync() {
    const storage = await readLocalStorageValues([
        CODE_NOTE_SYNC_META_KEY,
        CODE_NOTE_SYNC_SETTINGS_KEY
    ]);
    const meta = storage[CODE_NOTE_SYNC_META_KEY] || {};
    const settings = storage[CODE_NOTE_SYNC_SETTINGS_KEY] || {};
    if (!hasUnsyncedProvider(meta, settings)) {
        await chrome.alarms.clear(CODE_NOTE_AUTO_SYNC_ALARM_NAME);
        return {
            skipped: true,
            reason: 'no-local-change'
        };
    }

    const problemDataApi = await ensureProblemDataApiForServiceWorker();
    if (!problemDataApi || typeof problemDataApi.runUnifiedSyncNow !== 'function') {
        throw new Error('自动同步入口未准备完成');
    }
    return problemDataApi.runUnifiedSyncNow({
        silent: true,
        reason: 'auto-alarm',
        source: 'service-worker-alarm'
    });
}

async function ensureGoogleDriveRuntimePermissions(options = {}) {
    const interactive = options.interactive !== false;
    const permissions = ['identity'];
    const origins = [
        'https://www.googleapis.com/*',
        'https://oauth2.googleapis.com/*'
    ];
    if (!interactive) {
        const granted = await chrome.permissions.contains({
            permissions,
            origins
        });
        if (!granted) {
            const error = new Error('Google Drive 需要重新登录。请到设置页点击“登录并测试”，或手动点击“立即备份到 Google Drive”完成授权。');
            error.errorType = 'auth-required';
            throw error;
        }
        return;
    }
    const granted = await chrome.permissions.request({
        permissions,
        origins
    });
    if (!granted) {
        const error = new Error('你取消了 Google Drive 授权，备份不会上传。');
        error.errorType = 'permission_denied';
        throw error;
    }
}

function normalizeGoogleDriveClientId(clientId) {
    return String(clientId || '').trim();
}

function validateGoogleDriveClientId(clientId) {
    const value = normalizeGoogleDriveClientId(clientId);
    if (!value || value.includes('REPLACE_WITH_') || value.includes('{0}')) {
        const error = new Error('请先在设置页填写 Google OAuth Client ID。');
        error.errorType = 'auth_config';
        throw error;
    }
    // Google OAuth Client ID 的公开格式稳定以此结尾；只做防误填，不替代 Google 授权结果。
    if (!value.endsWith('.apps.googleusercontent.com')) {
        const error = new Error('请确认填写的是 Google OAuth Client ID。');
        error.errorType = 'auth_config';
        throw error;
    }
    return value;
}

async function readGoogleDriveClientIdFromSettings() {
    const storage = await chrome.storage.local.get(GOOGLE_DRIVE_SYNC_SETTINGS_KEY);
    const settings = storage && storage[GOOGLE_DRIVE_SYNC_SETTINGS_KEY] || {};
    return normalizeGoogleDriveClientId(settings.googleDrive && settings.googleDrive.clientId);
}

async function getGoogleDriveOAuthConfig(message = {}) {
    const clientId = validateGoogleDriveClientId(message.clientId || await readGoogleDriveClientIdFromSettings());
    return {
        clientId,
        scope: GOOGLE_DRIVE_SCOPE
    };
}

async function getGoogleDriveAuthStatus() {
    try {
        const config = await getGoogleDriveOAuthConfig();
        return {
            configured: true,
            scope: config.scope
        };
    } catch (error) {
        return {
            configured: false,
            message: error && error.message ? error.message : '请先在设置页填写 Google OAuth Client ID。'
        };
    }
}

function parseGoogleDriveOAuthRedirect(redirectUrl) {
    if (!redirectUrl) {
        const error = new Error('Google Drive 授权未完成，请稍后重试');
        error.errorType = 'auth';
        throw error;
    }

    const url = new URL(redirectUrl);
    const hashParams = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
    const queryParams = new URLSearchParams(String(url.search || '').replace(/^\?/, ''));
    const oauthError = hashParams.get('error') || queryParams.get('error');
    if (oauthError) {
        const detail = hashParams.get('error_description') || queryParams.get('error_description') || oauthError;
        const error = new Error(detail);
        error.errorType = oauthError === 'access_denied' ? 'permission_denied' : 'auth';
        throw error;
    }

    const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
    if (!accessToken) {
        const error = new Error('Google Drive 授权未完成，请稍后重试');
        error.errorType = 'auth';
        throw error;
    }

    const expiresIn = Number(hashParams.get('expires_in') || queryParams.get('expires_in') || 3600);
    return {
        accessToken,
        expiresAt: Date.now() + Math.max(1, expiresIn) * 1000
    };
}

async function handleGoogleDriveAuthorize(message = {}) {
    const interactive = message.interactive !== false;
    await ensureGoogleDriveRuntimePermissions({
        interactive
    });

    const { clientId, scope } = await getGoogleDriveOAuthConfig(message);
    const redirectUri = chrome.identity.getRedirectURL('google-drive');
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('prompt', interactive ? 'consent' : 'none');

    try {
        const redirectUrl = await chrome.identity.launchWebAuthFlow({
            url: authUrl.toString(),
            interactive
        });
        return parseGoogleDriveOAuthRedirect(redirectUrl);
    } catch (error) {
        if (error && error.errorType) {
            throw error;
        }
        const wrapped = new Error(interactive
            ? `Google Drive 授权未完成：${error && error.message ? error.message : String(error)}`
            : 'Google Drive 需要重新登录。请到设置页点击“登录并测试”，或手动点击“立即备份到 Google Drive”完成授权。');
        wrapped.errorType = interactive ? 'auth' : 'auth-required';
        throw wrapped;
    }
}

async function handleGoogleDriveRequest({
    method = 'GET',
    url,
    headers = {},
    body = null
}) {
    if (!url || !String(url).startsWith('https://www.googleapis.com/')) {
        return {
            ok: false,
            status: 0,
            statusText: '',
            headers: {},
            data: '',
            errorType: 'validation',
            errorMessage: 'Google Drive 请求地址无效'
        };
    }

    try {
        const response = await fetch(url, {
            method: String(method || 'GET').toUpperCase(),
            headers: normalizeHeaders(headers),
            body
        });
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : await response.text();
        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            statusText: '',
            headers: {},
            data: '',
            errorType: classifyWebdavError(error).errorType,
            errorMessage: error && error.message ? error.message : String(error)
        };
    }
}

async function handleGoogleDriveRevoke({ accessToken }) {
    const token = String(accessToken || '').trim();
    if (!token) return { success: true, skipped: true };
    try {
        if (chrome.identity && typeof chrome.identity.removeCachedAuthToken === 'function') {
            await chrome.identity.removeCachedAuthToken({
                token
            });
        }
        const response = await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `token=${encodeURIComponent(token)}`
        });
        return {
            success: response.ok,
            status: response.status
        };
    } catch (error) {
        return {
            success: false,
            error: error && error.message ? error.message : String(error)
        };
    }
}

function normalizeApiPermissionPattern(pattern) {
    const value = String(pattern || '').trim();
    if (!value) {
        const error = new Error('缺少 API 域名权限模式');
        error.errorType = 'permission_validation';
        throw error;
    }
    if (!value.startsWith('https://') || !value.endsWith('/*')) {
        const error = new Error('API 域名权限模式无效，仅支持 https://host/*');
        error.errorType = 'permission_validation';
        throw error;
    }
    return value;
}

async function handleCheckApiDomainPermission({ pattern }) {
    try {
        const normalizedPattern = normalizeApiPermissionPattern(pattern);
        const granted = await chrome.permissions.contains({
            origins: [normalizedPattern]
        });
        return { granted };
    } catch (error) {
        if (error && error.errorType) throw error;
        const wrapped = new Error(`API 域名权限检查失败：${error && error.message ? error.message : String(error)}`);
        wrapped.errorType = 'permission_check';
        throw wrapped;
    }
}

async function handleRequestApiDomainPermission({ pattern }) {
    try {
        const normalizedPattern = normalizeApiPermissionPattern(pattern);
        const granted = await chrome.permissions.request({
            origins: [normalizedPattern]
        });
        return { granted };
    } catch (error) {
        if (error && error.errorType) throw error;
        const wrapped = new Error(`API 域名权限申请失败：${error && error.message ? error.message : String(error)}`);
        wrapped.errorType = 'permission_request';
        throw wrapped;
    }
}

async function handleFetchRequest({ url, options = {} }) {
    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body
        });

        if (options.stream) {
            const text = await response.text();
            return {
                ok: response.ok,
                status: response.status,
                data: text
            };
        }

        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : await response.text();

        return {
            ok: response.ok,
            status: response.status,
            data
        };
    } catch (error) {
        throw new Error(`Fetch 失败：${error.message}`);
    }
}

function classifyWebdavError(error) {
    if (!error) {
        return {
            errorType: 'unknown',
            errorMessage: '未知错误'
        };
    }

    if (error.name === 'AbortError') {
        return {
            errorType: 'timeout',
            errorMessage: '请求超时'
        };
    }

    const message = String(error.message || error).trim();
    if (/ERR_CERT|SSL|CERTIFICATE|证书/i.test(message)) {
        return {
            errorType: 'ssl',
            errorMessage: message
        };
    }

    if (/Failed to fetch|NetworkError|ERR_CONNECTION|ERR_INTERNET|ERR_NAME_NOT_RESOLVED|ERR_NETWORK/i.test(message)) {
        return {
            errorType: 'network',
            errorMessage: message
        };
    }

    return {
        errorType: 'unknown',
        errorMessage: message || '未知错误'
    };
}

function normalizeWebdavMethod(method) {
    const value = String(method || 'GET').trim().toUpperCase();
    return value || 'GET';
}

function normalizeHeaders(headers) {
    const source = headers && typeof headers === 'object' ? headers : {};
    const result = {};
    Object.keys(source).forEach((key) => {
        const value = source[key];
        if (value === undefined || value === null) return;
        result[key] = String(value);
    });
    return result;
}

async function handleWebdavRequest({
    method = 'GET',
    url,
    headers = {},
    body,
    timeout = 15000,
    methodOverride = ''
}) {
    if (!url) {
        return {
            ok: false,
            status: 0,
            statusText: '',
            headers: {},
            data: '',
            errorType: 'validation',
            errorMessage: '缺少 WebDAV 请求地址'
        };
    }

    const normalizedTimeout = Number(timeout) > 0 ? Number(timeout) : 15000;
    const normalizedMethod = normalizeWebdavMethod(method);
    const normalizedHeaders = normalizeHeaders(headers);
    const overrideValue = String(methodOverride || '').trim().toUpperCase();

    const fetchMethod = overrideValue ? 'POST' : normalizedMethod;
    if (overrideValue) {
        normalizedHeaders['X-HTTP-Method-Override'] = overrideValue;
        normalizedHeaders['X-Method-Override'] = overrideValue;
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), normalizedTimeout);

        const response = await fetch(url, {
            method: fetchMethod,
            headers: normalizedHeaders,
            body,
            signal: controller.signal
        });

        clearTimeout(timer);

        const data = await response.text();
        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data,
            request: {
                method: fetchMethod,
                originalMethod: normalizedMethod,
                methodOverride: overrideValue || null,
                timeout: normalizedTimeout
            }
        };
    } catch (error) {
        const classified = classifyWebdavError(error);
        return {
            ok: false,
            status: 0,
            statusText: '',
            headers: {},
            data: '',
            errorType: classified.errorType,
            errorMessage: classified.errorMessage,
            request: {
                method: fetchMethod,
                originalMethod: normalizedMethod,
                methodOverride: overrideValue || null,
                timeout: normalizedTimeout
            }
        };
    }
}

async function handleOpenTab({ url, active = true }) {
    const tab = await chrome.tabs.create({ url, active });
    return { tabId: tab.id };
}

async function handleGetMonacoCode(tabId) {
    if (!tabId) {
        throw new Error('无法获取标签页 ID');
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
                try {
                    if (window.monaco && window.monaco.editor) {
                        const models = window.monaco.editor.getModels();
                        if (models && models.length > 0) {
                            const validModel = models.reverse().find((model) => model.getValue().trim().length > 0);
                            if (validModel) {
                                return { success: true, code: validModel.getValue() };
                            }
                            return { success: true, code: models[0].getValue() };
                        }
                    }
                    return { success: false, error: 'Monaco 编辑器未找到' };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }
        });

        if (results && results[0] && results[0].result) {
            return results[0].result;
        }

        return { success: false, error: '脚本执行后没有拿到结果' };
    } catch (error) {
        throw new Error(`获取 Monaco 代码失败：${error.message}`);
    }
}

async function handleGetStorage(keys) {
    return chrome.storage.local.get(keys);
}

async function handleSetStorage(data) {
    await chrome.storage.local.set(data);
    return { success: true };
}

const TIMELINE_PATTERNS = [
    'https://gemini.google.com/*',
    'https://chatgpt.com/*',
    'https://gpt.aimonkey.plus/*',
    'https://c.aimonkey.plus/*',
    'https://claude.ai/*'
];

const injectedTabs = new Map();

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        const shouldInject = TIMELINE_PATTERNS.some((pattern) => {
            const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
            return regex.test(tab.url);
        });

        if (!shouldInject) {
            return;
        }

        const lastUrl = injectedTabs.get(tabId);
        if (lastUrl !== tab.url) {
            injectedTabs.set(tabId, tab.url);
            setTimeout(() => {
                injectTimelineScript(tabId);
            }, 500);
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    injectedTabs.delete(tabId);
});

async function injectTimelineScript(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                if (window.__AI_TIMELINE_INJECTED__) {
                    window.dispatchEvent(new CustomEvent('ai-timeline-reinit'));
                }
            }
        });
    } catch (error) {
        console.warn('[Service Worker] 时间轴补注入失败：', error.message);
    }
}

console.log('[Service Worker] 已启动');

