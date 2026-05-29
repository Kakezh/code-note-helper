/**
 * AI 对话时间轴 内容脚本 - ChatGPT
 * 版本：1.1.3
 * 基线：7ef0d64（v1.0.18）+ 深色模式增强
 */

(function () {
    'use strict';

    // 防止重复注入
    if (window.__AI_TIMELINE_INJECTED__) return;
    window.__AI_TIMELINE_INJECTED__ = true;

    console.log('[AI Timeline] Content script loaded (v1.1.3)');

    // === 配置 ===
    const CONFIG = {
        LONG_PRESS_DURATION: 600,
        HOVER_PREVIEW_DELAY: 400,
        TOOLTIP_HIDE_DELAY: 300,
        DEBOUNCE_DELAY: 150,
        INIT_DELAY: 1000,
        SCROLL_BEHAVIOR: 'smooth',
        STORAGE_PREFIX: 'ai_timeline_marks_',
        CHATGPT_PREVIEW_CACHE_PREFIX: 'ai_timeline_chatgpt_preview_cache_',
        PREVIEW_TEXT_LENGTH: 260,
        LONG_CONVERSATION_THRESHOLD: 8,
        TRACK_PADDING: 16,
        MIN_GAP: 24,
        VIRTUAL_WINDOW_SIZE: 5,
        VIRTUAL_BUFFER: 2,
        POSITION_REFRESH_INTERVAL: 500
    };

    const ADAPTER = {
        name: 'ChatGPT',
        matches: (url) => url.includes('chatgpt.com'),
        isConversationPage: (path) => {
            // 支持 /c/<conversationId>
            if (/^\/c\/[A-Za-z0-9-]+/.test(path)) return true;
            // 支持 /g/<projectId>/c/<conversationId>
            if (/^\/g\/[^/]+\/c\/[A-Za-z0-9-]+/.test(path)) return true;
            // 支持分享页
            if (path.includes('/share/')) return true;
            return false;
        },
        turnSelector: 'section[data-testid^="conversation-turn-"]',
        userMessageSelector: '[data-message-author-role="user"]',
        aiMessageSelector: '[data-message-author-role="assistant"]',
        extractUserText: (el) => {
            const textEl = el.querySelector('.whitespace-pre-wrap');
            return (textEl?.textContent || el.textContent || '').replace(/\s+/g, ' ').trim();
        },
        extractAIText: (el) => {
            const content = el.querySelector('.markdown, .whitespace-pre-wrap');
            return (content?.textContent || el.textContent || '').replace(/\s+/g, ' ').trim();
        },
        getConversationId: () => {
            const segs = location.pathname.split('/').filter(Boolean);
            // /c/<conversationId>
            if (segs[0] === 'c' && segs[1]) return segs[1];
            // /g/<projectId>/c/<conversationId>
            if (segs[0] === 'g' && segs[2] === 'c' && segs[3]) return segs[3];
            // /share/e/<id> 与 /share/<id>
            const shareIndex = segs.indexOf('share');
            if (shareIndex !== -1) {
                if (segs[shareIndex + 1] === 'e' && segs[shareIndex + 2]) return segs[shareIndex + 2];
                if (segs[shareIndex + 1]) return segs[shareIndex + 1];
            }
            return null;
        },
        timelinePosition: { top: '80px', right: '16px', bottom: '100px' },
        scrollContainerSelector: '[data-scroll-root], [class*="group/scroll-root"], main [class*="react-scroll-to-bottom"] > div, main div[class*="overflow-y-auto"], main .overflow-y-auto'
    };

    // === 工具函数 ===

    // 动态检测深色模式（通过计算背景色亮度）
    function isDarkMode() {
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        // 解析 rgb(r, g, b)
        const match = bodyBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            const [_, r, g, b] = match.map(Number);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
            return luminance < 128;
        }
        // 解析 rgba(r, g, b, a)
        const rgbaMatch = bodyBg.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbaMatch) {
            const [_, r, g, b] = rgbaMatch.map(Number);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
            return luminance < 128;
        }
        return false;
    }
    function throttle(fn, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                fn.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    function debounce(fn, delay) {
        let timer = null;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }

    function simpleHash(str) {
        if (!str || str.length === 0) return '0';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function parseConversationTurnNumber(testId) {
        const match = String(testId || '').match(/conversation-turn-(\d+)/);
        return match ? Number(match[1]) : -1;
    }

    const CHATGPT_UNLOADED_PLACEHOLDER = '这一轮内容尚未加载，点击后可查看';

    async function copyToClipboard(text, btn, resetText = '复制提问') {
        try {
            await navigator.clipboard.writeText(text);
            btn.classList.add('copied');
            btn.querySelector('span').textContent = '已复制!';
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.querySelector('span').textContent = resetText;
            }, 1500);
        } catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.cssText = 'position:fixed;opacity:0;';
            document.body.appendChild(textarea);
            textarea.select();
            try { document.execCommand('copy'); } catch (e) { }
            document.body.removeChild(textarea);
        }
    }

    // === 时间轴控制器 ===
    class TimelineController {
        constructor(adapter) {
            this.adapter = adapter;
            this.container = null;
            this.scrollContainer = null;
            this.messageMap = new Map();
            this.sortedMessages = [];
            this.renderedNodes = new Map();
            this.activeNodeId = null;
            this.ui = { bar: null, track: null, trackContent: null, tooltip: null, hitZone: null };
            this.windowState = { startIndex: 0, endIndex: 0, centerIndex: 0 };
            this.isCompactMode = false;
            this.lastScrollHeight = 0;
            this.lastPositionRefresh = 0;
            this.longPressTimer = null;
            this.longPressTarget = null;
            this.isLongPressed = false;
            this.hoverTimer = null;
            this.tooltipHideTimer = null;
            this.currentHoverNode = null;
            this.isMouseOverTooltip = false;
            this.isMouseOverHitZone = false;
            this.chatgptHydrationObserver = null;
            this.chatgptHydrationTargetId = null;
            this.chatgptPreviewCache = this.loadChatgptPreviewCache();
            this.chatgptConversationPreviewPromise = null;
            this.chatgptConversationPreviewLoaded = false;
            this.chatgptConversationPreviewAutoAttempted = false;
            this.chatgptPageDataPreviewAttempted = false;
            this.chatgptHoverHydrationObserver = null;
            this.chatgptHoverHydrationTargetId = null;
            this.chatgptHoverHydrationRAF = null;
            this.chatgptHoverHydrationRestore = null;
            this.isRestoringChatgptHoverScroll = false;
            this.mutationObserver = null;
            this.scrollSyncRAF = null;
            this.pollIntervalId = null;
            this.isInitialized = false; // 【修复】防止重复初始化
            this.lastBottomLogTime = 0; // 【修复】底部日志节流

            this.debouncedFullRebuild = debounce(this.fullRebuild.bind(this), CONFIG.DEBOUNCE_DELAY);
            this.throttledRender = throttle(this.renderWindow.bind(this), 50);
            this.throttledPositionRefresh = throttle(this.refreshPositions.bind(this), CONFIG.POSITION_REFRESH_INTERVAL);

            this.markedIds = this.loadMarks();
        }

        generateStableId(el, index) {
            const nativeId = el.getAttribute('data-message-id') || el.getAttribute('data-id');
            if (nativeId) return `native-${nativeId}`;
            const parentId = el.parentElement?.getAttribute('data-message-id');
            if (parentId) return `parent-${parentId}`;
            const text = (this.adapter.extractUserText(el) || '').substring(0, 150);
            const hash = simpleHash(text);
            const textLen = (this.adapter.extractUserText(el) || '').length;
            return `hash-${hash}-len${textLen}`;
        }

        getPrimaryMessageSelector() {
            return this.adapter.turnSelector || this.adapter.userMessageSelector;
        }

        findFirstTimelineAnchor() {
            return document.querySelector(this.getPrimaryMessageSelector())
                || document.querySelector(this.adapter.userMessageSelector)
                || document.querySelector(this.adapter.aiMessageSelector);
        }

        getTimelineItemDomCount() {
            if (this.adapter.name === 'ChatGPT') {
                return this.collectChatgptTurnTimelineItems().length;
            }
            const primarySelector = this.getPrimaryMessageSelector();
            const primaryCount = primarySelector ? document.querySelectorAll(primarySelector).length : 0;
            if (primaryCount > 0) return primaryCount;
            return document.querySelectorAll(this.adapter.userMessageSelector).length;
        }

        waitForConversationElement(timeout = 15000) {
            return new Promise((resolve) => {
                const check = () => this.findFirstTimelineAnchor();
                const existing = check();
                if (existing) return resolve(existing);

                const observer = new MutationObserver(() => {
                    const el = check();
                    if (el) {
                        observer.disconnect();
                        resolve(el);
                    }
                });

                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => {
                    observer.disconnect();
                    resolve(check());
                }, timeout);
            });
        }

        async init() {
            // 【修复】防止重复初始化
            if (this.isInitialized) {
                console.log('[AI Timeline] 已初始化，跳过重复调用');
                return;
            }
            console.log(`[AI Timeline] Waiting for ${this.adapter.name} page load...`);

            const el = await this.waitForConversationElement();
            if (!el) {
                console.debug('[AI Timeline] 未找到消息元素');
                setTimeout(() => this.init(), 2000);
                return;
            }

            if (!this.findContainers()) {
                console.debug('[AI Timeline] 未找到对话容器');
                return;
            }

            this.createUI();
            this.fullRebuild();
            this.setupEventListeners();
            this.setupObservers();
            requestAnimationFrame(() => this.handleScroll?.());
            this.isInitialized = true; // 【修复】标记已初始化

            console.log(`[AI Timeline] Init done, found ${this.messageMap.size} messages`);
        }

        waitForElement(selector, timeout = 15000) {
            return new Promise((resolve) => {
                const check = () => document.querySelector(selector);
                if (check()) return resolve(check());

                const observer = new MutationObserver(() => {
                    const el = check();
                    if (el) { observer.disconnect(); resolve(el); }
                });

                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => { observer.disconnect(); resolve(check()); }, timeout);
            });
        }

        findContainers() {
            // 检测元素是否具有滚动能力（放宽条件：只检查 overflow 属性）
            const hasScrollCapability = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                const hasOverflow = style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay';
                return hasOverflow;
            };

            // 更严格的检测（要求当前有可滚动内容）
            const hasActualScroll = (el) => {
                if (!el) return false;
                return el.scrollHeight > el.clientHeight + 10;
            };

            const primarySelector = this.getPrimaryMessageSelector();
            const firstMessage = this.findFirstTimelineAnchor();
            if (!firstMessage) {
                console.debug('[AI Timeline] 未找到消息元素');
                return false;
            }

            // 1. 优先使用适配器指定的选择器
            if (this.adapter.scrollContainerSelector) {
                const candidates = Array.from(document.querySelectorAll(this.adapter.scrollContainerSelector))
                    .filter((candidate) => candidate.contains(firstMessage) || candidate.querySelector(primarySelector));
                console.log(`[AI Timeline] 候选滚动容器数量: ${candidates.length}`);

                const scoreCandidate = (candidate) => {
                    if (!candidate) return -Infinity;
                    const style = window.getComputedStyle(candidate);
                    const className = String(candidate.className || '');
                    let score = 0;
                    if (hasScrollCapability(candidate)) score += 100;
                    if (hasActualScroll(candidate)) score += 200;
                    if (candidate.contains(firstMessage)) score += 60;
                    if (candidate.querySelector(primarySelector)) score += 40;
                    if (this.adapter.turnSelector && candidate.querySelector(this.adapter.turnSelector)) score += 30;
                    if (candidate.scrollTop > 0) score += 120;
                    if (className.includes('group/scroll-root')) score += 90;
                    if (className.includes('overflow-y-auto')) score += 50;
                    if (candidate.tagName === 'MAIN' && style.overflowY !== 'auto' && style.overflowY !== 'scroll' && style.overflowY !== 'overlay') {
                        score -= 120;
                    }
                    return score;
                };

                const rankedCandidates = candidates
                    .map((candidate) => ({ candidate, score: scoreCandidate(candidate) }))
                    .sort((left, right) => right.score - left.score);

                // 第一轮：找有实际滚动内容的容器
                for (const { candidate } of rankedCandidates) {
                    if (hasScrollCapability(candidate) && hasActualScroll(candidate)) {
                        this.scrollContainer = candidate;
                        const firstAnchor = candidate.querySelector(primarySelector) || candidate.querySelector(this.adapter.userMessageSelector);
                        this.container = firstAnchor ? firstAnchor.parentElement : candidate;
                        console.log('[AI Timeline] 使用指定容器(有滚动):', candidate.tagName, candidate.className?.substring(0, 60));
                        return true;
                    }
                }

                // 第二轮：找有 overflow 属性的容器（即使当前没有滚动内容）
                for (const { candidate } of rankedCandidates) {
                    if (hasScrollCapability(candidate)) {
                        this.scrollContainer = candidate;
                        const firstAnchor = candidate.querySelector(primarySelector) || candidate.querySelector(this.adapter.userMessageSelector);
                        this.container = firstAnchor ? firstAnchor.parentElement : candidate;
                        console.log('[AI Timeline] 使用指定容器(overflow):', candidate.tagName, candidate.className?.substring(0, 60));
                        return true;
                    }
                }
            }

            // 2. 从消息元素向上查找
            let parent = firstMessage.parentElement;
            while (parent && parent !== document.body) {
                if (parent.querySelectorAll(primarySelector).length > 0) this.container = parent;
                parent = parent.parentElement;
            }
            if (!this.container) this.container = firstMessage.parentElement || firstMessage;

            // 3. 递归查找具有滚动能力的容器
            parent = this.container;
            while (parent && parent !== document.body) {
                if (hasScrollCapability(parent)) {
                    this.scrollContainer = parent;
                    console.log('[AI Timeline] 发现滚动容器:', parent.tagName, parent.className?.substring(0, 60));
                    break;
                }
                parent = parent.parentElement;
            }

            // 4. 降级方案
            if (!this.scrollContainer) {
                this.scrollContainer = document.scrollingElement || document.documentElement;
                console.log('[AI Timeline] 使用降级滚动容器');
            }
            return true;
        }

        destroy() {
            this.clearChatgptHoverHydration();
            this.clearChatgptHydrationObserver();
            // 清理 UI
            if (this.ui.bar) this.ui.bar.remove();
            if (this.ui.tooltip) this.ui.tooltip.remove();
            if (this.ui.hitZone) this.ui.hitZone.remove();

            // 清理定时器
            this.clearAllTimers();
            if (this.pollIntervalId) clearInterval(this.pollIntervalId);
            if (this.scrollSyncRAF) cancelAnimationFrame(this.scrollSyncRAF);

            // 断开观察器
            if (this.mutationObserver) this.mutationObserver.disconnect();

            // 移除事件监听
            if (this.handleScroll) {
                (this.scrollContainer || window).removeEventListener('scroll', this.handleScroll);
                // 【修复】清理 ChatGPT 全局滚动监听器
                document.removeEventListener('scroll', this.handleScroll, { capture: true });
            }
            if (this.handleResize) {
                window.removeEventListener('resize', this.handleResize);
            }
            // 【修复】重置初始化标志
            this.isInitialized = false;
            console.log('[AI Timeline] 已销毁');
        }

        createUI() {
            // 先清理旧的
            document.querySelectorAll('.ai-timeline-bar, .ai-timeline-tooltip, .ai-timeline-hit-zone').forEach(el => el.remove());

            const bar = document.createElement('div');
            bar.className = 'ai-timeline-bar';
            const pos = this.adapter.timelinePosition;
            bar.style.top = pos.top;
            bar.style.right = pos.right;
            bar.style.height = `calc(100vh - ${pos.top} - ${pos.bottom})`;

            const track = document.createElement('div');
            track.className = 'ai-timeline-track';

            const trackContent = document.createElement('div');
            trackContent.className = 'ai-timeline-track-content';
            track.appendChild(trackContent);
            bar.appendChild(track);
            document.body.appendChild(bar);

            this.ui.bar = bar;
            this.ui.track = track;
            this.ui.trackContent = trackContent;

            // 动态检测深色模式并设置样式（允许的行为变化）
            if (isDarkMode()) {
                bar.classList.add('dark-mode-detected');
                bar.style.setProperty('--tl-dot-color', '#E5E7EB');
                bar.style.setProperty('--tl-bar-bg', 'rgba(80, 80, 85, 0.9)');
                bar.style.backgroundColor = 'rgba(80, 80, 85, 0.9)';
                console.log('[AI Timeline] 检测到深色模式，应用深色样式');
            }

            const tooltip = document.createElement('div');
            tooltip.className = 'ai-timeline-tooltip';
            document.body.appendChild(tooltip);
            this.ui.tooltip = tooltip;

            const hitZone = document.createElement('div');
            hitZone.className = 'ai-timeline-hit-zone';
            hitZone.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:auto;opacity:0;display:none;';
            document.body.appendChild(hitZone);
            this.ui.hitZone = hitZone;
        }

        collectUserTimelineItems() {
            return Array.from(document.querySelectorAll(this.adapter.userMessageSelector)).map((el, index) => {
                const text = this.adapter.extractUserText(el);
                return {
                    stableId: this.generateStableId(el, index),
                    el,
                    text,
                    fullText: text,
                    label: '提问',
                    copyLabel: '复制提问',
                    sequence: index
                };
            });
        }

        getChatgptPreviewCacheKey() {
            const convId = this.adapter.getConversationId?.();
            return convId ? `${CONFIG.CHATGPT_PREVIEW_CACHE_PREFIX}${convId}` : null;
        }

        loadChatgptPreviewCache() {
            const key = this.getChatgptPreviewCacheKey();
            if (!key) return {};
            try {
                const raw = localStorage.getItem(key);
                const parsed = raw ? JSON.parse(raw) : {};
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
            } catch (err) {
                console.warn('[AI Timeline] 读取 ChatGPT 时间轴预览缓存失败:', err);
                return {};
            }
        }

        saveChatgptPreviewCache() {
            const key = this.getChatgptPreviewCacheKey();
            if (!key) return;
            try {
                localStorage.setItem(key, JSON.stringify(this.chatgptPreviewCache || {}));
            } catch (err) {
                console.warn('[AI Timeline] 保存 ChatGPT 时间轴预览缓存失败:', err);
            }
        }

        getCachedChatgptText(id) {
            return normalizeText(this.chatgptPreviewCache?.[id]);
        }

        cacheChatgptText(id, text) {
            const normalizedText = normalizeText(text);
            if (!id || !normalizedText || normalizedText === CHATGPT_UNLOADED_PLACEHOLDER) return;
            if (this.chatgptPreviewCache[id] === normalizedText) return;
            this.chatgptPreviewCache[id] = normalizedText;
            this.saveChatgptPreviewCache();
        }

        getChatgptConversationApiUrl() {
            const convId = this.adapter.getConversationId?.();
            if (!convId || location.pathname.includes('/share/')) return '';
            // 自定义 GPT 的 /g/.../c/... 页面在真实环境中可能对通用 conversation 接口返回 404。
            // 这里不再主动请求该接口，避免扩展管理页出现误报；这类页面优先依赖页面内数据、DOM 挂载和本地缓存。
            if (location.pathname.startsWith('/g/')) return '';
            return `/backend-api/conversation/${encodeURIComponent(convId)}`;
        }

        extractChatgptContentText(content) {
            if (!content) return '';
            if (typeof content === 'string') return normalizeText(content);
            if (Array.isArray(content.parts)) {
                return normalizeText(content.parts.map((part) => {
                    if (typeof part === 'string') return part;
                    if (!part || typeof part !== 'object') return '';
                    if (typeof part.text === 'string') return part.text;
                    if (typeof part.content === 'string') return part.content;
                    if (typeof part.name === 'string') return part.name;
                    return '';
                }).filter(Boolean).join(' '));
            }
            if (typeof content.text === 'string') return normalizeText(content.text);
            if (typeof content.content === 'string') return normalizeText(content.content);
            return '';
        }

        extractChatgptUserTextsFromConversationPayload(payload) {
            const mapping = payload?.mapping;
            if (!mapping || typeof mapping !== 'object') return [];

            let messages = [];
            const visited = new Set();
            let currentNodeId = payload.current_node;
            while (currentNodeId && mapping[currentNodeId] && !visited.has(currentNodeId)) {
                visited.add(currentNodeId);
                const node = mapping[currentNodeId];
                if (node?.message) messages.push(node.message);
                currentNodeId = node?.parent;
            }

            if (messages.length) {
                messages = messages.reverse();
            } else {
                messages = Object.values(mapping)
                    .map((node) => node?.message)
                    .filter(Boolean)
                    .sort((left, right) => (left.create_time || 0) - (right.create_time || 0));
            }

            return messages
                .filter((message) => message?.author?.role === 'user')
                .map((message) => this.extractChatgptContentText(message.content))
                .filter(Boolean);
        }

        collectChatgptConversationPayloadsFromObject(root) {
            const found = [];
            if (!root || typeof root !== 'object') return found;

            const seen = new WeakSet();
            const stack = [root];
            while (stack.length) {
                const item = stack.pop();
                if (!item || typeof item !== 'object' || seen.has(item)) continue;
                seen.add(item);

                if (item.mapping && typeof item.mapping === 'object') {
                    found.push(item);
                    continue;
                }

                const values = Array.isArray(item) ? item : Object.values(item);
                values.forEach((value) => {
                    if (value && typeof value === 'object') stack.push(value);
                });
            }
            return found;
        }

        tryLoadChatgptPreviewFromPageData() {
            if (this.adapter.name !== 'ChatGPT') return false;
            if (this.chatgptConversationPreviewLoaded || this.chatgptPageDataPreviewAttempted) return false;
            this.chatgptPageDataPreviewAttempted = true;

            const roots = [];
            if (window.__NEXT_DATA__) roots.push(window.__NEXT_DATA__);
            if (window.__remixContext) roots.push(window.__remixContext);
            if (window.__reactRouterContext) roots.push(window.__reactRouterContext);

            Array.from(document.scripts || []).forEach((script) => {
                const raw = script.textContent || '';
                if (!raw.includes('mapping') || !raw.includes('author')) return;
                try {
                    roots.push(JSON.parse(raw));
                } catch (_) {
                    // 不是纯 JSON 的脚本文本直接跳过；这里不输出日志，避免干扰普通用户。
                }
            });

            for (const root of roots) {
                const payloads = this.collectChatgptConversationPayloadsFromObject(root);
                for (const payload of payloads) {
                    const userTexts = this.extractChatgptUserTextsFromConversationPayload(payload);
                    if (this.applyChatgptConversationPreviewTexts(userTexts)) return true;
                }
            }
            return false;
        }

        applyChatgptConversationPreviewTexts(userTexts) {
            if (!Array.isArray(userTexts) || userTexts.length === 0) return false;

            const idBySequence = new Map();
            this.sortedMessages.forEach((msg) => {
                if (Number.isFinite(msg.sequence)) idBySequence.set(msg.sequence, msg.stableId);
            });

            let changed = false;
            userTexts.forEach((text, index) => {
                const normalizedText = normalizeText(text);
                if (!normalizedText) return;

                const sequence = index * 2 + 1;
                const knownId = idBySequence.get(sequence);
                const fallbackId = `turn-conversation-turn-${sequence}`;
                const targetId = knownId || fallbackId;

                if (this.messageMap.has(targetId)) {
                    changed = this.updateTimelineItemText(targetId, normalizedText) || changed;
                } else {
                    this.cacheChatgptText(targetId, normalizedText);
                    changed = true;
                }
            });

            if (changed) {
                this.chatgptConversationPreviewLoaded = true;
            }
            return changed;
        }

        requestChatgptConversationPreviewHydration(reason = 'hover') {
            if (this.adapter.name !== 'ChatGPT') return Promise.resolve(false);
            if (this.chatgptConversationPreviewLoaded || this.chatgptConversationPreviewUnavailable) return Promise.resolve(false);
            if (this.chatgptConversationPreviewPromise) return this.chatgptConversationPreviewPromise;
            if (this.tryLoadChatgptPreviewFromPageData()) return Promise.resolve(true);
            if (reason === 'auto' && this.chatgptConversationPreviewAutoAttempted) return Promise.resolve(false);

            const url = this.getChatgptConversationApiUrl();
            if (!url) return Promise.resolve(false);

            if (reason === 'auto') {
                // 自动预热只在当前页面生命周期内主动发起一次，避免 DOM 重建时重复请求；用户再次 hover 时仍可重试。
                this.chatgptConversationPreviewAutoAttempted = true;
            }

            this.chatgptConversationPreviewPromise = fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: { accept: 'application/json' }
            })
                .then((response) => {
                    if (!response.ok) {
                        if (response.status === 401 || response.status === 403 || response.status === 404) {
                            this.chatgptConversationPreviewUnavailable = true;
                        }
                        return null;
                    }
                    return response.json();
                })
                .then((payload) => {
                    if (!payload) return false;
                    const userTexts = this.extractChatgptUserTextsFromConversationPayload(payload);
                    const changed = this.applyChatgptConversationPreviewTexts(userTexts);
                    if (changed && this.currentHoverNode) {
                        this.showTooltip(this.currentHoverNode);
                    }
                    return changed;
                })
                .catch(() => false)
                .finally(() => {
                    this.chatgptConversationPreviewPromise = null;
                });

            return this.chatgptConversationPreviewPromise;
        }

        maybeWarmChatgptConversationPreview() {
            if (this.adapter.name !== 'ChatGPT') return;
            if (this.chatgptConversationPreviewLoaded || this.chatgptConversationPreviewPromise) return;
            if (!this.sortedMessages.some((msg) => msg.needsHydration)) return;
            this.requestChatgptConversationPreviewHydration('auto');
        }

        tryUpdateChatgptTurnFromDom(id) {
            const msg = this.messageMap.get(id);
            if (!msg?.sectionTestId) return false;
            const section = this.findChatgptSection(msg.sectionTestId);
            const text = this.readChatgptUserTextFromSection(section);
            return this.updateTimelineItemText(id, text);
        }

        restoreChatgptHoverScroll() {
            const restoreState = this.chatgptHoverHydrationRestore;
            this.chatgptHoverHydrationRestore = null;
            if (!restoreState || !this.scrollContainer) return;

            this.isRestoringChatgptHoverScroll = true;
            this.scrollContainer.scrollTop = restoreState.scrollTop;
            if (restoreState.activeNodeId !== this.activeNodeId) {
                this.activeNodeId = restoreState.activeNodeId;
                this.refreshActiveVisual();
            }
            requestAnimationFrame(() => {
                this.isRestoringChatgptHoverScroll = false;
            });
        }

        clearChatgptHoverHydration() {
            if (this.chatgptHoverHydrationRAF) {
                cancelAnimationFrame(this.chatgptHoverHydrationRAF);
                this.chatgptHoverHydrationRAF = null;
            }
            if (this.chatgptHoverHydrationObserver) {
                this.chatgptHoverHydrationObserver.disconnect();
            }
            this.restoreChatgptHoverScroll();
            this.chatgptHoverHydrationObserver = null;
            this.chatgptHoverHydrationTargetId = null;
        }

        startChatgptHoverHydration(id) {
            if (this.adapter.name !== 'ChatGPT') return;
            this.clearChatgptHoverHydration();
            if (!id || this.tryUpdateChatgptTurnFromDom(id)) return;

            const msg = this.messageMap.get(id);
            if (!this.isChatgptPlaceholderMessage(msg) || !msg.sectionTestId || !this.scrollContainer) return;

            this.requestChatgptConversationPreviewHydration('hover');

            const section = this.findChatgptSection(msg.sectionTestId);
            const targetAnchor = this.findChatgptTurnAnchor(section) || section;
            if (!section || !targetAnchor?.isConnected) return;

            const observeRoot = section.parentElement || this.container;
            if (observeRoot) {
                this.chatgptHoverHydrationObserver = new MutationObserver(() => {
                    if (this.tryUpdateChatgptTurnFromDom(id)) {
                        this.clearChatgptHoverHydration();
                    }
                });
                this.chatgptHoverHydrationObserver.observe(observeRoot, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
            }

            const currentScrollTop = this.scrollContainer.scrollTop;
            const targetTop = this.getScrollTopForTarget(targetAnchor);
            this.chatgptHoverHydrationTargetId = id;
            this.chatgptHoverHydrationRestore = {
                scrollTop: currentScrollTop,
                activeNodeId: this.activeNodeId
            };

            if (Math.abs(currentScrollTop - targetTop) <= 2) {
                this.chatgptHoverHydrationRestore = null;
                return;
            }

            // hover 预加载只短暂触发 ChatGPT 自身的懒加载判断，下一帧立即恢复原位置，避免用户看到页面跳动。
            this.scrollContainer.scrollTop = targetTop;
            this.chatgptHoverHydrationRAF = requestAnimationFrame(() => {
                this.chatgptHoverHydrationRAF = null;
                if (this.tryUpdateChatgptTurnFromDom(id)) {
                    this.clearChatgptHoverHydration();
                    return;
                }
                this.restoreChatgptHoverScroll();
            });
        }

        shouldInferChatgptUserTurn(section, turnNumber, hasMountedConversation) {
            if (!hasMountedConversation) return false;
            if (!Number.isFinite(turnNumber) || turnNumber <= 0) return false;
            if (section.querySelector(this.adapter.userMessageSelector) || section.querySelector(this.adapter.aiMessageSelector)) {
                return false;
            }
            if (normalizeText(section.textContent)) {
                return false;
            }
            // 真实 Edge 下 conversation-turn section 会保留，但早期 user 子节点可能未挂载。
            // 现有证据表明这些旧回合仍按 user / assistant 交替编号，因此只谨慎补回奇数 user turn，
            // 明确排除 assistant section，避免把回答节点混入时间轴。
            return turnNumber % 2 === 1;
        }

        findChatgptTurnAnchor(section) {
            if (!section) return null;

            const turnSection = section.matches?.(this.adapter.turnSelector)
                ? section
                : section.closest?.(this.adapter.turnSelector);
            if (turnSection) return turnSection;

            const turnContainer = section.closest?.('[data-turn-id-container]');
            if (turnContainer && turnContainer.querySelectorAll(this.adapter.turnSelector).length === 1) {
                return turnContainer;
            }

            return section;
        }

        buildChatgptUserTimelineItem(section, index, userEl, userText, turnNumber, sectionTestId, inferred) {
            const fallbackTurnNumber = turnNumber > 0 ? turnNumber : (index + 1);
            const placeholderText = CHATGPT_UNLOADED_PLACEHOLDER;
            const stableId = sectionTestId ? `turn-${sectionTestId}` : `turn-index-${index}`;
            const cachedText = inferred ? this.getCachedChatgptText(stableId) : '';
            const fullText = userText || normalizeText(section.textContent) || cachedText || placeholderText;
            const needsHydration = Boolean(inferred) && !cachedText && fullText === placeholderText;
            const anchorEl = this.findChatgptTurnAnchor(section) || userEl || section;
            return {
                stableId,
                el: anchorEl,
                sectionTestId,
                text: fullText,
                fullText,
                label: '提问',
                copyLabel: needsHydration ? '内容未加载' : '复制提问',
                sequence: fallbackTurnNumber,
                inferred: needsHydration,
                needsHydration
            };
        }

        isChatgptPlaceholderMessage(msg) {
            return Boolean(msg?.needsHydration);
        }

        getTimelineNodeTitle(msg) {
            const text = normalizeText(msg?.fullText || msg?.text);
            return text || CHATGPT_UNLOADED_PLACEHOLDER;
        }

        findChatgptSection(sectionTestId) {
            if (!sectionTestId) return null;
            return document.querySelector(`section[data-testid="${sectionTestId}"]`);
        }

        readChatgptUserTextFromSection(section) {
            if (!section) return '';
            const userEl = section.querySelector(this.adapter.userMessageSelector);
            return userEl ? this.adapter.extractUserText(userEl) : '';
        }

        updateTimelineItemText(id, nextText) {
            const normalizedText = normalizeText(nextText);
            if (!normalizedText) return false;
            const msg = this.messageMap.get(id);
            if (!msg) return false;

            msg.text = normalizedText;
            msg.fullText = normalizedText;
            msg.needsHydration = false;
            msg.inferred = false;
            msg.copyLabel = '复制提问';

            const rendered = this.renderedNodes.get(id);
            if (rendered) {
                rendered.text = normalizedText.substring(0, CONFIG.PREVIEW_TEXT_LENGTH)
                    + (normalizedText.length > CONFIG.PREVIEW_TEXT_LENGTH ? '...' : '');
                rendered.fullText = normalizedText;
                rendered.copyLabel = '复制提问';
                rendered.node.removeAttribute('title');
                rendered.node.setAttribute('aria-label', normalizedText);
            }

            this.cacheChatgptText(id, normalizedText);

            if (this.chatgptHydrationTargetId === id) {
                this.clearChatgptHydrationObserver();
            }

            if (this.currentHoverNode && this.currentHoverNode.dataset.id === id) {
                this.showTooltip(this.currentHoverNode);
            }
            return true;
        }

        getScrollTopForTarget(targetEl) {
            if (!this.scrollContainer || !targetEl) return 0;
            const containerRect = this.scrollContainer.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();
            return Math.max(0, this.scrollContainer.scrollTop + targetRect.top - containerRect.top - 16);
        }

        clearChatgptHydrationObserver() {
            if (this.chatgptHydrationObserver) {
                this.chatgptHydrationObserver.disconnect();
            }
            this.chatgptHydrationObserver = null;
            this.chatgptHydrationTargetId = null;
        }

        observeChatgptTurnHydration(id) {
            if (this.adapter.name !== 'ChatGPT') return;
            this.clearChatgptHydrationObserver();
            if (!id) return;

            const msg = this.messageMap.get(id);
            if (!msg || !msg.sectionTestId) return;

            const updateFromCurrentDom = () => {
                const hydratedMsg = this.messageMap.get(id);
                if (!hydratedMsg) {
                    this.clearChatgptHydrationObserver();
                    return true;
                }
                const hydratedSection = this.findChatgptSection(hydratedMsg.sectionTestId);
                const hydratedText = this.readChatgptUserTextFromSection(hydratedSection);
                return this.updateTimelineItemText(id, hydratedText);
            };

            if (updateFromCurrentDom()) return;
            if (!this.isChatgptPlaceholderMessage(msg)) return;

            const section = this.findChatgptSection(msg.sectionTestId);
            const observeRoot = section?.parentElement || this.container;
            if (!observeRoot) return;

            this.chatgptHydrationTargetId = id;
            this.chatgptHydrationObserver = new MutationObserver(() => {
                updateFromCurrentDom();
            });
            this.chatgptHydrationObserver.observe(observeRoot, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }

        collectChatgptTurnTimelineItems() {
            const sections = Array.from(document.querySelectorAll(this.adapter.turnSelector))
                .sort((left, right) => parseConversationTurnNumber(left.getAttribute('data-testid')) - parseConversationTurnNumber(right.getAttribute('data-testid')));
            if (!sections.length) {
                return this.collectUserTimelineItems();
            }

            const hasMountedConversation = sections.some((section) => {
                return section.querySelector(this.adapter.userMessageSelector)
                    || section.querySelector(this.adapter.aiMessageSelector);
            });

            return sections.map((section, index) => {
                const sectionTestId = String(section.getAttribute('data-testid') || '').trim();
                const turnNumber = parseConversationTurnNumber(sectionTestId);
                const userEl = section.querySelector(this.adapter.userMessageSelector);
                const assistantEl = section.querySelector(this.adapter.aiMessageSelector);
                const userText = userEl ? this.adapter.extractUserText(userEl) : '';
                const assistantText = assistantEl ? this.adapter.extractAIText(assistantEl) : '';
                if (userEl) {
                    return this.buildChatgptUserTimelineItem(
                        section,
                        index,
                        userEl,
                        userText,
                        turnNumber,
                        sectionTestId,
                        false
                    );
                }
                if (assistantEl || assistantText) {
                    return null;
                }
                if (!this.shouldInferChatgptUserTurn(section, turnNumber, hasMountedConversation)) {
                    return null;
                }
                return this.buildChatgptUserTimelineItem(
                    section,
                    index,
                    null,
                    '',
                    turnNumber,
                    sectionTestId,
                    true
                );
            }).filter(Boolean);
        }

        collectTimelineItems() {
            if (this.adapter.name === 'ChatGPT') {
                return this.collectChatgptTurnTimelineItems();
            }
            return this.collectUserTimelineItems();
        }

        fullRebuild() {
            if (!this.container) return;

            const hoverNodeId = this.currentHoverNode?.dataset?.id || null;
            this.clearAllTimers();
            if (!hoverNodeId) this.hideTooltip();

            const timelineItems = this.collectTimelineItems();
            if (timelineItems.length === 0) return;

            const scrollTop = this.scrollContainer.scrollTop;
            const containerRect = this.scrollContainer.getBoundingClientRect();

            const newMessageMap = new Map();
            timelineItems.forEach((item) => {
                const rect = item.el.getBoundingClientRect();
                const absTop = scrollTop + rect.top - containerRect.top;
                const existing = this.messageMap.get(item.stableId);
                const existingText = existing && !existing.needsHydration
                    ? normalizeText(existing.fullText || existing.text)
                    : '';
                const keepExistingText = Boolean(item.needsHydration && existingText);
                const nextNeedsHydration = keepExistingText ? false : Boolean(item.needsHydration);
                newMessageMap.set(item.stableId, {
                    ...item,
                    absTop,
                    text: keepExistingText ? existingText : (item.text || existing?.text || ''),
                    fullText: keepExistingText ? existingText : (item.fullText || existing?.fullText || item.text || ''),
                    label: item.label || existing?.label || '提问',
                    copyLabel: nextNeedsHydration ? (item.copyLabel || '内容未加载') : (item.copyLabel || existing?.copyLabel || '复制内容'),
                    inferred: keepExistingText ? false : Boolean(item.inferred),
                    needsHydration: nextNeedsHydration
                });
                if (!nextNeedsHydration) {
                    this.cacheChatgptText(item.stableId, keepExistingText || item.fullText || item.text);
                }
            });

            this.messageMap = newMessageMap;
            this.sortedMessages = Array.from(this.messageMap.values());
            this.sortedMessages.sort((a, b) => {
                if (a.sequence !== b.sequence) {
                    return a.sequence - b.sequence;
                }
                return a.absTop - b.absTop;
            });
            this.sortedMessages.forEach((msg, i) => msg.index = i);
            const hydrationMsg = this.chatgptHydrationTargetId ? this.messageMap.get(this.chatgptHydrationTargetId) : null;
            if (this.chatgptHydrationTargetId && (!hydrationMsg || !hydrationMsg.needsHydration)) {
                this.clearChatgptHydrationObserver();
            }
            const hoverHydrationMsg = this.chatgptHoverHydrationTargetId ? this.messageMap.get(this.chatgptHoverHydrationTargetId) : null;
            if (this.chatgptHoverHydrationTargetId && (!hoverHydrationMsg || !hoverHydrationMsg.needsHydration)) {
                this.clearChatgptHoverHydration();
            }
            this.maybeWarmChatgptConversationPreview();

            this.isCompactMode = this.sortedMessages.length > CONFIG.LONG_CONVERSATION_THRESHOLD;
            this.ui.trackContent.classList.toggle('compact', this.isCompactMode);
            this.lastScrollHeight = this.scrollContainer.scrollHeight;

            this.renderWindow();
            if (hoverNodeId && this.renderedNodes.has(hoverNodeId)) {
                this.currentHoverNode = this.renderedNodes.get(hoverNodeId).node;
                this.showTooltip(this.currentHoverNode);
            }
            requestAnimationFrame(() => this.updateActiveFromScroll());
        }

        refreshPositions() {
            if (!this.scrollContainer || this.sortedMessages.length === 0) return;
            const now = Date.now();
            if (now - this.lastPositionRefresh < CONFIG.POSITION_REFRESH_INTERVAL / 2) return;
            this.lastPositionRefresh = now;

            const scrollTop = this.scrollContainer.scrollTop;
            const containerRect = this.scrollContainer.getBoundingClientRect();

            this.sortedMessages.forEach(msg => {
                if (!msg.el || !msg.el.isConnected) return;
                const rect = msg.el.getBoundingClientRect();
                msg.absTop = scrollTop + rect.top - containerRect.top;
            });

            this.sortedMessages.sort((a, b) => {
                if (a.sequence !== b.sequence) {
                    return a.sequence - b.sequence;
                }
                return a.absTop - b.absTop;
            });
            this.sortedMessages.forEach((msg, i) => msg.index = i);
        }

        renderWindow() {
            if (this.sortedMessages.length === 0 || !this.ui.trackContent) return;

            const trackHeight = this.ui.track.clientHeight || 500;
            const padding = CONFIG.TRACK_PADDING;
            const naturalGap = this.sortedMessages.length > 0
                ? (trackHeight - 2 * padding) / (this.sortedMessages.length + 1)
                : CONFIG.MIN_GAP;
            const gap = Math.max(CONFIG.MIN_GAP, naturalGap);
            const contentHeight = Math.max(trackHeight, padding * 2 + gap * (this.sortedMessages.length + 1));

            this.windowState = {
                startIndex: 0,
                endIndex: this.sortedMessages.length - 1,
                centerIndex: this.activeNodeId && this.messageMap.has(this.activeNodeId)
                    ? this.messageMap.get(this.activeNodeId).index ?? 0
                    : 0
            };

            this.ui.trackContent.style.minHeight = `${contentHeight}px`;
            this.ui.trackContent.querySelectorAll('.ai-timeline-indicator').forEach(el => el.remove());

            const renderList = this.sortedMessages;
            const newIds = new Set(renderList.map(m => m.stableId));

            const toRemove = [];
            this.renderedNodes.forEach((data, id) => {
                if (!newIds.has(id)) { data.node.remove(); toRemove.push(id); }
            });
            toRemove.forEach(id => this.renderedNodes.delete(id));

            renderList.forEach((msg, index) => {
                if (!msg.text) msg.text = this.adapter.extractUserText(msg.el);
                const currentTop = padding + gap * (index + 1);

                if (this.renderedNodes.has(msg.stableId)) {
                    const rendered = this.renderedNodes.get(msg.stableId);
                    rendered.node.style.top = `${currentTop}px`;
                    this.applyTimelineNodeHitSize(rendered.node, gap);
                    rendered.text = (msg.text || '').substring(0, CONFIG.PREVIEW_TEXT_LENGTH) + ((msg.text || '').length > CONFIG.PREVIEW_TEXT_LENGTH ? '...' : '');
                    rendered.fullText = msg.fullText || msg.text || '';
                    rendered.label = msg.label || '提问';
                    rendered.copyLabel = msg.copyLabel || '复制内容';
                    rendered.node.removeAttribute('title');
                    rendered.node.setAttribute('aria-label', this.getTimelineNodeTitle(msg));
                } else {
                    const node = this.createNode(msg, currentTop);
                    this.applyTimelineNodeHitSize(node, gap);
                    this.ui.trackContent.appendChild(node);
                    this.renderedNodes.set(msg.stableId, {
                        node,
                        text: (msg.text || '').substring(0, CONFIG.PREVIEW_TEXT_LENGTH) + ((msg.text || '').length > CONFIG.PREVIEW_TEXT_LENGTH ? '...' : ''),
                        fullText: msg.fullText || msg.text || '',
                        label: msg.label || '提问',
                        copyLabel: msg.copyLabel || '复制内容'
                    });
                }
            });

            this.refreshActiveVisual();
        }

        applyTimelineNodeHitSize(node, gap) {
            if (!node) return;
            // 长对话中节点间距可能小于原始 30px 命中区。这里用既有 MIN_GAP 与紧凑点尺寸收窄命中区，
            // 避免相邻按钮互相覆盖，导致 hover 没反应或气泡闪一下就被其他节点抢走。
            const compactDotSize = 10;
            const hitSize = Math.max(compactDotSize, Math.min(30, Math.floor(gap)));
            node.style.width = `${hitSize}px`;
            node.style.height = `${hitSize}px`;
        }

        syncTimelineTrackScrollToActive() {
            if (!this.ui.track || !this.activeNodeId || this.currentHoverNode || this.isMouseOverTooltip || this.isMouseOverHitZone) return;
            const rendered = this.renderedNodes.get(this.activeNodeId);
            if (!rendered?.node) return;

            const nodeTop = Number.parseFloat(rendered.node.style.top || '0');
            if (!Number.isFinite(nodeTop)) return;

            const trackHeight = this.ui.track.clientHeight || 0;
            const maxScrollTop = Math.max(0, this.ui.trackContent.scrollHeight - trackHeight);
            const nextScrollTop = Math.max(0, Math.min(maxScrollTop, nodeTop - trackHeight / 2));
            this.ui.track.scrollTop = nextScrollTop;
        }

        createNode(msg, top) {
            const node = document.createElement('button');
            node.className = 'ai-timeline-node';
            node.dataset.id = msg.stableId;
            node.style.top = `${top}px`;
            node.removeAttribute('title');
            node.setAttribute('aria-label', this.getTimelineNodeTitle(msg));

            if (this.markedIds.has(msg.stableId)) node.classList.add('marked');
            if (msg.stableId === this.activeNodeId) node.classList.add('active');

            node.addEventListener('mouseenter', () => {
                if (this.hoverTimer) clearTimeout(this.hoverTimer);
                if (this.tooltipHideTimer) clearTimeout(this.tooltipHideTimer);
                this.currentHoverNode = node;
                this.hoverTimer = setTimeout(() => {
                    if (this.currentHoverNode === node) {
                        this.showTooltip(node);
                        this.startChatgptHoverHydration(node.dataset.id);
                    }
                }, CONFIG.HOVER_PREVIEW_DELAY);
            });

            node.addEventListener('mouseleave', (e) => {
                if (this.hoverTimer) { clearTimeout(this.hoverTimer); this.hoverTimer = null; }
                const relatedTarget = e.relatedTarget;
                if (relatedTarget && (this.ui.tooltip?.contains(relatedTarget) || this.ui.hitZone?.contains(relatedTarget))) return;
                if (this.currentHoverNode === node) this.currentHoverNode = null;
                if (this.chatgptHoverHydrationTargetId === node.dataset.id) {
                    this.clearChatgptHoverHydration();
                }
                this.scheduleTooltipHide();
            });

            node.addEventListener('click', (e) => {
                e.preventDefault();
                if (!node.dataset.id) return;
                if (this.isLongPressed) return;
                this.scrollToMarker(node.dataset.id);
            });

            return node;
        }

        createIndicator(top, type) {
            const ind = document.createElement('div');
            ind.className = `ai-timeline-indicator ${type}`;
            ind.style.top = `${top}px`;
            this.ui.trackContent.appendChild(ind);
        }

        refreshActiveVisual() {
            this.renderedNodes.forEach(({ node }) => node.classList.remove('active'));
            if (this.activeNodeId && this.renderedNodes.has(this.activeNodeId)) {
                this.renderedNodes.get(this.activeNodeId).node.classList.add('active');
            }
            this.syncTimelineTrackScrollToActive();
        }

        updateActiveFromScroll() {
            if (this.sortedMessages.length === 0) return;
            if (this.chatgptHoverHydrationRestore || this.isRestoringChatgptHoverScroll) return;

            // 调试日志（只输出前几次）
            if (!this.updateScrollCallCount) this.updateScrollCallCount = 0;
            this.updateScrollCallCount++;
            if (this.updateScrollCallCount <= 3) {
                console.log(`[AI Timeline] updateActiveFromScroll 调用 #${this.updateScrollCallCount}`);
            }

            const currentScrollHeight = this.scrollContainer.scrollHeight;
            if (this.lastScrollHeight && Math.abs(this.lastScrollHeight - currentScrollHeight) > 100) {
                this.lastScrollHeight = currentScrollHeight;
                const currentMsgCount = this.getTimelineItemDomCount();
                if (currentMsgCount !== this.messageMap.size) {
                    this.debouncedFullRebuild();
                    return;
                }
                this.refreshPositions();
            }
            this.lastScrollHeight = currentScrollHeight;

            // 【修复】检测是否已滚动到底部
            // 对于 ChatGPT 的文档级滚动，使用更严格的检测逻辑
            const scrollTop = this.scrollContainer.scrollTop;
            const clientHeight = this.scrollContainer.clientHeight;
            const scrollableDistance = currentScrollHeight - clientHeight;

            // 只有当滚动位置超过可滚动距离的 95% 时才认为在底部
            // 这可以避免 ChatGPT 固定输入区域导致的误判
            const scrollRatio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;
            const isAtBottom = scrollRatio > 0.95 && scrollableDistance > 100;

            let closestMsg = null;

            const lockedHydrationMsg = this.chatgptHydrationTargetId
                ? this.messageMap.get(this.chatgptHydrationTargetId)
                : null;
            if (isAtBottom && lockedHydrationMsg?.needsHydration && this.activeNodeId === this.chatgptHydrationTargetId) {
                closestMsg = lockedHydrationMsg;
            } else if (isAtBottom && this.sortedMessages.length > 0) {
                // 滚动到底部时，强制激活最后一个节点
                closestMsg = this.sortedMessages[this.sortedMessages.length - 1];
                // 【修复】日志节流，每 2 秒最多输出一次
                const now = Date.now();
                if (now - this.lastBottomLogTime > 2000) {
                    console.log('[AI Timeline] 检测到已滚动到底部，强制激活最后节点');
                    this.lastBottomLogTime = now;
                }
            } else {
                // 正常的 35% 判定线逻辑
                const containerRect = this.scrollContainer.getBoundingClientRect();
                const viewportCenter = containerRect.top + containerRect.height * 0.35;

                let closestDistance = Infinity;
                for (const msg of this.sortedMessages) {
                    if (!msg.el || !msg.el.isConnected) continue;
                    const rect = msg.el.getBoundingClientRect();
                    const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
                    if (distance < closestDistance) { closestDistance = distance; closestMsg = msg; }
                }
            }

            if (closestMsg && closestMsg.stableId !== this.activeNodeId) {
                this.activeNodeId = closestMsg.stableId;
                this.refreshActiveVisual();
            }
        }

        showTooltip(node) {
            if (!node?.dataset?.id || !this.ui.tooltip) return;
            const data = this.renderedNodes.get(node.dataset.id) || this.messageMap.get(node.dataset.id);
            if (!data) return;

            const messageMeta = this.getFullMessageMeta(node.dataset.id);
            const fullText = messageMeta.text || data.text || '';
            const labelText = messageMeta.label || data.label || '提问';
            const canCopy = messageMeta.canCopy !== false && Boolean(normalizeText(fullText));
            const copyButtonText = canCopy
                ? (messageMeta.copyLabel || data.copyLabel || (labelText === '提问' ? '复制提问' : '复制内容'))
                : '内容未加载';
            const previewText = fullText.substring(0, CONFIG.PREVIEW_TEXT_LENGTH);

            while (this.ui.tooltip.firstChild) this.ui.tooltip.removeChild(this.ui.tooltip.firstChild);

            const labelDiv = document.createElement('div');
            labelDiv.className = 'ai-timeline-tooltip-label';
            labelDiv.textContent = labelText;

            const textDiv = document.createElement('div');
            textDiv.className = 'ai-timeline-tooltip-text';
            textDiv.textContent = previewText + (fullText.length > CONFIG.PREVIEW_TEXT_LENGTH ? '...' : '') || CHATGPT_UNLOADED_PLACEHOLDER;

            const copyBtn = document.createElement('button');
            copyBtn.className = 'ai-timeline-tooltip-copy';

            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            const path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z');
            svg.appendChild(path);

            const span = document.createElement('span');
            span.textContent = copyButtonText;

            copyBtn.appendChild(svg);
            copyBtn.appendChild(span);
            if (canCopy) {
                copyBtn.onclick = (e) => { e.stopPropagation(); copyToClipboard(fullText, copyBtn, copyButtonText); };
            } else {
                copyBtn.disabled = true;
                copyBtn.setAttribute('aria-label', '内容加载后可复制');
            }

            this.ui.tooltip.appendChild(labelDiv);
            this.ui.tooltip.appendChild(textDiv);
            this.ui.tooltip.appendChild(copyBtn);

            const nodeRect = node.getBoundingClientRect();
            const barRect = this.ui.bar.getBoundingClientRect();

            this.ui.tooltip.style.right = `${window.innerWidth - barRect.left + 12}px`;
            this.ui.tooltip.style.top = `${nodeRect.top + nodeRect.height / 2}px`;
            this.ui.tooltip.style.transform = 'translateY(-50%)';
            this.ui.tooltip.classList.add('visible');

            if (this.ui.hitZone) {
                requestAnimationFrame(() => {
                    const tooltipRect = this.ui.tooltip.getBoundingClientRect();
                    this.ui.hitZone.style.left = `${tooltipRect.right}px`;
                    this.ui.hitZone.style.top = `${nodeRect.top - 5}px`;
                    this.ui.hitZone.style.width = `${Math.max(0, barRect.left - tooltipRect.right)}px`;
                    this.ui.hitZone.style.height = `${nodeRect.height + 10}px`;
                    this.ui.hitZone.style.display = 'block';
                });
            }
        }

        getFullMessageMeta(id) {
            const msg = this.messageMap.get(id);
            if (!msg) {
                return {
                    text: CHATGPT_UNLOADED_PLACEHOLDER,
                    label: '提问',
                    copyLabel: '内容未加载',
                    canCopy: false
                };
            }
            const needsHydration = Boolean(msg.needsHydration);
            const text = msg.fullText || msg.text || (needsHydration ? CHATGPT_UNLOADED_PLACEHOLDER : '');
            return {
                text,
                label: msg.label || '提问',
                copyLabel: needsHydration ? '内容未加载' : (msg.copyLabel || (msg.label === '提问' ? '复制提问' : '复制内容')),
                needsHydration,
                canCopy: !needsHydration && Boolean(normalizeText(text))
            };
        }

        getFullMessageText(id) {
            return this.getFullMessageMeta(id).text;
        }

        hideTooltip() {
            if (this.ui.tooltip) this.ui.tooltip.classList.remove('visible');
            if (this.ui.hitZone) this.ui.hitZone.style.display = 'none';
        }

        scheduleTooltipHide() {
            if (this.tooltipHideTimer) clearTimeout(this.tooltipHideTimer);
            this.tooltipHideTimer = setTimeout(() => {
                if (!this.currentHoverNode && !this.isMouseOverTooltip && !this.isMouseOverHitZone) this.hideTooltip();
            }, CONFIG.TOOLTIP_HIDE_DELAY);
        }

        clearAllTimers() {
            [this.hoverTimer, this.tooltipHideTimer, this.longPressTimer].forEach(t => t && clearTimeout(t));
            this.hoverTimer = this.tooltipHideTimer = this.longPressTimer = null;
        }

        findTimelineAnchorById(id) {
            const msg = this.messageMap.get(id);
            if (!msg) return null;

            if (msg.sectionTestId) {
                const section = document.querySelector(`section[data-testid="${msg.sectionTestId}"]`);
                if (!section) return null;
                return this.findChatgptTurnAnchor(section)
                    || section.querySelector(this.adapter.userMessageSelector)
                    || section;
            }

            const userMessages = document.querySelectorAll(this.adapter.userMessageSelector);
            for (let i = 0; i < userMessages.length; i++) {
                if (this.generateStableId(userMessages[i], i) === id) {
                    return userMessages[i];
                }
            }
            return null;
        }

        scrollToMarker(id) {
            const msg = this.messageMap.get(id);
            if (!msg) return;
            let targetEl = msg.el;
            if (this.adapter.name === 'ChatGPT' && msg.sectionTestId) {
                const targetSection = this.findChatgptSection(msg.sectionTestId);
                const stableAnchor = this.findChatgptTurnAnchor(targetSection);
                if (stableAnchor) {
                    targetEl = stableAnchor;
                    msg.el = stableAnchor;
                }
            }
            if (!targetEl || !targetEl.isConnected) {
                targetEl = this.findTimelineAnchorById(id);
                if (targetEl) {
                    msg.el = targetEl;
                }
            }
            if (targetEl?.isConnected) {
                this.activeNodeId = id;
                this.renderWindow();
                this.observeChatgptTurnHydration(id);
                if (this.scrollContainer && typeof this.scrollContainer.scrollTo === 'function') {
                    const containerRect = this.scrollContainer.getBoundingClientRect();
                    const targetRect = targetEl.getBoundingClientRect();
                    const targetTop = this.scrollContainer.scrollTop + targetRect.top - containerRect.top - 16;
                    this.scrollContainer.scrollTo({
                        top: Math.max(0, targetTop),
                        behavior: CONFIG.SCROLL_BEHAVIOR
                    });
                    this.scrollContainer.scrollTop = Math.max(0, targetTop);
                } else {
                    targetEl.scrollIntoView({ behavior: CONFIG.SCROLL_BEHAVIOR, block: 'start' });
                }
            } else {
                this.fullRebuild();
            }
        }

        toggleMark(id) {
            if (this.markedIds.has(id)) this.markedIds.delete(id);
            else this.markedIds.add(id);
            this.saveMarks();
            if (this.renderedNodes.has(id)) {
                this.renderedNodes.get(id).node.classList.toggle('marked', this.markedIds.has(id));
            }
        }

        setupEventListeners() {
            const trackContent = this.ui.trackContent;

            trackContent.addEventListener('mousedown', this.handleMouseDown.bind(this));
            trackContent.addEventListener('mouseup', this.handleMouseUp.bind(this));

            this.ui.bar.addEventListener('mouseleave', (e) => {
                this.clearAllTimers();
                this.currentHoverNode = null;
                if (e.relatedTarget && (this.ui.tooltip?.contains(e.relatedTarget) || this.ui.hitZone?.contains(e.relatedTarget))) return;
                this.scheduleTooltipHide();
            });

            this.ui.tooltip.addEventListener('mouseenter', () => {
                this.isMouseOverTooltip = true;
                if (this.tooltipHideTimer) { clearTimeout(this.tooltipHideTimer); this.tooltipHideTimer = null; }
            });

            this.ui.tooltip.addEventListener('mouseleave', (e) => {
                this.isMouseOverTooltip = false;
                if (e.relatedTarget?.closest?.('.ai-timeline-node') || this.ui.hitZone?.contains(e.relatedTarget)) return;
                this.scheduleTooltipHide();
            });

            if (this.ui.hitZone) {
                this.ui.hitZone.addEventListener('mouseenter', () => {
                    this.isMouseOverHitZone = true;
                    if (this.tooltipHideTimer) { clearTimeout(this.tooltipHideTimer); this.tooltipHideTimer = null; }
                });

                this.ui.hitZone.addEventListener('mouseleave', (e) => {
                    this.isMouseOverHitZone = false;
                    if (e.relatedTarget?.closest?.('.ai-timeline-node') || this.ui.tooltip?.contains(e.relatedTarget)) return;
                    this.scheduleTooltipHide();
                });
            }

            // 滚动同步：监听 scrollContainer
            this.scrollEventCount = 0; // 调试计数器
            this.handleScroll = () => {
                this.scrollEventCount++;
                if (this.scrollEventCount <= 3) {
                    console.log(`[AI Timeline] 捕获到滚动事件 #${this.scrollEventCount}`);
                }
                if (this.scrollSyncRAF) return;
                this.scrollSyncRAF = requestAnimationFrame(() => {
                    const isHoverPreloadScroll = this.chatgptHoverHydrationRestore || this.isRestoringChatgptHoverScroll;
                    this.updateActiveFromScroll();
                    if (!isHoverPreloadScroll && !this.currentHoverNode && !this.isMouseOverTooltip && !this.isMouseOverHitZone) {
                        this.hideTooltip();
                    }
                    this.scrollSyncRAF = null;
                });
            };

            this.scrollContainer.addEventListener('scroll', this.handleScroll, { passive: true });
            console.log('[AI Timeline] 已绑定滚动监听到:', this.scrollContainer.tagName, this.scrollContainer.className?.substring(0, 40));

            // ChatGPT 备份方案：使用捕获模式监听全局滚动，因为 ChatGPT 的滚动可能在不同层级
            if (this.adapter.name === 'ChatGPT') {
                document.addEventListener('scroll', this.handleScroll, { passive: true, capture: true });
                console.log('[AI Timeline] 已添加 ChatGPT 全局滚动监听');
            }

        }

        handleMouseDown(e) {
            const node = e.target.closest('.ai-timeline-node');
            if (!node) return;
            this.hideTooltip();
            if (this.hoverTimer) { clearTimeout(this.hoverTimer); this.hoverTimer = null; }
            if (this.longPressTimer) clearTimeout(this.longPressTimer);

            this.longPressTarget = node;
            this.isLongPressed = false;
            node.classList.add('pressing');

            this.longPressTimer = setTimeout(() => {
                this.isLongPressed = true;
                node.classList.remove('pressing');
                this.toggleMark(node.dataset.id);
                if (navigator.vibrate) navigator.vibrate(50);
            }, CONFIG.LONG_PRESS_DURATION);
        }

        handleMouseUp() {
            const node = this.longPressTarget;
            if (!node) return;
            node.classList.remove('pressing');
            if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
            this.longPressTarget = null;
        }

        setupObservers() {
            this.mutationObserver = new MutationObserver((mutations) => {
                if (mutations.some(m => m.type === 'childList')) this.debouncedFullRebuild();
            });
            this.mutationObserver.observe(this.container, { childList: true, subtree: true });

            this.pollIntervalId = setInterval(() => {
                const currentMsgCount = this.getTimelineItemDomCount();
                if (currentMsgCount !== this.messageMap.size && currentMsgCount > 0) this.fullRebuild();
            }, 1500);

            this.handleResize = () => this.renderWindow();
            window.addEventListener('resize', this.handleResize);
        }

        loadMarks() {
            const convId = this.adapter.getConversationId();
            if (!convId) return new Set();
            try {
                const data = localStorage.getItem(CONFIG.STORAGE_PREFIX + convId);
                return data ? new Set(JSON.parse(data)) : new Set();
            } catch (e) { return new Set(); }
        }

        saveMarks() {
            const convId = this.adapter.getConversationId();
            if (!convId) return;
            try {
                localStorage.setItem(CONFIG.STORAGE_PREFIX + convId, JSON.stringify([...this.markedIds]));
            } catch (e) { }
        }

        destroy() {
            this.clearChatgptHoverHydration();
            this.clearChatgptHydrationObserver();
            this.mutationObserver?.disconnect();
            this.clearAllTimers();
            if (this.scrollSyncRAF) cancelAnimationFrame(this.scrollSyncRAF);
            if (this.pollIntervalId) clearInterval(this.pollIntervalId);
            if (this.handleScroll && this.scrollContainer) {
                this.scrollContainer.removeEventListener('scroll', this.handleScroll);
            }
            if (this.handleScroll) {
                document.removeEventListener('scroll', this.handleScroll, { capture: true });
            }
            if (this.handleResize) {
                window.removeEventListener('resize', this.handleResize);
            }
            this.ui.bar?.remove();
            this.ui.tooltip?.remove();
            this.ui.hitZone?.remove();
            this.isInitialized = false;
        }
    }

    // === URL 监听器 (Local SPA Monitor) ===
    class UrlMonitor {
        constructor() {
            this.callbacks = new Set();
            this.lastHref = location.href;
            this.timer = null;
        }

        start() {
            // 1. Monkey patch history API
            const pushState = history.pushState;
            history.pushState = (...args) => {
                const ret = pushState.apply(history, args);
                this.checkUrl();
                return ret;
            };

            const replaceState = history.replaceState;
            history.replaceState = (...args) => {
                const ret = replaceState.apply(history, args);
                this.checkUrl();
                return ret;
            };

            // 2. Listen to popstate
            window.addEventListener('popstate', () => this.checkUrl());

            // 3. Polling backup (for edge cases)
            this.timer = setInterval(() => this.checkUrl(), 1000);
        }

        checkUrl() {
            if (location.href !== this.lastHref) {
                this.lastHref = location.href;
                this.notify();
            }
        }

        onChange(callback) {
            this.callbacks.add(callback);
        }

        notify() {
            this.callbacks.forEach(cb => cb());
        }
    }

    // === 主程序执行 ===

    let currentController = null;
    const urlMonitor = new UrlMonitor();

    // 路由变更处理
    const handleRouteChange = async () => {
        // 检查是否启用
        try {
            const result = await chrome.storage.local.get('timeline_enabled');
            if (result.timeline_enabled === false) return;
        } catch (e) { }

        // 站点适配器（仅 ChatGPT）
        const adapter = ADAPTER;

        // 无论是否是对话页，先销毁旧的时间轴 (防止主页残留)
        if (currentController) {
            currentController.destroy();
            currentController = null;
        }

        // 只有在明确的对话页面才初始化
        if (adapter.isConversationPage(location.pathname)) {
            console.log(`[AI Timeline] 进入对话页: ${location.pathname}`);
            currentController = new TimelineController(adapter);
            await currentController.init();
        } else {
            console.log(`[AI Timeline] 非对话页，保持静默`);
        }
    };

    // 启动监听
    urlMonitor.onChange(() => {
        console.log('[AI Timeline] 路由变更检测');
        handleRouteChange();
    });
    urlMonitor.start();

    // 监听 Service Worker 的重置请求 (Backup)
    window.addEventListener('ai-timeline-reinit', () => {
        console.log('[AI Timeline] 收到外部重置请求');
        handleRouteChange();
    });

    // 首次执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handleRouteChange);
    } else {
        handleRouteChange();
    }

})();





