/**
 * API 域名权限工具
 * 版本：1.0.90
 */

(function () {
    'use strict';

    const STORAGE_KEYS = {
        overwriteConfirmEnabled: 'note_helper_overwrite_confirm_enabled'
    };

    function getRuntime() {
        if (typeof chrome === 'undefined') return null;
        return chrome.runtime || null;
    }

    function getPermissionsApi() {
        if (typeof chrome === 'undefined') return null;
        return chrome.permissions || null;
    }

    function getStorageApi() {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return null;
        return chrome.storage.local;
    }

    function ensureHttpsUrl(rawUrl) {
        const value = String(rawUrl || '').trim();
        if (!value) {
            return {
                ok: false,
                reason: 'empty_url',
                message: '接口地址不能为空，请先填写 API Base URL。'
            };
        }

        let parsed;
        try {
            parsed = new URL(value);
        } catch (error) {
            return {
                ok: false,
                reason: 'invalid_url',
                message: 'API Base URL 格式不正确，请填写完整的 HTTPS 地址。'
            };
        }

        if (parsed.protocol !== 'https:') {
            return {
                ok: false,
                reason: 'non_https',
                message: 'API Base URL 仅支持 HTTPS 地址，请检查后再保存。'
            };
        }

        return {
            ok: true,
            parsed
        };
    }

    function normalizeOriginPattern(rawUrl) {
        const validation = ensureHttpsUrl(rawUrl);
        if (!validation.ok) return validation;
        const origin = validation.parsed.origin;
        const pattern = `${origin}/*`;
        return {
            ok: true,
            origin,
            hostname: validation.parsed.hostname,
            pattern
        };
    }

    async function containsByRuntime(pattern) {
        const runtime = getRuntime();
        if (!runtime || typeof runtime.sendMessage !== 'function') {
            const error = new Error('runtime_unavailable');
            error.code = 'runtime_unavailable';
            throw error;
        }
        let response;
        try {
            response = await runtime.sendMessage({
                type: 'CHECK_API_DOMAIN_PERMISSION',
                pattern
            });
        } catch (error) {
            const wrapped = new Error(error && error.message ? error.message : String(error));
            wrapped.code = /Extension context invalidated/i.test(wrapped.message)
                ? 'runtime_context_invalidated'
                : 'runtime_send_failed';
            throw wrapped;
        }
        if (response && response.error) {
            const error = new Error(String(response.error));
            error.code = response.errorType || 'runtime_error';
            throw error;
        }
        if (!response || typeof response.granted !== 'boolean') {
            const error = new Error('runtime_invalid_response');
            error.code = 'runtime_invalid_response';
            throw error;
        }
        return response.granted;
    }

    async function requestByRuntime(pattern) {
        const runtime = getRuntime();
        if (!runtime || typeof runtime.sendMessage !== 'function') {
            const error = new Error('runtime_unavailable');
            error.code = 'runtime_unavailable';
            throw error;
        }
        let response;
        try {
            response = await runtime.sendMessage({
                type: 'REQUEST_API_DOMAIN_PERMISSION',
                pattern
            });
        } catch (error) {
            const wrapped = new Error(error && error.message ? error.message : String(error));
            wrapped.code = /Extension context invalidated/i.test(wrapped.message)
                ? 'runtime_context_invalidated'
                : 'runtime_send_failed';
            throw wrapped;
        }
        if (response && response.error) {
            const error = new Error(String(response.error));
            error.code = response.errorType || 'runtime_error';
            throw error;
        }
        if (!response || typeof response.granted !== 'boolean') {
            const error = new Error('runtime_invalid_response');
            error.code = 'runtime_invalid_response';
            throw error;
        }
        return response.granted;
    }

    async function containsPermission(pattern) {
        const permissionsApi = getPermissionsApi();
        if (permissionsApi && typeof permissionsApi.contains === 'function') {
            return permissionsApi.contains({ origins: [pattern] });
        }
        return containsByRuntime(pattern);
    }

    async function requestPermission(pattern) {
        const permissionsApi = getPermissionsApi();
        if (permissionsApi && typeof permissionsApi.request === 'function') {
            return permissionsApi.request({ origins: [pattern] });
        }
        return requestByRuntime(pattern);
    }

    function normalizePermissionErrorReason(error, fallbackReason) {
        const code = String(error && (error.code || error.message) || '').trim();
        if (code === 'runtime_unavailable' || code === 'runtime_context_invalidated') {
            return 'runtime_unavailable';
        }
        return fallbackReason;
    }

    async function ensureApiDomainPermission(rawUrl, options = {}) {
        const requestIfMissing = options.requestIfMissing !== false;
        const normalized = normalizeOriginPattern(rawUrl);
        if (!normalized.ok) {
            return normalized;
        }

        const { pattern } = normalized;
        let hasPermission = false;
        try {
            hasPermission = await containsPermission(pattern);
        } catch (error) {
            const reason = normalizePermissionErrorReason(error, 'contains_failed');
            return {
                ok: false,
                pattern,
                reason,
                message: reason === 'runtime_unavailable'
                    ? '扩展上下文已失效，请刷新当前页面后重试。'
                    : '无法检查该域名的权限状态，请稍后重试。'
            };
        }

        if (hasPermission) {
            return {
                ok: true,
                pattern,
                alreadyGranted: true,
                requested: false
            };
        }

        if (!requestIfMissing) {
            return {
                ok: false,
                pattern,
                reason: 'missing_permission',
                message: '当前未授予该 API 域名权限。'
            };
        }

        let granted = false;
        try {
            granted = await requestPermission(pattern);
        } catch (error) {
            const reason = normalizePermissionErrorReason(error, 'request_failed');
            return {
                ok: false,
                pattern,
                reason,
                message: reason === 'runtime_unavailable'
                    ? '扩展上下文已失效，请刷新当前页面后重试。'
                    : '没有完成网络访问授权，请再次点击保存，并在浏览器弹窗中选择允许。'
            };
        }

        if (granted === false) {
            return {
                ok: false,
                pattern,
                reason: 'denied',
                message: '未授予该 API 服务的访问权限，API 配置暂未保存。'
            };
        }

        if (granted !== true) {
            return {
                ok: false,
                pattern,
                reason: 'request_failed',
                message: '没有完成网络访问授权，请再次点击保存，并在浏览器弹窗中选择允许。'
            };
        }

        return {
            ok: true,
            pattern,
            alreadyGranted: false,
            requested: true
        };
    }

    async function getOverwriteConfirmEnabled(defaultValue = true) {
        const storageApi = getStorageApi();
        if (!storageApi) return Boolean(defaultValue);
        const data = await storageApi.get([STORAGE_KEYS.overwriteConfirmEnabled]);
        if (typeof data[STORAGE_KEYS.overwriteConfirmEnabled] !== 'boolean') {
            return Boolean(defaultValue);
        }
        return data[STORAGE_KEYS.overwriteConfirmEnabled];
    }

    async function setOverwriteConfirmEnabled(enabled) {
        const storageApi = getStorageApi();
        if (!storageApi) return;
        await storageApi.set({
            [STORAGE_KEYS.overwriteConfirmEnabled]: Boolean(enabled)
        });
    }

    window.NoteHelperApiDomainPermission = {
        STORAGE_KEYS,
        normalizeOriginPattern,
        ensureApiDomainPermission,
        getOverwriteConfirmEnabled,
        setOverwriteConfirmEnabled
    };
})();
