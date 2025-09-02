const listOfLetters = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', 'u', 'i', 'o', 'p', 'n', 'm', ',', '.', 'q', 'w', 'e', 'r', 't', 'y', 'b', 'v', 'c', 'x', 'z'];

function isUrlRestricted(url) {
    if (!url) return true;
    // Extensions are not allowed to script pages with chrome://, edge://, or about: schemes,
    // nor can they script the Chrome Web Store.
    return url.startsWith('chrome://') ||
           url.startsWith('edge://') ||
           url.startsWith('about:') ||
           url.startsWith('https://chrome.google.com/webstore/');
}

let reorderDelay = 5000; // Default value in ms, will be updated from storage.
let autoCloseEnabled = false;
let autoCloseTime = 1; // Default value in hours
let tabLastActivated = {};

// Function to load user settings and listen for changes.
function initializeSettings() {
    // Load settings from storage on startup.
    chrome.storage.sync.get({
        delay: 5,
        autoCloseEnabled: false,
        autoCloseTime: 1
    }, (items) => {
        reorderDelay = items.delay * 1000;
        autoCloseEnabled = items.autoCloseEnabled;
        autoCloseTime = items.autoCloseTime;
        console.log(`[Settings] Initial auto-reorder delay set to ${reorderDelay}ms.`);
        console.log(`[Settings] Auto-close enabled: ${autoCloseEnabled}.`);
        console.log(`[Settings] Auto-close time: ${autoCloseTime} hour(s).`);
    });

    // Listen for changes to settings.
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
            if (changes.delay) {
                reorderDelay = changes.delay.newValue * 1000;
                console.log(`[Settings] Auto-reorder delay updated to ${reorderDelay}ms.`);
            }
            if (changes.autoCloseEnabled) {
                autoCloseEnabled = changes.autoCloseEnabled.newValue;
                console.log(`[Settings] Auto-close enabled updated to ${autoCloseEnabled}.`);
                // If auto-close is now enabled, start the alarm. Otherwise, clear it.
                if (autoCloseEnabled) {
                    chrome.alarms.create('autoCloseAlarm', { periodInMinutes: 1 });
                } else {
                    chrome.alarms.clear('autoCloseAlarm');
                }
            }
            if (changes.autoCloseTime) {
                autoCloseTime = changes.autoCloseTime.newValue;
                console.log(`[Settings] Auto-close time updated to ${autoCloseTime} hour(s).`);
            }
        }
    });
}

initializeSettings();


let isMouseInsidePage = true;
let tabMoveTimeoutId = null;
let pickModeTimeoutId = null;
let pinnedTabs = [];

// Load pinned tabs and tab activation times from storage at startup
chrome.storage.local.get({ pinnedTabs: [], tabLastActivated: {} }, (result) => {
    pinnedTabs = result.pinnedTabs;
    tabLastActivated = result.tabLastActivated;
    console.log('[Storage] Loaded pinned tabs:', pinnedTabs);
    console.log('[Storage] Loaded tab activation times:', tabLastActivated);
});

// Function to update the last activated time for a tab
function updateTabActivationTime(tabId) {
    tabLastActivated[tabId] = Date.now();
    chrome.storage.local.set({ tabLastActivated: tabLastActivated });
}

// Store tabId, initialDuration (remaining time), startTime, and timePaused
let pendingMoveInfo = {
    tabId: null,
    initialDuration: reorderDelay, // The full duration, or remaining duration when paused
    startTime: 0,       // Timestamp when timer (re)started
    timePaused: 0       // Timestamp when timer was paused
};

function updateTabTitle(tabId, isPinned) {
    chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
            console.error(`Error getting tab ${tabId}: ${chrome.runtime.lastError.message}`);
            return;
        }

        // Do not attempt to modify tabs on restricted pages.
        if (isUrlRestricted(tab.url)) {
            console.log(`[updateTabTitle] Skipping title update for restricted URL: ${tab.url}`);
            return;
        }

        let newTitle = tab.title;
        const pinMarker = "📌 ";

        // Remove existing pin marker to handle both pinning and unpinning
        if (newTitle.startsWith(pinMarker)) {
            newTitle = newTitle.substring(pinMarker.length);
        }

        if (isPinned) {
            newTitle = pinMarker + newTitle;
        }

        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (title) => { document.title = title; },
            args: [newTitle]
        }).catch(err => console.warn(`[updateTabTitle] Could not set title for tab ${tabId}: ${err.message}`));
    });
}

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    delete tabLastActivated[tabId];
    chrome.storage.local.set({ tabLastActivated: tabLastActivated });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-pin') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const tab = tabs[0];
            const tabId = tab.id;
            const index = pinnedTabs.indexOf(tabId);

            if (index > -1) {
                // Unpin tab
                pinnedTabs.splice(index, 1);
                console.log(`[Pinning] Tab ${tabId} unpinned.`);
                updateTabTitle(tabId, false); // Revert title
            } else {
                // Pin tab
                pinnedTabs.push(tabId);
                console.log(`[Pinning] Tab ${tabId} pinned.`);
                updateTabTitle(tabId, true); // Add pin marker
            }

            // Save the updated list to storage
            chrome.storage.local.set({ pinnedTabs: pinnedTabs });
        }
    });
    return;
  }
  if (command === 'move-to-first') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.move(tabs[0].id, { index: 0 });
      }
    });
    return;
  }
  if (command.startsWith('focus-tab-')) {
    const tabIndex = parseInt(command.split('-')[2]) - 1;
    chrome.tabs.query({ index: tabIndex, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { active: true });
      }
    });
    return;
  }
  if (command === 'close-all-old-tabs') {
    closeOldTabs();
    return;
  }
  if (command === 'clear-pick-mode') {
    revertAllTabTitlesAndCleanUp();
    return;
  }

  if (!(command == 'pick')) return

  if (pickModeTimeoutId) {
    clearTimeout(pickModeTimeoutId);
  }
  pickModeTimeoutId = setTimeout(() => {
    console.log('[background.js] Pick mode timed out. Reverting titles.');
    revertAllTabTitlesAndCleanUp();
    pickModeTimeoutId = null;
  }, 5000);

  chrome.tabs.query({ currentWindow: true }, (tabList) => {
    if (!tabList.length) return;
    tabList.forEach((tab) => {
      // Do not attempt to script on restricted pages.
      if (isUrlRestricted(tab.url)) {
        console.log(`[onCommand pick] Skipping script injection for restricted URL: ${tab.url}`);
        return; // This acts as 'continue' in a forEach loop.
      }

      // Inject key listener into all tabs.
      chrome.scripting.executeScript({
          target: { tabId: tab.id },
          args: [listOfLetters],
          func: function(listOfLetters) {
            const handleKeyDown = (e) => {
                if (document.hidden) {
                    return;
                }

                e.stopImmediatePropagation();
                e.preventDefault();

                if (e.key === 'Escape') {
                    chrome.runtime.sendMessage({ type: 'cancel_pick_mode' });
                } else if (listOfLetters.includes(e.key)) {
                    chrome.runtime.sendMessage({ key: e.key, shiftKey: e.shiftKey });
                }
                // After a key is pressed, remove the listener.
                window.removeEventListener('keydown', handleKeyDown, true);
            };

            // Remove any old listeners before adding a new one, just in case.
            window.removeEventListener('keydown', handleKeyDown, true);
            window.addEventListener('keydown', handleKeyDown, true);
          }
      });

      const title = listOfLetters[tab.index] ?? tab.index.toString();
      // console.log(`[onCommand] Preparing to set title for tab ${tab.id} (index ${tab.index}) to "${title}"`);
      chrome.scripting.executeScript(
        {
          func: function(titleStr) {
            // console.log(`[ContentScript Title] Setting title: ${titleStr}. Current title: ${document.title}`);
            if (typeof document.oldTitle === 'undefined' || !document.title.startsWith(titleStr + ':')) {
                 document.oldTitle = document.title;
                 // console.log(`[ContentScript Title] Stored old title: ${document.oldTitle}`);
            }
            document.title = titleStr + ': ' + document.oldTitle;
            // console.log(`[ContentScript Title] New title set: ${document.title}`);

            // The 3-second timeout to revert the title is removed from here.
            // Title reversion will now be handled by background.js upon tab selection, cancellation, or timeout.
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        updateTabActivationTime(tabId);
    }
});

chrome.tabs.onActivated.addListener(activeInfo => {
    updateTabActivationTime(activeInfo.tabId);
    console.log(`[onActivated] Tab activated: ${activeInfo.tabId}. Current timer ID: ${tabMoveTimeoutId}. Mouse is ${isMouseInsidePage ? 'inside' : 'outside'}.`);

    // Clear any existing timer for a previous tab or the same tab if it was somehow re-activated
    if (tabMoveTimeoutId) {
        clearTimeout(tabMoveTimeoutId);
        console.log(`[onActivated] Cleared existing timer ${tabMoveTimeoutId}.`);
        tabMoveTimeoutId = null;
    }
    
    // Initialize pendingMoveInfo for the newly activated tab
    // The full duration for a new tab focus is the configured delay.
    pendingMoveInfo = {
        tabId: activeInfo.tabId,
        initialDuration: reorderDelay,
        startTime: 0, // Will be set by startMoveTimer or when resuming
        timePaused: 0 
    };
    console.log(`[onActivated] Initialized pendingMoveInfo for tab ${activeInfo.tabId}: ${JSON.stringify(pendingMoveInfo)}`);

    if (isMouseInsidePage) {
        console.log(`[onActivated] Mouse is inside. Starting timer for tab ${activeInfo.tabId}.`);
        startMoveTimer(activeInfo.tabId, pendingMoveInfo.initialDuration);
    } else {
        // If mouse is outside, timer will not start.
        // pendingMoveInfo is set up. mouse_enter will use it if the mouse re-enters while this tab is active.
        // We record the current time as 'timePaused' to indicate the "pause" started now,
        // even though the timer hasn't officially run yet. This helps mouse_enter logic.
        pendingMoveInfo.timePaused = Date.now();
        console.log(`[onActivated] Mouse is outside. Timer for tab ${activeInfo.tabId} will not start. pendingMoveInfo updated: ${JSON.stringify(pendingMoveInfo)}`);
    }
});

function startMoveTimer(tabId, duration) {
    if (pinnedTabs.includes(tabId)) {
        console.log(`[startMoveTimer] Tab ${tabId} is pinned. Aborting move.`);
        return;
    }
    if (tabMoveTimeoutId) { // Should ideally be cleared before calling, but as a safeguard
        clearTimeout(tabMoveTimeoutId); 
        console.log(`Cleared pre-existing timer ${tabMoveTimeoutId} before starting new one.`);
    }
    
    console.log(`[startMoveTimer] Attempting to start timer for tab ${tabId} with duration ${duration}ms. Current timer ID: ${tabMoveTimeoutId}`);
    // It's crucial that any existing timer is cleared before calling this function.
    // However, as a safeguard, ensure it's cleared.
    if (tabMoveTimeoutId) {
        clearTimeout(tabMoveTimeoutId);
        console.warn(`[startMoveTimer] Cleared pre-existing timer ${tabMoveTimeoutId}. This should ideally be handled by the caller.`);
    }

    pendingMoveInfo.tabId = tabId;
    pendingMoveInfo.initialDuration = duration; // This is the remaining/full duration for this timer session
    pendingMoveInfo.startTime = Date.now();   // Timestamp when this specific timer starts
    pendingMoveInfo.timePaused = 0;           // Reset pause timestamp

    console.log(`[startMoveTimer] pendingMoveInfo initialized/updated: `, JSON.stringify(pendingMoveInfo));

    tabMoveTimeoutId = setTimeout(async () => {
        const localTimerId = tabMoveTimeoutId; // Capture for logging, in case it's cleared globally by another event
        console.log(`[Timer Callback] Fired for tab ${pendingMoveInfo.tabId} (timer ID ${localTimerId}). Mouse is ${isMouseInsidePage ? 'inside' : 'outside'}.`);

        // Critical check: If the mouse is outside, the timer should not execute its main action.
        // mouse_leave should have cleared this timer and stored remaining time.
        // If this callback still fires, it implies a potential race condition or logic gap.
        if (!isMouseInsidePage) {
            console.warn(`[Timer Callback] Timer for tab ${pendingMoveInfo.tabId} (ID ${localTimerId}) fired, but mouse is outside. This indicates a potential issue. The timer should have been paused.`);
            // Do not proceed with moving the tab. Reset relevant pendingMoveInfo.
            // The mouse_leave handler is responsible for managing state when mouse is out.
            // We clear tabMoveTimeoutId here because this specific timer instance has fired.
            if (tabMoveTimeoutId === localTimerId) { // Ensure we are clearing the correct timer
                 tabMoveTimeoutId = null;
            }
            return; 
        }

        // Ensure the timer is for the currently active tab and matches pendingMoveInfo
        const [currentActiveTab] = await chrome.tabs.query({ currentWindow: true, active: true });
        if (currentActiveTab && currentActiveTab.id === pendingMoveInfo.tabId) {
            console.log(`[Timer Callback] Conditions met for tab ${pendingMoveInfo.tabId}. Moving it to index 0.`);
            try {
                await chrome.tabs.move(pendingMoveInfo.tabId, { index: 0 });
                console.log(`[Timer Callback] Tab ${pendingMoveInfo.tabId} moved successfully.`);
            } catch (error) {
                console.error(`[Timer Callback] Error moving tab ${pendingMoveInfo.tabId}:`, error);
                if (error.message.includes('Tabs cannot be edited right now')) {
                    console.warn(`[Timer Callback] Tab move for ${pendingMoveInfo.tabId} failed due to browser state. Consider retry or alternative handling.`);
                }
            }
        } else {
            console.log(`[Timer Callback] Conditions not met for tab ${pendingMoveInfo.tabId}. It might no longer be active or pending info mismatch. Active tab: ${currentActiveTab ? currentActiveTab.id : 'none'}.`);
        }

        // This timer instance has completed its job or conditions were not met for action.
        if (tabMoveTimeoutId === localTimerId) { // Ensure we are clearing the correct timer
            tabMoveTimeoutId = null;
        }
        // Reset pendingMoveInfo as the timer action (or decision not to act) has concluded.
        // A new timer will re-initialize it if needed (e.g., on tab activation).
        pendingMoveInfo.startTime = 0;
        pendingMoveInfo.timePaused = 0;
        // initialDuration could be set to 0 or kept as is, depending on desired state post-action.
        // Setting to 0 indicates this specific timed duration is complete.
        pendingMoveInfo.initialDuration = 0;
        console.log(`[Timer Callback] Timer ${localTimerId} for tab ${pendingMoveInfo.tabId} finished. pendingMoveInfo: `, JSON.stringify(pendingMoveInfo));

    }, duration);
    console.log(`[startMoveTimer] Timer ${tabMoveTimeoutId} started for tab ${tabId} with duration ${duration}ms.`);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { key, type, shiftKey } = message; // Destructure shiftKey
    console.log(`[onMessage] Received message: type='${type}', key='${key}', shiftKey='${shiftKey}'. Current tabMoveTimeoutId: ${tabMoveTimeoutId}, pendingMoveInfo: ${JSON.stringify(pendingMoveInfo)}`);

    if (type === 'mouse_leave') {
        isMouseInsidePage = false;
        console.log(`[mouse_leave] Mouse left page. Current tab: ${pendingMoveInfo.tabId}. Timer ID: ${tabMoveTimeoutId}`);
        if (tabMoveTimeoutId && pendingMoveInfo.tabId && pendingMoveInfo.startTime > 0) {
            const elapsedTime = Date.now() - pendingMoveInfo.startTime;
            const remainingDuration = pendingMoveInfo.initialDuration - elapsedTime;
            
            clearTimeout(tabMoveTimeoutId);
            console.log(`[mouse_leave] Cleared timer ${tabMoveTimeoutId}.`);
            tabMoveTimeoutId = null;
            
            if (remainingDuration > 0) {
                pendingMoveInfo.initialDuration = remainingDuration; // Store remaining time
                pendingMoveInfo.timePaused = Date.now();     // Record when it was paused
                console.log(`[mouse_leave] Timer for tab ${pendingMoveInfo.tabId} paused. Remaining: ${remainingDuration}ms. pendingMoveInfo updated: ${JSON.stringify(pendingMoveInfo)}`);
            } else {
                // Timer essentially expired or had negligible time left
                console.log(`[mouse_leave] Timer for tab ${pendingMoveInfo.tabId} had ${remainingDuration}ms remaining. Considered expired.`);
                pendingMoveInfo.initialDuration = 0; // No time left
                pendingMoveInfo.timePaused = Date.now(); // Still note the pause time
                 // No need to restart a timer that has no duration left.
            }
        } else {
            console.log(`[mouse_leave] No active timer to pause, or tabId/startTime not set in pendingMoveInfo. tabMoveTimeoutId: ${tabMoveTimeoutId}, pendingMoveInfo: ${JSON.stringify(pendingMoveInfo)}`);
        }
    } else if (type === 'mouse_enter') {
        isMouseInsidePage = true;
        console.log(`[mouse_enter] Mouse entered page. Current tab: ${pendingMoveInfo.tabId}. Stored remaining duration: ${pendingMoveInfo.initialDuration}ms.`);

        // If a timer was paused and has remaining time, resume it.
        if (pendingMoveInfo.tabId && pendingMoveInfo.initialDuration > 0 && pendingMoveInfo.timePaused > 0) {
            // Ensure no other timer is somehow already running
            if (tabMoveTimeoutId) {
                clearTimeout(tabMoveTimeoutId);
                console.warn(`[mouse_enter] Cleared an unexpected existing timer ${tabMoveTimeoutId} before resuming.`);
                tabMoveTimeoutId = null;
            }
            console.log(`[mouse_enter] Resuming timer for tab ${pendingMoveInfo.tabId} with remaining duration ${pendingMoveInfo.initialDuration}ms.`);
            startMoveTimer(pendingMoveInfo.tabId, pendingMoveInfo.initialDuration);
            // pendingMoveInfo.timePaused = 0; // startMoveTimer resets this
        } else if (pendingMoveInfo.tabId && pendingMoveInfo.initialDuration > 0 && !tabMoveTimeoutId) {
            // This case handles:
            // 1. Tab was activated while mouse was outside (onActivated sets up pendingMoveInfo but doesn't start timer).
            // 2. A very quick mouse_leave then mouse_enter where the timer was cleared by mouse_leave,
            //    and onActivated didn't re-trigger (or wasn't supposed to).
            console.log(`[mouse_enter] Conditions suggest a timer should be started for tab ${pendingMoveInfo.tabId} (e.g., tab activated while outside, or quick leave/enter). Duration: ${pendingMoveInfo.initialDuration}ms.`);
            startMoveTimer(pendingMoveInfo.tabId, pendingMoveInfo.initialDuration);
        } else if (tabMoveTimeoutId) {
            console.log(`[mouse_enter] Mouse entered, but a timer ${tabMoveTimeoutId} is already running. No action taken to prevent duplicate timers.`);
        } else {
            console.log(`[mouse_enter] No pending tab with remaining duration to resume, or initialDuration is 0. pendingMoveInfo: ${JSON.stringify(pendingMoveInfo)}`);
        }
    // Removed the 'picked' message type handler as it's no longer used by the content script.
    // The functionality (clearing timer, resetting info, reverting titles) is now handled by
    // the 'cancel_pick_mode' message or as part of the letter key selection flow.
    } else if (key && listOfLetters.includes(key)) { // This is a tab selection/closing action
        if (pickModeTimeoutId) {
            clearTimeout(pickModeTimeoutId);
            pickModeTimeoutId = null;
        }
        console.log(`[onMessage - key] Letter key pressed: ${key}. Shift: ${shiftKey}. User is performing an action.`);
        if (tabMoveTimeoutId) {
            clearTimeout(tabMoveTimeoutId);
            console.log(`[onMessage - key] Cleared active timer ${tabMoveTimeoutId} due to user action.`);
            tabMoveTimeoutId = null;
        }
        // Reset pendingMoveInfo as user interaction overrides auto-move.
        pendingMoveInfo = { tabId: null, initialDuration: reorderDelay, startTime: 0, timePaused: 0 };
        console.log(`[onMessage - key] Reset pendingMoveInfo: ${JSON.stringify(pendingMoveInfo)}`);

        const tabIndex = listOfLetters.indexOf(key);
        if (tabIndex > -1) {
            chrome.tabs.query({ index: tabIndex, currentWindow: true }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    const targetTabId = tabs[0].id;
                    if (shiftKey) {
                        // Close the tab
                        console.log(`[onMessage - key] Closing tab ${targetTabId} at index ${tabIndex} for key Shift+${key}.`);
                        chrome.tabs.remove(targetTabId);
                        // We still revert titles because the pick mode is now over.
                        revertAllTabTitlesAndCleanUp();
                    } else {
                        // Switch to the tab
                        console.log(`[onMessage - key] Activating tab ${targetTabId} at index ${tabIndex} for key ${key}.`);
                        chrome.tabs.update(targetTabId, { active: true, highlighted: true });
                        // After successful activation, ensure all titles are reverted.
                        revertAllTabTitlesAndCleanUp();
                    }
                } else {
                    console.log(`[onMessage - key] No tab found at index ${tabIndex} for key ${key}.`);
                }
            });
        }
    } else if (type === 'cancel_pick_mode') {
        if (pickModeTimeoutId) {
            clearTimeout(pickModeTimeoutId);
            pickModeTimeoutId = null;
        }
        console.log(`[onMessage - cancel_pick_mode] Received cancellation request.`);
        if (tabMoveTimeoutId) {
            clearTimeout(tabMoveTimeoutId);
            console.log(`[onMessage - cancel_pick_mode] Cleared active timer ${tabMoveTimeoutId}.`);
            tabMoveTimeoutId = null;
        }
        pendingMoveInfo = { tabId: null, initialDuration: reorderDelay, startTime: 0, timePaused: 0 };
        console.log(`[onMessage - cancel_pick_mode] Reset pendingMoveInfo: ${JSON.stringify(pendingMoveInfo)}`);

        revertAllTabTitlesAndCleanUp();
    }
});

function revertAllTabTitlesAndCleanUp() {
    console.log('[revertAllTabTitlesAndCleanUp] Starting process to revert titles for all tabs.');
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
            return;
        }
        tabs.forEach((tab) => {
            if (isUrlRestricted(tab.url)) {
                return;
            }

            const isPinned = pinnedTabs.includes(tab.id);
            chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                args: [isPinned],
                func: (isPinned) => {
                    if (typeof document.oldTitle !== 'undefined') {
                        let newTitle = document.oldTitle;
                        const pinMarker = "📌 ";

                        if (newTitle.startsWith(pinMarker)) {
                            newTitle = newTitle.substring(pinMarker.length);
                        }

                        if (isPinned) {
                            document.title = pinMarker + newTitle;
                        } else {
                            document.title = newTitle;
                        }
                        delete document.oldTitle;
                    }
                }
            }).catch(err => console.warn(`[revertAllTabTitlesAndCleanUp] Error reverting title for tab ${tab.id}: ${err}`));
        });
    });
}

// The original 'async function move(activeInfo) {...}' is now removed / replaced by the new logic.
console.log("Background script loaded and listeners attached.");

// Auto-close feature
async function closeOldTabs() {
    if (!autoCloseEnabled) {
        return;
    }

    const tabs = await chrome.tabs.query({});
    const now = Date.now();
    const autoCloseTimeMs = autoCloseTime * 60 * 60 * 1000;

    for (const tab of tabs) {
        if (pinnedTabs.includes(tab.id)) {
            continue;
        }

        const lastActivated = tabLastActivated[tab.id];
        if (lastActivated && (now - lastActivated > autoCloseTimeMs)) {
            chrome.tabs.remove(tab.id);
        }
    }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'autoCloseAlarm') {
        closeOldTabs();
    }
});

// Create the alarm when the extension starts if the setting is enabled
chrome.storage.sync.get({ autoCloseEnabled: false }, (items) => {
    if (items.autoCloseEnabled) {
        chrome.alarms.create('autoCloseAlarm', { periodInMinutes: 1 });
    }
});
