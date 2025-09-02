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
    // We also check for the blur event case where 'e' might be undefined.
    if (e.type === 'mouseout' && e.relatedTarget !== null) {
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
            // This catch block handles asynchronous errors, like the receiving
            // end not existing. We can safely ignore this error as it's
            // expected during extension reloads.
        });
    } catch (e) {
        // This catch block handles synchronous errors, primarily the
        // "Extension context invalidated" error.
        if (e.message.includes('Extension context invalidated')) {
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
