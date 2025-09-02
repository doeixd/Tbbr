// This script can be injected into pages where extension APIs are not available
// (e.g., about:blank, or during certain navigation phases).
// We add a guard clause to ensure we don't try to run if the APIs are missing.
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
    // Use a flag to track mouse state to avoid sending redundant messages.
    let isInside = false;

    // Define the event handler functions so they can be referenced for removal.
    function handleMouseEnter() {
        if (!isInside) {
            isInside = true;
            sendMessage({ type: "mouse_enter" });
        }
    }

    function handleMouseLeave(e) {
        // When the mouse leaves the viewport entirely, relatedTarget will be null.
        // We also check for the blur event case where 'e' might be undefined or not a MouseEvent.
        if (e instanceof MouseEvent && e.type === 'mouseout' && e.relatedTarget !== null) {
            return; // Not a true leave event, just moving between elements.
        }

        if (isInside) {
            isInside = false;
            sendMessage({ type: "mouse_leave" });
        }
    }

    // A wrapper for sendMessage to handle errors gracefully.
    function sendMessage(message) {
        try {
            // The promise-based sendMessage can still throw a synchronous error
            // if the extension context is invalidated.
            chrome.runtime.sendMessage(message).catch(err => {
                // This catch block handles asynchronous errors.
                // We only want to suppress the "no receiving end" error, which is
                // expected during extension reloads.
                if (err.message && !err.message.includes('Receiving end does not exist')) {
                    console.error("Tbbr: Unexpected async error sending message:", err);
                }
            });
        } catch (e) {
            // This catch block handles synchronous errors, primarily the
            // "Extension context invalidated" error.
            if (e.message && e.message.includes('Extension context invalidated')) {
                // If the context is gone, we can't send messages anymore.
                // The best course of action is to clean up our listeners to
                // prevent this error from firing again on this page.
                console.log("Tbbr: Extension context invalidated. Removing mouse listeners for this page.");
                cleanupEventListeners();
            } else {
                // For any other unexpected synchronous errors, log them.
                console.error("Tbbr: Unexpected error sending message:", e);
            }
        }
    }

    function cleanupEventListeners() {
        window.removeEventListener('mouseover', handleMouseEnter);
        window.removeEventListener('mouseout', handleMouseLeave);
        window.removeEventListener('blur', handleMouseLeave);
    }

    // Add the event listeners.
    window.addEventListener('mouseover', handleMouseEnter);
    window.addEventListener('mouseout', handleMouseLeave);
    window.addEventListener('blur', handleMouseLeave);

} else {
    // If the APIs are not available, do nothing and log a message for debugging.
    // This helps avoid errors on pages where content scripts might be injected
    // but can't run properly (e.g., some browser-internal pages).
    console.log("Tbbr: Mouse tracker not loaded. Extension APIs not available in this context.");
}
