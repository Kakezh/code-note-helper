/**
 * 后台 Service Worker
 * 版本：1.1.3
 */

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
        default:
            throw new Error(`未知消息类型：${type}`);
    }
}

async function ensureGoogleDriveRuntimePermissions() {
    const permissions = ['identity'];
    const origins = [
        'https://www.googleapis.com/*',
        'https://oauth2.googleapis.com/*'
    ];
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

function getGoogleDriveOAuthConfig() {
    const manifest = chrome.runtime.getManifest ? chrome.runtime.getManifest() : {};
    const oauth2 = manifest.oauth2 || {};
    const clientId = String(oauth2.client_id || '').trim();
    const scopes = Array.isArray(oauth2.scopes) && oauth2.scopes.length
        ? oauth2.scopes
        : ['https://www.googleapis.com/auth/drive.appdata'];

    if (!clientId || clientId.includes('REPLACE_WITH_') || clientId.includes('{0}')) {
        const error = new Error('当前版本暂时不能使用 Google Drive 登录，请先使用本地 JSON 或坚果云备份。');
        error.errorType = 'auth_config';
        throw error;
    }

    return {
        clientId,
        scope: scopes.join(' ')
    };
}

function getGoogleDriveAuthStatus() {
    try {
        const config = getGoogleDriveOAuthConfig();
        return {
            configured: true,
            scope: config.scope
        };
    } catch (error) {
        return {
            configured: false,
            message: '当前版本暂时不能使用 Google Drive 登录，请先使用本地 JSON 或坚果云备份。'
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

async function handleGoogleDriveAuthorize() {
    await ensureGoogleDriveRuntimePermissions();

    const { clientId, scope } = getGoogleDriveOAuthConfig();
    const redirectUri = chrome.identity.getRedirectURL('google-drive');
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('prompt', 'consent');

    try {
        const redirectUrl = await chrome.identity.launchWebAuthFlow({
            url: authUrl.toString(),
            interactive: true
        });
        return parseGoogleDriveOAuthRedirect(redirectUrl);
    } catch (error) {
        if (error && error.errorType) {
            throw error;
        }
        const wrapped = new Error(`Google Drive 授权未完成：${error && error.message ? error.message : String(error)}`);
        wrapped.errorType = 'auth';
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

