if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.connect) {
    let port;
    let isInside = false;

    function connect() {
        // Name the port to identify it in the background script
        port = chrome.runtime.connect({ name: "mouse-tracker" });

        // When the connection is lost, clean up and try to reconnect
        port.onDisconnect.addListener(() => {
            port = null;
            // A small delay before reconnecting to avoid spamming connection requests
            setTimeout(connect, 1000);
        });
    }

    // Initial connection attempt
    connect();

    function postMessage(message) {
        // Only post if the port is active
        if (port) {
            try {
                port.postMessage(message);
            } catch (error) {
                // This can happen if the port is disconnected while a message is being sent
                if (error.message.includes("Attempting to use a disconnected port")) {
                    console.log("Tbbr: Port disconnected, will reconnect shortly.");
                } else {
                    console.error("Tbbr: Error posting message:", error);
                }
            }
        }
    }

    function handleMouseEnter() {
        if (!isInside) {
            isInside = true;
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
            postMessage({ type: "mouse_leave" });
        }
    }

    // Add event listeners
    window.addEventListener('mouseover', handleMouseEnter);
    window.addEventListener('mouseout', handleMouseLeave);
    window.addEventListener('blur', handleMouseLeave);

} else {
    console.log("Tbbr: Mouse tracker not loaded. Extension APIs not available in this context.");
}
