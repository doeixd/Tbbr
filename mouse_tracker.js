// Use a flag to track mouse state to avoid sending redundant messages.
let isInside = false;

// Function to handle sending mouse enter messages.
function handleMouseEnter() {
    if (!isInside) {
        isInside = true;
        chrome.runtime.sendMessage({ type: "mouse_enter" }).catch(err => {
            // Suppress "Receiving end does not exist" errors, which can happen
            // during extension reloads or page navigation.
            if (!err.message.includes('Receiving end does not exist')) {
                console.error("Error sending mouse_enter message:", err);
            }
        });
    }
}

// Function to handle sending mouse leave messages.
function handleMouseLeave() {
    if (isInside) {
        isInside = false;
        chrome.runtime.sendMessage({ type: "mouse_leave" }).catch(err => {
            if (!err.message.includes('Receiving end does not exist')) {
                console.error("Error sending mouse_leave message:", err);
            }
        });
    }
}

// Listen for mouseover and mouseout on the window. This is more reliable
// for catching events on the entire viewport, including iframes.
window.addEventListener('mouseover', handleMouseEnter);
window.addEventListener('mouseout', (e) => {
    // When the mouse leaves the viewport entirely, relatedTarget will be null.
    if (e.relatedTarget === null) {
        handleMouseLeave();
    }
});

// Also, listen for the blur event on the window. This can happen if the user
// switches to another application or clicks into an iframe, which is a good
// time to consider the mouse as "left".
window.addEventListener('blur', handleMouseLeave);
