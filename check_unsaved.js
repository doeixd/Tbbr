const STATE_ATTRIBUTE = 'data-tbbr-beforeunload-active';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'checkUnsaved') {
        const state = document.documentElement?.getAttribute(STATE_ATTRIBUTE);
        const hasUnsavedChanges = state === null ? true : state === '1';
        sendResponse({ hasUnsavedChanges });
    }
});
