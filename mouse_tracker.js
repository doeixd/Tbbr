if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.connect) {
    let port;
    let isInside = false;

    function connect() {
        // If a port already exists or we are in the process of connecting, do nothing.
        if (port) return;

        try {
            // Name the port to identify it in the background script
            port = chrome.runtime.connect({ name: "mouse-tracker" });

            // When the connection is lost (e.g., background script reloads),
            // clean up and prepare for a potential reconnect.
            port.onDisconnect.addListener(() => {
                // Setting port to null is the signal that we are disconnected.
                port = null;
            });
        } catch (error) {
            // **FIX #1: Catch the "Extension context invalidated" error.**
            // This happens synchronously if the extension was reloaded/disabled.
            if (error.message.includes("Extension context invalidated")) {
                console.log("Tbbr: Context invalidated. Listeners will be removed.");
                // We can't communicate anymore, so clean up all event listeners on this page.
                cleanupEventListeners();
            } else {
                // Re-throw other unexpected errors.
                throw error;
            }
        }
    }

    // Initial connection attempt
    connect();

    function postMessage(message) {
        // Only post if the port is active and connected.
        if (port) {
            try {
                port.postMessage(message);
            } catch (error) {
                // This can happen if the port is disconnected while a message is being sent.
                // The onDisconnect listener will handle the cleanup.
                if (error.message.includes("Attempting to use a disconnected port")) {
                    console.log("Tbbr: Port was disconnected. It will be reconnected on the next event or page load.");
                } else {
                    console.error("Tbbr: Error posting message:", error);
                }
            }
        }
    }

    function handleMouseEnter() {
        if (!isInside) {
            isInside = true;
            // If the port was disconnected (e.g. by BFCache), reconnect before sending.
            if (!port) connect();
            postMessage({ type: "mouse_enter" });
        }
    }

    function handleMouseLeave(e) {
        // Ignore mouseout events that are just moving between elements within the page
        if (e instanceof MouseEvent && e.type === 'mouseout' && e.relatedTarget !== null) {
            return;
        }

        if (isInside) {
            isInside = false;
            // If the port was disconnected, reconnect before sending.
            if (!port) connect();
            postMessage({ type: "mouse_leave" });
        }
    }

    // **FIX #2: Add a listener for the `pageshow` event to handle BFCache restoration.**
    function handlePageShow(event) {
        // event.persisted is true if the page was restored from the BFCache.
        if (event.persisted) {
            // The port was likely closed. Re-establish the connection.
            console.log("Tbbr: Page restored from BFCache. Reconnecting port.");
            connect();
        }
    }

    // A single function to remove all active listeners.
    function cleanupEventListeners() {
        window.removeEventListener('mouseover', handleMouseEnter);
        window.removeEventListener('mouseout', handleMouseLeave);
        window.removeEventListener('blur', handleMouseLeave);
        window.removeEventListener('pageshow', handlePageShow);
    }

    // Add all event listeners
    window.addEventListener('mouseover', handleMouseEnter);
    window.addEventListener('mouseout', handleMouseLeave);
    window.addEventListener('blur', handleMouseLeave);
    window.addEventListener('pageshow', handlePageShow); // Add the new listener

} else {
    console.log("Tbbr: Mouse tracker not loaded. Extension APIs not available in this context.");
}
