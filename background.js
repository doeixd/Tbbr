// =================================================================================================
// Global Variables and Constants
// =================================================================================================

const listOfLetters = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', 'u', 'i', 'o', 'p', 'n', 'm', ',', '.', 'q', 'w', 'e', 'r', 't', 'y', 'b', 'v', 'c', 'x', 'z'];

// Settings with default values, to be updated from chrome.storage
let reorderDelay = 5000;
let autoCloseEnabled = false;
let autoCloseTime = 60; // In minutes
let cycleTimeout = 3000;
let skipPinnedOnCloseAll = true;
let warningTime = 5; // In minutes
let isActiveDelay = 0; // In milliseconds
let autoCloseWhitelist = [];

// State variables
let tabLastActivated = {};
let tabHistory = [];
let pinnedTabs = [];
let isMouseInsidePage = false;
let tabMoveTimeoutId = null;
let isActiveTimeoutId = null;
let pickModeTimeoutId = null;
let isClosePickMode = false;
let areTimersVisible = false;
let countdownIntervalId = null;
let cycleState = {
    active: false,
    timeoutId: null,
    originalTabId: null,
    currentIndex: 0
};
let pendingMoveInfo = {
    tabId: null,
    initialDuration: reorderDelay,
    startTime: 0,
    timePaused: 0
};

// A map to store the original, pristine title of a tab before any manipulation.
// This prevents features like Countdown Timers and Pick Mode from corrupting each other's state.
// Map<tabId, originalTitle>
let tabOriginalTitles = new Map();


// =================================================================================================
// Initialization
// =================================================================================================

initialize();

function initialize() {
    loadSettings();
    loadPersistentState();
    attachEventListeners();
}

function loadSettings() {
    chrome.storage.sync.get({
        delay: 5,
        autoCloseEnabled: false,
        autoCloseTime: 60,
        cycleTimeout: 3,
        skipPinned: true,
        warningTime: 5,
        isActiveDelay: 0,
        autoCloseWhitelist: []
    }, (items) => {
        reorderDelay = items.delay * 1000;
        autoCloseEnabled = items.autoCloseEnabled;
        autoCloseTime = items.autoCloseTime;
        cycleTimeout = items.cycleTimeout * 1000;
        skipPinnedOnCloseAll = items.skipPinned;
        warningTime = items.warningTime;
        isActiveDelay = items.isActiveDelay * 1000; // Convert to ms
        autoCloseWhitelist = items.autoCloseWhitelist;

        if (autoCloseEnabled) {
            chrome.alarms.create('autoCloseAlarm', { periodInMinutes: 1 });
        }
    });
}

async function closeAllPrecedingTabs() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return;

    const allTabs = await chrome.tabs.query({ currentWindow: true });
    let tabsToClose = allTabs.filter(tab => tab.index < activeTab.index);

    if (skipPinnedOnCloseAll) {
        tabsToClose = tabsToClose.filter(tab => !isTabPinned(tab));
    }

    if (tabsToClose.length > 0) {
        chrome.tabs.remove(tabsToClose.map(tab => tab.id));
    }
}

async function closeAllFollowingTabs() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return;

    const allTabs = await chrome.tabs.query({ currentWindow: true });
    let tabsToClose = allTabs.filter(tab => tab.index > activeTab.index);

    if (skipPinnedOnCloseAll) {
        tabsToClose = tabsToClose.filter(tab => !isTabPinned(tab));
    }

    if (tabsToClose.length > 0) {
        chrome.tabs.remove(tabsToClose.map(tab => tab.id));
    }
}

async function closeAllExceptCurrent() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) return;

    const allTabs = await chrome.tabs.query({ currentWindow: true });
    let tabsToClose = allTabs.filter(tab => tab.id !== activeTab.id);

    if (skipPinnedOnCloseAll) {
        tabsToClose = tabsToClose.filter(tab => !isTabPinned(tab));
    }

    if (tabsToClose.length > 0) {
        chrome.tabs.remove(tabsToClose.map(tab => tab.id));
    }
}

function loadPersistentState() {
    chrome.storage.local.get({ pinnedTabs: [], tabLastActivated: {} }, (result) => {
        pinnedTabs = result.pinnedTabs;
        tabLastActivated = result.tabLastActivated;
        initializeTabHistory();
    });
}

function attachEventListeners() {
    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.tabs.onCreated.addListener(handleTabCreated);
    chrome.tabs.onRemoved.addListener(handleTabRemoved);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.commands.onCommand.addListener(handleCommand);
    chrome.runtime.onMessage.addListener(handleMessage);
    chrome.alarms.onAlarm.addListener(handleAlarm);

    // Listen for long-lived connections from content scripts
    chrome.runtime.onConnect.addListener((port) => {
        if (port.name === "mouse-tracker") {
            port.onMessage.addListener((message) => {
                if (message.type === "mouse_enter") {
                    handleMouseEnter();
                } else if (message.type === "mouse_leave") {
                    handleMouseLeave();
                }
            });
        }
    });
}

// =================================================================================================
// Event Handlers
// =================================================================================================

function handleStorageChange(changes, namespace) {
    if (namespace !== 'sync') return;

    if (changes.delay) {
        reorderDelay = changes.delay.newValue * 1000;
    }
    if (changes.autoCloseEnabled) {
        autoCloseEnabled = changes.autoCloseEnabled.newValue;
        if (autoCloseEnabled) {
            chrome.alarms.create('autoCloseAlarm', { periodInMinutes: 1 });
        } else {
            chrome.alarms.clear('autoCloseAlarm');
            // If auto-close is disabled, also turn off the countdown timers.
            if (areTimersVisible) {
                toggleCountdownTimers();
            }
        }
    }
    if (changes.autoCloseTime) {
        autoCloseTime = changes.autoCloseTime.newValue;
    }
    if (changes.cycleTimeout) {
        cycleTimeout = changes.cycleTimeout.newValue * 1000;
    }
    if (changes.skipPinned) {
        skipPinnedOnCloseAll = changes.skipPinned.newValue;
    }
    if (changes.warningTime) {
        warningTime = changes.warningTime.newValue;
    }
    if (changes.isActiveDelay) {
        isActiveDelay = changes.isActiveDelay.newValue * 1000;
    }
    if (changes.autoCloseWhitelist) {
        autoCloseWhitelist = changes.autoCloseWhitelist.newValue;
    }
}

function handleTabCreated(tab) {
    updateTabActivationTime(tab.id);
}

function handleTabRemoved(tabId, removeInfo) {
    delete tabLastActivated[tabId];
    chrome.storage.local.set({ tabLastActivated });

    const index = tabHistory.indexOf(tabId);
    if (index > -1) {
        tabHistory.splice(index, 1);
    }

    // Clean up the original title from our map to prevent memory leaks.
    tabOriginalTitles.delete(tabId);
}

function handleTabUpdated(tabId, changeInfo, tab) {
    // Check if the native pinned status has changed.
    if (typeof changeInfo.pinned !== 'undefined') {
        const isNativelyPinned = changeInfo.pinned;
        const internalIndex = pinnedTabs.indexOf(tabId);

        if (isNativelyPinned && internalIndex > -1) {
            // RULE #3: The user just natively pinned a tab that was soft-pinned.
            // Native pinning "upgrades" the pin. We remove our soft-pin to avoid
            // a conflicting state where the user can't unpin it properly.
            pinnedTabs.splice(internalIndex, 1);
        }

        // Persist the change (if any) and update the title to ensure the pin icon is correct.
        chrome.storage.local.set({ pinnedTabs: pinnedTabs }, () => {
            // The second argument determines if the pin icon should be shown.
            // We pass the new native pin state directly, as per the user's design.
            // This ensures that unpinning natively removes the icon, even if the tab remains soft-pinned.
            // The soft-pin will be apparent on the next title update by another feature.
            updateTabTitle(tabId, isNativelyPinned);
        });
    }

    if (changeInfo.status === 'complete') {
        updateTabActivationTime(tabId);
    }
}

function finalizeTabActivation(tabId) {
    updateTabActivationTime(tabId);
    updateTabHistory(tabId);

    if (tabMoveTimeoutId) {
        clearTimeout(tabMoveTimeoutId);
        tabMoveTimeoutId = null;
    }

    pendingMoveInfo = {
        tabId: tabId,
        initialDuration: reorderDelay,
        startTime: 0,
        timePaused: 0
    };

    if (isMouseInsidePage) {
        startMoveTimer(tabId, pendingMoveInfo.initialDuration);
    } else {
        pendingMoveInfo.timePaused = Date.now();
    }
}

function handleTabActivated(activeInfo) {
    // Clear any previously pending activation timer
    if (isActiveTimeoutId) {
        clearTimeout(isActiveTimeoutId);
        isActiveTimeoutId = null;
    }

    // If delay is 0, activate immediately. Otherwise, set a timeout.
    if (isActiveDelay === 0) {
        finalizeTabActivation(activeInfo.tabId);
    } else {
        isActiveTimeoutId = setTimeout(() => {
            finalizeTabActivation(activeInfo.tabId);
            isActiveTimeoutId = null;
        }, isActiveDelay);
    }
}

function handleCommand(command) {
    switch (command) {
        case 'go-to-last-tab':
            goToLastTab();
            break;
        case 'cycle-through-tabs':
            cycleThroughTabs('backward');
            break;
        case 'cycle-through-tabs-forward':
            cycleThroughTabs('forward');
            break;
        case 'toggle-pin':
            togglePin();
            break;
        case 'move-to-first':
            moveTabToFirst();
            break;
        case 'close-all-old-tabs':
            closeOldTabs();
            break;
        case 'clear-pick-mode':
            endPickMode();
            break;
        case 'pick':
        case 'close-pick':
            startPickMode(command === 'close-pick');
            break;
        case 'go-to-following-tab':
            goToFollowingTab();
            break;
        case 'go-to-preceeding-tab':
            goToPreceedingTab();
            break;
        case 'go-to-first-tab':
            goToFirstTab();
            break;
        case 'go-to-last-tab-in-list':
            goToLastTabInList();
            break;
        case 'reopen-last-closed-tab':
            reopenLastClosedTab();
            break;
        case 'close-all-preceding-tabs':
            closeAllPrecedingTabs();
            break;
        case 'close-all-following-tabs':
            closeAllFollowingTabs();
            break;
        case 'close-all-except-current':
            closeAllExceptCurrent();
            break;
        case 'toggle-countdown-timers':
            toggleCountdownTimers();
            break;
        case 'move-tab-left':
            moveTabLeft();
            break;
        case 'move-tab-right':
            moveTabRight();
            break;
        case 'move-tab-to-end':
            moveTabToEnd();
            break;
        default:
            if (command.startsWith('focus-tab-')) {
                focusTabByIndex(command);
            }
    }
}

function handleMessage(message, sender, sendResponse) {
    const { key, type, shiftKey } = message;

    if (key && listOfLetters.includes(key)) {
        handlePickModeKeyPress(key, shiftKey);
    } else if (type === 'cancel_pick_mode') {
        endPickMode();
    }
}

function handleAlarm(alarm) {
    if (alarm.name === 'autoCloseAlarm') {
        closeOldTabs();
    }
}

// =================================================================================================
// Feature: Auto Tab Reordering
// =================================================================================================

function handleMouseLeave() {
    isMouseInsidePage = false;
    if (tabMoveTimeoutId && pendingMoveInfo.tabId && pendingMoveInfo.startTime > 0) {
        const elapsedTime = Date.now() - pendingMoveInfo.startTime;
        const remainingDuration = pendingMoveInfo.initialDuration - elapsedTime;

        clearTimeout(tabMoveTimeoutId);
        tabMoveTimeoutId = null;

        if (remainingDuration > 0) {
            pendingMoveInfo.initialDuration = remainingDuration;
            pendingMoveInfo.timePaused = Date.now();
        } else {
            pendingMoveInfo.initialDuration = 0;
            pendingMoveInfo.timePaused = Date.now();
        }
    }
}

function handleMouseEnter() {
    isMouseInsidePage = true;
    if (pendingMoveInfo.tabId && pendingMoveInfo.initialDuration > 0 && pendingMoveInfo.timePaused > 0) {
        if (tabMoveTimeoutId) {
            clearTimeout(tabMoveTimeoutId);
            tabMoveTimeoutId = null;
        }
        startMoveTimer(pendingMoveInfo.tabId, pendingMoveInfo.initialDuration);
    } else if (pendingMoveInfo.tabId && pendingMoveInfo.initialDuration > 0 && !tabMoveTimeoutId) {
        startMoveTimer(pendingMoveInfo.tabId, pendingMoveInfo.initialDuration);
    }
}

function startMoveTimer(tabId, duration) {
    // Perform a quick synchronous check first. This avoids unnecessary timer setup
    // for tabs that are explicitly pinned in our internal list.
    if (pinnedTabs.includes(tabId)) {
        return;
    }
    if (tabMoveTimeoutId) {
        clearTimeout(tabMoveTimeoutId);
    }

    pendingMoveInfo.tabId = tabId;
    pendingMoveInfo.initialDuration = duration;
    pendingMoveInfo.startTime = Date.now();
    pendingMoveInfo.timePaused = 0;

    tabMoveTimeoutId = setTimeout(async () => {
        if (!isMouseInsidePage) {
            return;
        }

        const [currentActiveTab] = await chrome.tabs.query({ currentWindow: true, active: true });

        // Before moving, perform the full check, as the tab title might have changed
        // or it might be a natively pinned tab.
        if (currentActiveTab && currentActiveTab.id === pendingMoveInfo.tabId) {
            if (isTabPinned(currentActiveTab)) {
                return; // Don't move pinned tabs
            }
            try {
                await chrome.tabs.move(pendingMoveInfo.tabId, { index: 0 });
            } catch (error) {
                // The tab might have been closed before the move operation.
                console.error(`Error moving tab ${pendingMoveInfo.tabId}:`, error);
            }
        }

        tabMoveTimeoutId = null;
        pendingMoveInfo.startTime = 0;
        pendingMoveInfo.timePaused = 0;
        pendingMoveInfo.initialDuration = 0;

    }, duration);
}

// =================================================================================================
// Feature: Auto-close Old Tabs
// =================================================================================================

async function closeOldTabs() {
    if (!autoCloseEnabled) {
        return;
    }

    const tabs = await chrome.tabs.query({ currentWindow: true });
    const now = Date.now();
    const autoCloseTimeMs = autoCloseTime * 60 * 1000;

    const closingPromises = tabs.map(tab => {
        return new Promise(async (resolve) => {
            // Do not close tabs whose domain is on the whitelist.
            if (tab.url) {
                if (tab.url.startsWith('http:') || tab.url.startsWith('https:')) {
                    try {
                        const tabUrl = new URL(tab.url);
                        if (autoCloseWhitelist.includes(tabUrl.hostname)) {
                            return resolve(false);
                        }
                    } catch (e) {
                        // Should not happen, but ignore if it does.
                    }
                } else if (tab.url.startsWith('file:')) {
                    // For file URLs, check the full URL against the whitelist.
                    if (autoCloseWhitelist.includes(tab.url)) {
                        return resolve(false);
                    }
                }
            }

            if (isTabPinned(tab) || tab.audible) {
                return resolve(false);
            }

            let lastActivated = tabLastActivated[tab.id];
            if (!lastActivated) {
                updateTabActivationTime(tab.id);
                return resolve(false);
            }

            if (now - lastActivated > autoCloseTimeMs) {
                try {
                    const response = await new Promise((resolve, reject) => {
                        chrome.tabs.sendMessage(tab.id, { type: 'checkUnsaved' }, response => {
                            if (chrome.runtime.lastError) {
                                // Content script did not respond. Assume there are unsaved changes.
                                return resolve({ hasUnsavedChanges: true });
                            }
                            resolve(response);
                        });
                    });

                    if (response && !response.hasUnsavedChanges) {
                        // Final check: Re-fetch the tab's state to ensure it hasn't become active
                        // while we were waiting for the content script to respond.
                        const currentTabState = await chrome.tabs.get(tab.id);
                        if (!currentTabState.active) {
                            await chrome.tabs.remove(tab.id);
                            return resolve(tab); // Resolve with the tab object for the notification
                        }
                    }
                } catch (e) {
                    // An error occurred, so we'll play it safe and not close the tab.
                    return resolve(false);
                }
            }

            return resolve(false);
        });
    });

    const results = await Promise.all(closingPromises);
    const closedTabs = results.filter(Boolean);

    if (closedTabs.length > 0) {
        const notificationItems = closedTabs.map(tab => ({ title: tab.title }));
        const title = `Closed ${closedTabs.length} old tab(s)`;

        chrome.notifications.create({
            type: 'list',
            iconUrl: 'icon128.png',
            title: title,
            message: title, // Message is required but not shown for list notifications
            items: notificationItems
        });
    }
}

// =================================================================================================
// Feature: Pick Mode (Tab Switching & Closing)
// =================================================================================================

function startPickMode(isCloseMode) {
    if (tabMoveTimeoutId) {
        clearTimeout(tabMoveTimeoutId);
        tabMoveTimeoutId = null;
    }
    pendingMoveInfo = { tabId: null, initialDuration: reorderDelay, startTime: 0, timePaused: 0 };

    isClosePickMode = isCloseMode;
    if (pickModeTimeoutId) {
        clearTimeout(pickModeTimeoutId);
    }
    pickModeTimeoutId = setTimeout(endPickMode, 5000);

    chrome.tabs.query({ currentWindow: true }, (tabList) => {
        // Filter out restricted tabs where script injection would fail.
        const injectableTabs = tabList.filter(tab => !isUrlRestricted(tab.url));
        if (!injectableTabs.length) return;

        injectableTabs.forEach((tab, index) => {
            // Ensure the original title is stored before we manipulate it.
            setOriginalTitle(tab.id, tab.title);

            const listenerToInject = tab.active ? politeListener : robustListener;
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                args: [listOfLetters],
                func: listenerToInject
            }).catch(err => {});

            // Assign letters based on the index in the *filtered* list.
            const titlePrefix = listOfLetters[index] ?? index.toString();

            // Inject a script that prepends the letter.
            chrome.scripting.executeScript({
                func: function(prefix, currentTitle) {
                    // It's possible the title was already changed by another feature (e.g. timers).
                    // Prepend to the current title to stack prefixes correctly.
                    document.title = prefix + ': ' + currentTitle;
                },
                args: [titlePrefix, tab.title],
                target: { tabId: tab.id, allFrames: true }
            }).catch(err => {});
        });
    });
}

function endPickMode() {
    if (pickModeTimeoutId) {
        clearTimeout(pickModeTimeoutId);
        pickModeTimeoutId = null;
    }
    isClosePickMode = false;

    chrome.tabs.query({ currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) return;
        tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, { type: 'cleanup_pick_mode' }).catch(err => {});
        });
    });

    // When pick mode ends, revert titles. If countdown timers are active,
    // they will re-apply their own prefixes on the next interval.
    revertAllTabTitlesAndCleanUp();
}

function handlePickModeKeyPress(key, shiftKey) {
    if (tabMoveTimeoutId) {
        clearTimeout(tabMoveTimeoutId);
        tabMoveTimeoutId = null;
    }
    pendingMoveInfo = { tabId: null, initialDuration: reorderDelay, startTime: 0, timePaused: 0 };

    const letterIndex = listOfLetters.indexOf(key);
    if (letterIndex > -1) {
        chrome.tabs.query({ currentWindow: true }, (tabs) => {
            const injectableTabs = tabs.filter(tab => !isUrlRestricted(tab.url));
            if (letterIndex < injectableTabs.length) {
                const targetTab = injectableTabs[letterIndex];
                if (targetTab) {
                    const targetTabId = targetTab.id;
                    if (shiftKey || isClosePickMode) {
                        chrome.tabs.remove(targetTabId);
                    } else {
                        chrome.tabs.update(targetTabId, { active: true, highlighted: true });
                    }
                }
            }
        });
    }
    endPickMode();
}

// Content script for polite listener (active tab)
const politeListener = function(listOfLetters) {
    const ELEMENT_ID = 'tbbr-focus-element';
    const cleanup = () => {
        if (window.pickModeCleanupHandler) {
            chrome.runtime.onMessage.removeListener(window.pickModeCleanupHandler);
            delete window.pickModeCleanupHandler;
        }
        const focusElement = document.getElementById(ELEMENT_ID);
        if (focusElement) {
            focusElement.remove();
        }
    };
    cleanup();
    const focusElement = document.createElement('input');
    focusElement.id = ELEMENT_ID;
    focusElement.style.cssText = `position:fixed;opacity:0;top:0;left:0;width:0;height:0;padding:0;border:0;`;
    document.body.appendChild(focusElement);
    focusElement.focus();
    const keyDownHandler = (e) => {
        e.stopImmediatePropagation();
        if (e.key === 'Escape') {
            chrome.runtime.sendMessage({ type: 'cancel_pick_mode' });
            cleanup();
        } else if (listOfLetters.includes(e.key.toLowerCase())) {
            chrome.runtime.sendMessage({ key: e.key.toLowerCase(), shiftKey: e.shiftKey });
            cleanup();
        }
    };
    focusElement.addEventListener('keydown', keyDownHandler);
    window.pickModeCleanupHandler = (message) => {
        if (message && message.type === 'cleanup_pick_mode') {
            cleanup();
        }
    };
    chrome.runtime.onMessage.addListener(window.pickModeCleanupHandler);
};

// Content script for robust listener (inactive tabs)
const robustListener = function(listOfLetters) {
    const cleanup = () => {
        if (window.pickModeKeyDownHandler) {
            window.removeEventListener('keydown', window.pickModeKeyDownHandler, true);
            delete window.pickModeKeyDownHandler;
        }
        if (window.pickModeCleanupHandler) {
            chrome.runtime.onMessage.removeListener(window.pickModeCleanupHandler);
            delete window.pickModeCleanupHandler;
        }
    };
    cleanup();
    window.pickModeKeyDownHandler = (e) => {
        if (document.hidden) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.key === 'Escape') {
            chrome.runtime.sendMessage({ type: 'cancel_pick_mode' });
            cleanup();
        } else if (listOfLetters.includes(e.key.toLowerCase())) {
            chrome.runtime.sendMessage({ key: e.key.toLowerCase(), shiftKey: e.shiftKey });
            cleanup();
        }
    };
    window.pickModeCleanupHandler = (message) => {
        if (message && message.type === 'cleanup_pick_mode') {
            cleanup();
        }
    };
    window.addEventListener('keydown', window.pickModeKeyDownHandler, true);
    chrome.runtime.onMessage.addListener(window.pickModeCleanupHandler);
};

// =================================================================================================
// Feature: Countdown Timers
// =================================================================================================

function toggleCountdownTimers() {
    areTimersVisible = !areTimersVisible;

    if (areTimersVisible) {
        if (autoCloseEnabled) {
            startAllCountdownTimers();
        } else {
            console.log("Tbbr: Countdown timers require auto-close to be enabled in options.");
            areTimersVisible = false; // Revert state because the feature can't run.
        }
    } else {
        stopAllCountdownTimers();
    }
}

function startAllCountdownTimers() {
    if (countdownIntervalId) clearInterval(countdownIntervalId);
    updateAllTabTimers(); // Run once immediately
    countdownIntervalId = setInterval(updateAllTabTimers, 1000);
}

function stopAllCountdownTimers() {
    if (countdownIntervalId) clearInterval(countdownIntervalId);
    countdownIntervalId = null;
    revertAllTabTitlesAndCleanUp();
}


async function updateAllTabTimers() {
    if (!areTimersVisible) return;

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const allTabs = await chrome.tabs.query({ currentWindow: true });

    for (const tab of allTabs) {
        if (isUrlRestricted(tab.url)) continue;

        const lastActivated = tabLastActivated[tab.id];
        const isExcluded = !tab.id || !lastActivated || (activeTab && tab.id === activeTab.id) || isTabPinned(tab);

        // Ensure the original title is stored before any manipulation.
        setOriginalTitle(tab.id, tab.title);
        const originalTitle = tabOriginalTitles.get(tab.id);
        const isPinned = isTabPinned(tab);
        const pinMarker = "📌 ";
        let newTitle = isPinned ? pinMarker + originalTitle : originalTitle;

        if (!isExcluded) {
            // This tab should have a timer. Calculate and apply it.
            const now = Date.now();
            const autoCloseTimeMs = autoCloseTime * 60 * 1000;
            const deadline = lastActivated + autoCloseTimeMs;
            const remainingMs = deadline - now;
            const warningTimeMs = warningTime * 60 * 1000;
            let timeStr;

            if (remainingMs <= 0) {
                timeStr = "[EXPIRED]";
            } else {
                const minutes = String(Math.floor(remainingMs / 60000)).padStart(2, '0');
                const seconds = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0');
                if (warningTimeMs > 0 && remainingMs <= warningTimeMs) {
                    timeStr = `[WARN ${minutes}:${seconds}]`;
                } else {
                    timeStr = `[${minutes}:${seconds}]`;
                }
            }
            newTitle = timeStr + " " + newTitle;
        }

        // Apply the new title only if it's different to prevent unnecessary script injections.
        if (tab.title !== newTitle) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (title) => { document.title = title; },
                args: [newTitle]
            }).catch(err => {});
        }
    }
}

// =================================================================================================
// Other Commands & Utility Functions
// =================================================================================================

function moveTabLeft() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const currentTab = tabs[0];
            if (currentTab.index > 0) {
                chrome.tabs.move(currentTab.id, { index: currentTab.index - 1 });
            }
        }
    });
}

function moveTabRight() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const currentTab = tabs[0];
            chrome.tabs.query({ currentWindow: true }, (allTabs) => {
                if (currentTab.index < allTabs.length - 1) {
                    chrome.tabs.move(currentTab.id, { index: currentTab.index + 1 });
                }
            });
        }
    });
}

function moveTabToEnd() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const currentTab = tabs[0];
            chrome.tabs.query({ currentWindow: true }, (allTabs) => {
                chrome.tabs.move(currentTab.id, { index: allTabs.length - 1 });
            });
        }
    });
}

function goToFollowingTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const currentTab = tabs[0];
            chrome.tabs.query({ currentWindow: true }, (allTabs) => {
                const nextTabIndex = (currentTab.index + 1) % allTabs.length;
                const nextTab = allTabs.find(tab => tab.index === nextTabIndex);
                if (nextTab) {
                    chrome.tabs.update(nextTab.id, { active: true });
                }
            });
        }
    });
}

function goToPreceedingTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const currentTab = tabs[0];
            chrome.tabs.query({ currentWindow: true }, (allTabs) => {
                const prevTabIndex = (currentTab.index - 1 + allTabs.length) % allTabs.length;
                const prevTab = allTabs.find(tab => tab.index === prevTabIndex);
                if (prevTab) {
                    chrome.tabs.update(prevTab.id, { active: true });
                }
            });
        }
    });
}

function goToFirstTab() {
    chrome.tabs.query({ index: 0, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { active: true });
        }
    });
}

function goToLastTabInList() {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const lastTabIndex = Math.max(...tabs.map(t => t.index));
            const lastTab = tabs.find(t => t.index === lastTabIndex);
            if (lastTab) {
                chrome.tabs.update(lastTab.id, { active: true });
            }
        }
    });
}

function goToLastTab() {
    if (tabHistory.length > 1) {
        chrome.tabs.update(tabHistory[1], { active: true });
    }
}

function reopenLastClosedTab() {
    chrome.sessions.getRecentlyClosed({ maxResults: 1 }, (sessions) => {
        if (sessions && sessions.length > 0) {
            const lastClosedSession = sessions[0];
            if (lastClosedSession.tab || lastClosedSession.window) {
                chrome.sessions.restore(lastClosedSession.sessionId);
            }
        }
    });
}

function getNextCycleTabIndex(currentIndex, direction, history, originalTabId) {
    if (history.length < 2) return currentIndex;

    const increment = direction === 'backward' ? 1 : -1;
    let nextIndex = currentIndex;

    // Loop to find the next tab that isn't the one the cycle started from.
    // We check up to history.length times to avoid an infinite loop in weird edge cases.
    for (let i = 0; i < history.length; i++) {
        nextIndex = (nextIndex + increment + history.length) % history.length;
        if (history[nextIndex] !== originalTabId) {
            return nextIndex;
        }
    }
    // Fallback in case all tabs are the original tab (shouldn't happen in normal use).
    return (currentIndex + increment + history.length) % history.length;
}

function cycleThroughTabs(direction = 'backward') {
    if (tabHistory.length < 2) return;

    if (!cycleState.active) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                cycleState.originalTabId = tabs[0].id;
                cycleState.active = true;

                const startIndex = tabHistory.indexOf(cycleState.originalTabId);
                const validStartIndex = startIndex !== -1 ? startIndex : 0;

                cycleState.currentIndex = getNextCycleTabIndex(validStartIndex, direction, tabHistory, cycleState.originalTabId);

                chrome.tabs.update(tabHistory[cycleState.currentIndex], { active: true });
                cycleState.timeoutId = setTimeout(endCycle, cycleTimeout);
            }
        });
    } else {
        clearTimeout(cycleState.timeoutId);

        cycleState.currentIndex = getNextCycleTabIndex(cycleState.currentIndex, direction, tabHistory, cycleState.originalTabId);

        chrome.tabs.update(tabHistory[cycleState.currentIndex], { active: true });
        cycleState.timeoutId = setTimeout(endCycle, cycleTimeout);
    }
}

function endCycle() {
    if (!cycleState.active) return;

    if (tabMoveTimeoutId) {
        clearTimeout(tabMoveTimeoutId);
        tabMoveTimeoutId = null;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const finalTabId = tabs[0].id;
            updateTabHistory(finalTabId);
            const originalIndex = tabHistory.indexOf(cycleState.originalTabId);
            if (originalIndex > -1) {
                tabHistory.splice(originalIndex, 1);
            }
            tabHistory.splice(1, 0, cycleState.originalTabId);

            if (isMouseInsidePage) {
                startMoveTimer(finalTabId, reorderDelay);
            }
        }
        cycleState = { active: false, timeoutId: null, originalTabId: null, currentIndex: 0 };
    });
}

function togglePin() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const tab = tabs[0];
            const tabId = tab.id;

            // Do not allow soft-pinning a tab that is already natively pinned.
            if (tab.pinned) {
                console.log("Tbbr: Cannot modify soft-pin on a natively pinned tab.");
                return;
            }

            const internalIndex = pinnedTabs.indexOf(tabId);
            if (internalIndex > -1) {
                pinnedTabs.splice(internalIndex, 1); // Un-soft-pin
            } else {
                pinnedTabs.push(tabId); // Soft-pin
            }

            // After modifying our internal list, the result of isTabPinned will be the new correct state.
            const shouldBePinned = isTabPinned(tab);

            // Save the updated list and then update the title icon.
            chrome.storage.local.set({ pinnedTabs: pinnedTabs }, () => {
                updateTabTitle(tabId, shouldBePinned);
            });

            if (tabMoveTimeoutId && pendingMoveInfo.tabId === tabId) {
                clearTimeout(tabMoveTimeoutId);
                tabMoveTimeoutId = null;
            }
        }
    });
}

function moveTabToFirst() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.move(tabs[0].id, { index: 0 });
        }
    });
}

function focusTabByIndex(command) {
    const tabIndex = parseInt(command.split('-')[2]) - 1;
    chrome.tabs.query({ index: tabIndex, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { active: true });
        }
    });
}

async function initializeTabHistory() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    tabs.sort((a, b) => {
        const timeA = tabLastActivated[a.id] || 0;
        const timeB = tabLastActivated[b.id] || 0;
        return timeB - timeA;
    });
    tabHistory = tabs.map(tab => tab.id);
}

function updateTabHistory(tabId) {
    const index = tabHistory.indexOf(tabId);
    if (index > -1) {
        tabHistory.splice(index, 1);
    }
    tabHistory.unshift(tabId);
}

function updateTabActivationTime(tabId) {
    tabLastActivated[tabId] = Date.now();
    chrome.storage.local.set({ tabLastActivated });
}

function revertAllTabTitlesAndCleanUp() {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
            return;
        }
        tabs.forEach((tab) => {
            if (isUrlRestricted(tab.url) || !tabOriginalTitles.has(tab.id)) {
                return; // Only touch tabs we've modified.
            }

            const originalTitle = tabOriginalTitles.get(tab.id);
            const isPinned = isTabPinned(tab);
            const pinMarker = "📌 ";
            const restoredTitle = isPinned ? pinMarker + originalTitle : originalTitle;

            // Only update if the title is actually different.
            if (tab.title !== restoredTitle) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    func: (title) => { document.title = title; },
                    args: [restoredTitle]
                }).catch(err => {});
            }
        });
    });
}

// Stores the pristine, original title for a tab if it hasn't been stored yet.
// This function is the gatekeeper that prevents state corruption.
function setOriginalTitle(tabId, title) {
    if (!tabOriginalTitles.has(tabId)) {
        // Clean the title of any existing prefixes from previous sessions or errors
        // before storing it as the "original".
        // This regex is now more specific to avoid mangling legitimate titles like [PROJ-123].
        const timerRegex = /^\[((WARN\s)?\d{1,2}:\d{2}|EXPIRED)\]\s/;
        const pickModeRegex = /^[a-z;,.]:\s/;
        const pinMarker = "📌 ";
        const cleanedTitle = title
            .replace(timerRegex, '')
            .replace(pickModeRegex, '')
            .replace(pinMarker, '');
        tabOriginalTitles.set(tabId, cleanedTitle);
    }
}

function isUrlRestricted(url) {
    if (!url) return true;
    return url.startsWith('chrome://') ||
           url.startsWith('edge://') ||
           url.startsWith('about:') ||
           url.startsWith('chrome-extension://') ||
           url.startsWith('edge-extension://') ||
           url.startsWith('https://chrome.google.com/webstore/');
}

function isTabPinned(tab) {
    if (!tab) return false;
    // A tab is considered pinned if it's natively pinned OR in our soft-pin list.
    return tab.pinned || pinnedTabs.includes(tab.id);
}

function updateTabTitle(tabId, shouldBePinned) {
    chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab || isUrlRestricted(tab.url)) {
            return;
        }

        // This function should not be responsible for other features' prefixes.
        // It has one job: ensure the pin icon is present or absent based on the
        // combined pinned state. Other features will re-apply their prefixes
        // on their own schedule.
        const baseTitle = (tabOriginalTitles.get(tabId) || tab.title).replace(/^📌\s/, '');
        const pinMarker = "📌 ";
        let newTitle = baseTitle;

        if (shouldBePinned) {
            newTitle = pinMarker + baseTitle;
        }

        // Only inject the script if the title actually needs to change.
        if (tab.title !== newTitle) {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: (title) => { document.title = title; },
                args: [newTitle]
            }).catch(err => {});
        }
    });
}
