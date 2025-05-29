const listOfLetters = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', 'u', 'i', 'o', 'p', 'n', 'm', ',', '.', 'q', 'w', 'e', 'r', 't', 'y', 'b', 'v', 'c', 'x', 'z'];

let isMouseInsidePage = true;
let tabMoveTimeoutId = null;
// Store tabId, initialDuration (remaining time), startTime, and timePaused
let pendingMoveInfo = {
    tabId: null,
    initialDuration: 5000, // The full duration, or remaining duration when paused
    startTime: 0,       // Timestamp when timer (re)started
    timePaused: 0       // Timestamp when timer was paused
};

chrome.commands.onCommand.addListener((command) => {
  if (!(command == 'pick')) return
  chrome.tabs.query({ currentWindow: true }, (tabList) => {
    if (!tabList.length) return;
    tabList.forEach((tab) => {
      if (tab.active) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [listOfLetters],
          func: function(listOfLetters) {
            const focus = document.createElement('input')
            focus.style.cssText += `position:fixed;opacity:0;top:50%;`
            document.querySelector('body').appendChild(focus)
            focus.focus()
            const tID = setTimeout(() => focus.removeEventListener('keydown', listenForKey), 5001)
            function listenForKey(e) {
              if (listOfLetters.includes(e.key)) {
                focus.blur()
                focus.remove()
                var extensionID = chrome.runtime.id
                chrome.runtime.sendMessage(extensionID, { key: e.key })
                window.postMessage({ key: e.key, type: "FROM_PAGE" }, "*")
                window.dispatchEvent(new Event('picked'))
                clearTimeout(tID)
              }
            }
            // Changed from 'keypress' to 'keydown' to potentially catch more keys, and added { once: true } for safety
            document.addEventListener('keydown', listenForKey, { once: true });
          }
        });
      }
      const title = listOfLetters[tab.index] ?? tab.index.toString(); // Ensure title is a string
      chrome.scripting.executeScript(
        {
          func: function(title) {
            // Ensure document.oldTitle is captured only if not already set by this script
            if (typeof document.oldTitle === 'undefined' || !document.title.startsWith(title + ':')) {
                 document.oldTitle = document.title;
            }
            document.title = title + ': ' + document.oldTitle;
            setTimeout(function() {
              // Check if the title is still the one set by the script before reverting
              if (document.title.startsWith(title + ':')) {
                document.title = document.oldTitle;
              }
            }, 3000);
          },
          args: [title],
          target: {
            tabId: tab.id,
            allFrames: true, // Consider if allFrames is truly needed here or if it causes issues
          }
        }
      );
    });
  });
});

chrome.tabs.onActivated.addListener(activeInfo => {
    console.log(`Tab activated: ${activeInfo.tabId}. Current tabMoveTimeoutId: ${tabMoveTimeoutId}`);
    // Clear any existing timer for a previous tab
    if (tabMoveTimeoutId) {
        clearTimeout(tabMoveTimeoutId);
        console.log(`Cleared existing timer ${tabMoveTimeoutId} for previous tab.`);
        tabMoveTimeoutId = null;
    }
    
    // Initialize pendingMoveInfo for the newly activated tab
    pendingMoveInfo = {
        tabId: activeInfo.tabId,
        initialDuration: 5000, // Reset to full duration
        startTime: Date.now(), // Set current time as start
        timePaused: 0 
    };

    console.log(`Tab activated: ${activeInfo.tabId}. Mouse is ${isMouseInsidePage ? 'inside' : 'outside'}. Pending info set.`);
    if (isMouseInsidePage) {
        startMoveTimer(activeInfo.tabId, pendingMoveInfo.initialDuration);
    }
    // If mouse is outside, timer will be started by mouse_enter event
});

function startMoveTimer(tabId, duration) {
    if (tabMoveTimeoutId) { // Should ideally be cleared before calling, but as a safeguard
        clearTimeout(tabMoveTimeoutId); 
        console.log(`Cleared pre-existing timer ${tabMoveTimeoutId} before starting new one.`);
    }
    
    pendingMoveInfo.startTime = Date.now(); // Record start time
    pendingMoveInfo.tabId = tabId; // Ensure tabId is correctly set for this timer
    // Ensure initialDuration in pendingMoveInfo is also set to this duration
    pendingMoveInfo.initialDuration = duration;


    tabMoveTimeoutId = setTimeout(async () => {
        console.log(`Timer callback fired for tab ${tabId}. Mouse is ${isMouseInsidePage ? 'inside' : 'outside'}.`);
        if (!isMouseInsidePage) {
            // If mouse left while timer was running, it should have been paused by mouse_leave.
            // This check is a safeguard.
            console.log(`Timer for tab ${tabId} expired, but mouse is outside. Awaiting re-entry.`);
            // Do not reset tabMoveTimeoutId here, mouse_leave should have handled it or will handle it.
            return; 
        }

        const [currentActiveTab] = await chrome.tabs.query({ currentWindow: true, active: true });
        if (currentActiveTab && currentActiveTab.id === tabId) {
            console.log(`Timer expired for tab ${tabId}. Moving it to index 0.`);
            try {
                await chrome.tabs.move(tabId, { index: 0 });
                 console.log(`Tab ${tabId} moved successfully.`);
            } catch (error) {
                console.error(`Error moving tab ${tabId}:`, error);
                // Optional: Retry logic or specific error handling
                if (error.message.includes('Tabs cannot be edited right now')) {
                    // Potentially retry after a short delay, but be careful of loops
                    // For now, just log it.
                }
            }
        } else {
            console.log(`Timer expired for tab ${tabId}, but it's no longer active or conditions not met. Active tab is ${currentActiveTab ? currentActiveTab.id : 'none'}.`);
        }
        tabMoveTimeoutId = null; // Timer has finished its job or conditions not met
        // Reset parts of pendingMoveInfo related to active timing, but keep tabId for context if needed
        pendingMoveInfo.startTime = 0;
        pendingMoveInfo.timePaused = 0;
        // pendingMoveInfo.initialDuration = 0; // Mark as completed or not needing to run further

    }, duration);
    console.log(`Timer started for tab ${tabId} with duration ${duration}ms. ID: ${tabMoveTimeoutId}`);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { key, type } = message; // Destructure key and type from message

    if (type === 'mouse_leave') {
        console.log(`Mouse left page. Tab: ${pendingMoveInfo.tabId}. Current timer ID: ${tabMoveTimeoutId}`);
        isMouseInsidePage = false;
        if (tabMoveTimeoutId && pendingMoveInfo.tabId) { // Check if a timer was running for a tab
            const elapsedTime = Date.now() - pendingMoveInfo.startTime;
            const remaining = pendingMoveInfo.initialDuration - elapsedTime;
            
            clearTimeout(tabMoveTimeoutId);
            console.log(`Cleared timer ${tabMoveTimeoutId} due to mouse_leave.`);
            tabMoveTimeoutId = null;
            
            if (remaining > 0) {
                pendingMoveInfo.initialDuration = remaining; // Update duration to remaining
                pendingMoveInfo.timePaused = Date.now(); // Record when it was paused
                console.log(`Timer for tab ${pendingMoveInfo.tabId} paused. Remaining: ${remaining}ms`);
            } else {
                console.log(`Timer for tab ${pendingMoveInfo.tabId} had ${remaining}ms left. Considered expired or negligible.`);
                pendingMoveInfo.initialDuration = 0; // Mark as no time left
                pendingMoveInfo.timePaused = Date.now(); // Still note when it was "paused" even if time is up
            }
        } else {
            console.log("Mouse left, but no active timer to pause or tabId not set in pendingMoveInfo.");
        }
    } else if (type === 'mouse_enter') {
        console.log(`Mouse entered page. Tab: ${pendingMoveInfo.tabId}. Remaining duration: ${pendingMoveInfo.initialDuration}ms.`);
        isMouseInsidePage = true;
        // Check if there's a tab that was pending and has time remaining
        if (pendingMoveInfo.tabId && pendingMoveInfo.initialDuration > 0) {
            if (pendingMoveInfo.timePaused > 0) { // It was genuinely paused
                console.log(`Resuming timer for tab ${pendingMoveInfo.tabId}. Was paused, remaining: ${pendingMoveInfo.initialDuration}ms.`);
                startMoveTimer(pendingMoveInfo.tabId, pendingMoveInfo.initialDuration);
                pendingMoveInfo.timePaused = 0; // Reset pause timestamp
            } else if (!tabMoveTimeoutId) { 
                // This covers:
                // 1. Tab was activated while mouse was outside.
                // 2. Mouse left, then quickly re-entered before timer could be set by onActivated (if onActivated is slow or mouse events are rapid).
                console.log(`Mouse entered. Tab ${pendingMoveInfo.tabId} was pending (e.g. activated while out, or quick leave/enter). Starting timer with ${pendingMoveInfo.initialDuration}ms.`);
                startMoveTimer(pendingMoveInfo.tabId, pendingMoveInfo.initialDuration);
            } else {
                 console.log(`Mouse entered, but a timer ${tabMoveTimeoutId} is already running or conditions not met for resume.`);
            }
        } else {
            console.log("Mouse entered, but no pending tab/timer to resume or no time remaining.");
        }
    } else if (type == 'picked') {
        console.log("Message 'picked' received");
        // Clear any active move timer because the user is interacting with tabs
        if (tabMoveTimeoutId) {
            clearTimeout(tabMoveTimeoutId);
            tabMoveTimeoutId = null;
            console.log(`Cleared tab move timer ${tabMoveTimeoutId} due to 'picked' message.`);
            // Reset pending info as interaction overrides auto-move
            pendingMoveInfo = { tabId: null, initialDuration: 5000, startTime: 0, timePaused: 0 };
        }
        chrome.tabs.query({ currentWindow: true }, (tabList) => {
            if (!tabList.length) return;
            tabList.forEach((tab) => {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: function() {
                        // Check if oldTitle exists before trying to revert
                        if (typeof document.oldTitle !== 'undefined') {
                           document.title = document.oldTitle;
                           delete document.oldTitle; // Clean up
                        }
                    }
                });
            });
        });
    } else if (key && listOfLetters.includes(key)) { // Ensure key exists before using it
        console.log(`Letter key pressed: ${key}`);
        // Clear any active move timer because the user is selecting a tab
        if (tabMoveTimeoutId) {
            clearTimeout(tabMoveTimeoutId);
            console.log(`Cleared tab move timer ${tabMoveTimeoutId} due to letter key press.`);
            tabMoveTimeoutId = null;
            // Reset pending info as interaction overrides auto-move
             pendingMoveInfo = { tabId: null, initialDuration: 5000, startTime: 0, timePaused: 0 };
        }
        const tabIndex = listOfLetters.indexOf(key);
        if (tabIndex > -1) {
            chrome.tabs.query({ index: tabIndex, currentWindow: true }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    chrome.tabs.update(tabs[0].id, { active: true, highlighted: true });
                } else {
                    console.log(`No tab found at index ${tabIndex} for key ${key}.`);
                }
            });
        }
    }
});

// The original 'async function move(activeInfo) {...}' is now removed / replaced by the new logic.
console.log("Background script loaded and listeners attached.");
