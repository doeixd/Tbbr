const STATE_ATTRIBUTE = 'data-tbbr-beforeunload-active';
const INJECTED_FLAG = 'data-tbbr-beforeunload-installed';

function injectBeforeUnloadTracker() {
    const root = document.documentElement;
    if (!root || root.hasAttribute(INJECTED_FLAG)) {
        return;
    }

    root.setAttribute(INJECTED_FLAG, '1');

    const script = document.createElement('script');
    script.textContent = `(() => {
        const root = document.documentElement;
        if (!root) return;

        const stateAttribute = ${JSON.stringify(STATE_ATTRIBUTE)};
        let beforeUnloadListenerCount = 0;
        let beforeUnloadPropertyHandler = null;
        const trackedListeners = new WeakMap();

        const syncState = () => {
            const hasHandler = beforeUnloadListenerCount > 0 || typeof beforeUnloadPropertyHandler === 'function';
            root.setAttribute(stateAttribute, hasHandler ? '1' : '0');
        };

        const normalizeCapture = (options) => {
            if (typeof options === 'boolean') {
                return options;
            }
            return !!(options && options.capture);
        };

        const rememberListener = (listener, options) => {
            if (!listener || (typeof listener !== 'function' && typeof listener !== 'object')) {
                return;
            }

            const capture = normalizeCapture(options);
            let captures = trackedListeners.get(listener);
            if (!captures) {
                captures = new Set();
                trackedListeners.set(listener, captures);
            }

            if (!captures.has(capture)) {
                captures.add(capture);
                beforeUnloadListenerCount += 1;
                syncState();
            }
        };

        const forgetListener = (listener, options) => {
            if (!listener || (typeof listener !== 'function' && typeof listener !== 'object')) {
                return;
            }

            const captures = trackedListeners.get(listener);
            if (!captures) {
                return;
            }

            const capture = normalizeCapture(options);
            if (captures.delete(capture)) {
                beforeUnloadListenerCount = Math.max(0, beforeUnloadListenerCount - 1);
                syncState();
            }

            if (captures.size === 0) {
                trackedListeners.delete(listener);
            }
        };

        const originalAddEventListener = window.addEventListener;
        const originalRemoveEventListener = window.removeEventListener;

        window.addEventListener = function(type, listener, options) {
            if (type === 'beforeunload') {
                rememberListener(listener, options);
            }
            return originalAddEventListener.call(this, type, listener, options);
        };

        window.removeEventListener = function(type, listener, options) {
            if (type === 'beforeunload') {
                forgetListener(listener, options);
            }
            return originalRemoveEventListener.call(this, type, listener, options);
        };

        const descriptor = Object.getOwnPropertyDescriptor(Window.prototype, 'onbeforeunload');
        if (descriptor && descriptor.configurable) {
            Object.defineProperty(window, 'onbeforeunload', {
                configurable: true,
                enumerable: descriptor.enumerable ?? true,
                get() {
                    return beforeUnloadPropertyHandler;
                },
                set(value) {
                    beforeUnloadPropertyHandler = typeof value === 'function' ? value : null;
                    syncState();
                    if (descriptor.set) {
                        descriptor.set.call(this, value);
                    }
                }
            });
        } else {
            beforeUnloadPropertyHandler = typeof window.onbeforeunload === 'function' ? window.onbeforeunload : null;
        }

        syncState();
    })();`;

    script.remove = script.remove || function() {
        if (this.parentNode) {
            this.parentNode.removeChild(this);
        }
    };

    (document.head || root).appendChild(script);
    script.remove();
}

injectBeforeUnloadTracker();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'checkUnsaved') {
        const state = document.documentElement?.getAttribute(STATE_ATTRIBUTE);
        const hasUnsavedChanges = state === null ? true : state === '1';
        sendResponse({ hasUnsavedChanges });
    }
});
