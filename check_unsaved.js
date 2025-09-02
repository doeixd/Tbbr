
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'checkUnsaved') {
        // This is a best-effort check. A page having a beforeunload listener
        // is a strong indicator of unsaved changes.
        const hasUnsavedChanges = window.onbeforeunload !== null;
        sendResponse({ hasUnsavedChanges: hasUnsavedChanges });
    }
});
