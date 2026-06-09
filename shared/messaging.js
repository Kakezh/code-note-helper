/**
 * 消息通信封装
 * 内容脚本与 Service Worker 通信
 */

const Messaging = {
    _recoverableRuntimeNotified: false,

    _getRecoverableRuntimeCode(error) {
        const message = String(error && error.message || error || '').toLowerCase();
        if (message.includes('extension context invalidated')) {
            return 'context_invalidated';
        }
        if (message.includes('message channel closed before a response was received')) {
            return 'channel_closed';
        }
        if (message.includes('message port closed before a response was received')) {
            return 'port_closed';
        }
        if (message.includes('receiving end does not exist')) {
            return 'receiving_end_missing';
        }
        return '';
    },

    _normalizeError(error) {
        if (error instanceof Error) {
            return error;
        }
        return new Error(String(error || '未知消息错误'));
    },

    isRecoverableRuntimeError(error) {
        return Boolean(this._getRecoverableRuntimeCode(error));
    },

    isExpectedSilentGoogleDriveAuthRequired(type, data, error) {
        return Boolean(
            type === 'GOOGLE_DRIVE_AUTHORIZE' &&
            data &&
            data.interactive === false &&
            (
                String(error && error.errorType || '').toLowerCase().replace(/_/g, '-') === 'auth-required' ||
                String(error && error.message || error || '').includes('Google Drive 需要重新登录')
            )
        );
    },

    /**
     * 发送消息到 Service Worker
     * @param {string} type 消息类型
     * @param {Object} data 消息数据
     * @returns {Promise<*>}
     */
    async send(type, data = {}) {
        try {
            const response = await chrome.runtime.sendMessage({ type, ...data });
            if (response && response.error) {
                const responseError = new Error(response.error);
                if (response.errorType) {
                    responseError.errorType = response.errorType;
                }
                throw responseError;
            }
            return response;
        } catch (e) {
            if (this.isRecoverableRuntimeError(e)) {
                if (!this._recoverableRuntimeNotified) {
                    this._recoverableRuntimeNotified = true;
                    console.info('[Messaging] 扩展上下文已失效或后台通道已重置，请刷新页面后重试。');
                }
                throw this._normalizeError(e);
            }
            if (!this.isExpectedSilentGoogleDriveAuthRequired(type, data, e)) {
                console.error('[Messaging] 发送失败:', type, e);
            }
            throw this._normalizeError(e);
        }
    },

    /**
     * 跨域 Fetch 请求（通过 Service Worker 代理）
     * @param {string} url 请求 URL
     * @param {Object} options fetch 选项
     * @returns {Promise<Object>}
     */
    async fetch(url, options = {}) {
        return this.send('FETCH_REQUEST', { url, options });
    },

    /**
     * 打开新标签页
     * @param {string} url 目标 URL
     * @param {boolean} active 是否激活
     * @returns {Promise<Object>}
     */
    async openTab(url, active = true) {
        return this.send('OPEN_TAB', { url, active });
    },

    /**
     * 获取 Monaco 编辑器代码（通过 MAIN world 执行）
     * @returns {Promise<{success: boolean, code?: string, error?: string}>}
     */
    async getMonacoCode() {
        return this.send('GET_MONACO_CODE');
    }
};

// 导出到全局（内容脚本使用）
if (typeof window !== 'undefined') {
    window.Messaging = Messaging;
}
