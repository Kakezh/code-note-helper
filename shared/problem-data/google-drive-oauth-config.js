/**
 * Google Drive OAuth 配置
 * 版本：1.1.4
 */

(function () {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const modules = root.NoteHelperProblemDataModules = root.NoteHelperProblemDataModules || {};

    const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
    const RELEASE_EXTENSION_ID = 'kimmpnikdpgdecieafahiekobhcmckoa';
    const CURRENT_DEV_EXTENSION_ID = 'dphinnngjhhgmabdjeecajealghipkbj';
    const LEGACY_DEV_EXTENSION_ID = 'nfcpikidobapnnnahapgpokkjnidemij';
    const RELEASE_CLIENT_ID = '425918521606-6k5p5fj6nivrblrdtu0olbuek46qv5gu.apps.googleusercontent.com';
    const CURRENT_DEV_CLIENT_ID = '425918521606-hr2pm8tufp1u312frkostm2gtg71qniu.apps.googleusercontent.com';
    const LEGACY_DEV_CLIENT_ID = '425918521606-q9rto68s4maaapjfb4m9qgldtc87dd81.apps.googleusercontent.com';

    function createClientMap() {
        const map = {};
        [
            [CURRENT_DEV_EXTENSION_ID, CURRENT_DEV_CLIENT_ID],
            [LEGACY_DEV_EXTENSION_ID, LEGACY_DEV_CLIENT_ID],
            [RELEASE_EXTENSION_ID, RELEASE_CLIENT_ID]
        ].forEach(([extensionId, clientId]) => {
            if (extensionId && clientId) {
                map[extensionId] = clientId;
            }
        });
        return Object.freeze(map);
    }

    const CLIENTS_BY_EXTENSION_ID = createClientMap();

    function normalizeClientId(value) {
        return String(value || '').trim();
    }

    function isValidClientId(value) {
        const clientId = normalizeClientId(value);
        return Boolean(clientId &&
            !clientId.includes('REPLACE_WITH_') &&
            !clientId.includes('{0}') &&
            clientId.endsWith('.apps.googleusercontent.com'));
    }

    function getRuntimeId() {
        try {
            return String(root.chrome && root.chrome.runtime && root.chrome.runtime.id || '').trim();
        } catch (error) {
            return '';
        }
    }

    function isEdgeRuntime() {
        const userAgent = String(root.navigator && root.navigator.userAgent || '').toLowerCase();
        return userAgent.includes(' edg/') || userAgent.includes(' edge/');
    }

    function getManifestClientId() {
        try {
            const manifest = root.chrome &&
                root.chrome.runtime &&
                typeof root.chrome.runtime.getManifest === 'function'
                ? root.chrome.runtime.getManifest()
                : null;
            return normalizeClientId(manifest && manifest.oauth2 && manifest.oauth2.client_id);
        } catch (error) {
            return '';
        }
    }

    function resolveBuiltInClient(runtimeId = getRuntimeId()) {
        const normalizedRuntimeId = String(runtimeId || '').trim();
        let clientId = CLIENTS_BY_EXTENSION_ID[normalizedRuntimeId] || '';
        let source = clientId ? 'built-in' : 'missing';
        if (!clientId && !isEdgeRuntime()) {
            const manifestClientId = getManifestClientId();
            if (isValidClientId(manifestClientId)) {
                clientId = manifestClientId;
                source = 'manifest';
            }
        }
        return {
            runtimeId: normalizedRuntimeId,
            clientId,
            configured: Boolean(clientId),
            scope: GOOGLE_DRIVE_SCOPE,
            source
        };
    }

    function resolveClientId({ runtimeId = getRuntimeId(), overrideClientId = '' } = {}) {
        const override = normalizeClientId(overrideClientId);
        if (override) {
            return {
                runtimeId: String(runtimeId || '').trim(),
                clientId: override,
                configured: isValidClientId(override),
                source: 'advanced',
                scope: GOOGLE_DRIVE_SCOPE
            };
        }
        const builtIn = resolveBuiltInClient(runtimeId);
        return {
            ...builtIn,
            source: builtIn.source || (builtIn.configured ? 'built-in' : 'missing')
        };
    }

    modules.oauthConfig = {
        GOOGLE_DRIVE_SCOPE,
        RELEASE_EXTENSION_ID,
        CURRENT_DEV_EXTENSION_ID,
        LEGACY_DEV_EXTENSION_ID,
        RELEASE_CLIENT_ID,
        CURRENT_DEV_CLIENT_ID,
        LEGACY_DEV_CLIENT_ID,
        CLIENTS_BY_EXTENSION_ID,
        normalizeClientId,
        isValidClientId,
        getRuntimeId,
        isEdgeRuntime,
        getManifestClientId,
        resolveBuiltInClient,
        resolveClientId
    };
})();
