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

// State variables
let tabLastActivated = {};
let tabHistory = [];
let pinnedTabs = [];
let isMouseInsidePage = false;
let tabMoveTimeoutId = null;
let pickModeTimeoutId = null;
let isClosePickMode = false;
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
        skipPinned: true
    }, (items) => {
        reorderDelay = items.delay * 1000;
        autoCloseEnabled = items.autoCloseEnabled;
        autoCloseTime = items.autoCloseTime;
        cycleTimeout = items.cycleTimeout * 1000;
        skipPinnedOnCloseAll = items.skipPinned;

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
}

function handleTabUpdated(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
        updateTabActivationTime(tabId);
    }
}

function handleTabActivated(activeInfo) {
    updateTabActivationTime(activeInfo.tabId);
    updateTabHistory(activeInfo.tabId);

    if (tabMoveTimeoutId) {
        clearTimeout(tabMoveTimeoutId);
        tabMoveTimeoutId = null;
    }

    pendingMoveInfo = {
        tabId: activeInfo.tabId,
        initialDuration: reorderDelay,
        startTime: 0,
        timePaused: 0
    };

    if (isMouseInsidePage) {
        startMoveTimer(activeInfo.tabId, pendingMoveInfo.initialDuration);
    } else {
        pendingMoveInfo.timePaused = Date.now();
    }
}

function handleCommand(command) {
    switch (command) {
        case 'go-to-last-tab':
            goToLastTab();
            break;
        case 'cycle-through-tabs':
            cycleThroughTabs();
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

    const tabs = await chrome.tabs.query({});
    const now = Date.now();
    const autoCloseTimeMs = autoCloseTime * 60 * 1000;

    const closingPromises = tabs.map(tab => {
        return new Promise(async (resolve) => {
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
                        await chrome.tabs.remove(tab.id);
                        return resolve(true);
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
    const closedTabsCount = results.filter(Boolean).length;

    if (closedTabsCount > 0) {
        chrome.notifications.create({
            type: 'basic',
            title: 'Tbbr Tab Cleanup',
            message: `Closed ${closedTabsCount} old tab(s).`
        });
    }
}

// =================================================================================================
// Feature: Pick Mode (Tab Switching & Closing)
// =================================================================================================

function startPickMode(isCloseMode) {
    isClosePickMode = isCloseMode;
    if (pickModeTimeoutId) {
        clearTimeout(pickModeTimeoutId);
    }
    pickModeTimeoutId = setTimeout(endPickMode, 5000);

    chrome.tabs.query({ currentWindow: true }, (tabList) => {
        if (!tabList.length) return;
        tabList.forEach((tab) => {
            if (isUrlRestricted(tab.url)) {
                return;
            }

            const listenerToInject = tab.active ? politeListener : robustListener;
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                args: [listOfLetters],
                func: listenerToInject
            }).catch(err => {});

            const title = listOfLetters[tab.index] ?? tab.index.toString();
            chrome.scripting.executeScript({
                func: function(titleStr) {
                    if (typeof document.oldTitle === 'undefined' || !document.title.startsWith(titleStr + ':')) {
                        document.oldTitle = document.title;
                    }
                    document.title = titleStr + ': ' + document.oldTitle;
                },
                args: [title],
                target: { tabId: tab.id, allFrames: true }
            });
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

    revertAllTabTitlesAndCleanUp();
}

function handlePickModeKeyPress(key, shiftKey) {
    if (tabMoveTimeoutId) {
        clearTimeout(tabMoveTimeoutId);
        tabMoveTimeoutId = null;
    }
    pendingMoveInfo = { tabId: null, initialDuration: reorderDelay, startTime: 0, timePaused: 0 };

    const tabIndex = listOfLetters.indexOf(key);
    if (tabIndex > -1) {
        chrome.tabs.query({ index: tabIndex, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                const targetTabId = tabs[0].id;
                if (shiftKey || isClosePickMode) {
                    chrome.tabs.remove(targetTabId);
                } else {
                    chrome.tabs.update(targetTabId, { active: true, highlighted: true });
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
// Other Commands & Utility Functions
// =================================================================================================

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

function cycleThroughTabs() {
    if (tabHistory.length < 2) return;

    if (!cycleState.active) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                cycleState.originalTabId = tabs[0].id;
                cycleState.active = true;
                cycleState.currentIndex = 1;
                if (tabHistory[cycleState.currentIndex] === cycleState.originalTabId) {
                  cycleState.currentIndex = (cycleState.currentIndex + 1) % tabHistory.length;
                }
                chrome.tabs.update(tabHistory[cycleState.currentIndex], { active: true });
                cycleState.timeoutId = setTimeout(endCycle, cycleTimeout);
            }
        });
    } else {
        clearTimeout(cycleState.timeoutId);
        cycleState.currentIndex = (cycleState.currentIndex + 1) % tabHistory.length;
        if (tabHistory[cycleState.currentIndex] === cycleState.originalTabId) {
            cycleState.currentIndex = (cycleState.currentIndex + 1) % tabHistory.length;
        }
        chrome.tabs.update(tabHistory[cycleState.currentIndex], { active: true });
        cycleState.timeoutId = setTimeout(endCycle, cycleTimeout);
    }
}

function endCycle() {
    if (!cycleState.active) return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const finalTabId = tabs[0].id;
            updateTabHistory(finalTabId);
            const originalIndex = tabHistory.indexOf(cycleState.originalTabId);
            if (originalIndex > -1) {
                tabHistory.splice(originalIndex, 1);
            }
            tabHistory.splice(1, 0, cycleState.originalTabId);
        }
        cycleState = { active: false, timeoutId: null, originalTabId: null, currentIndex: 0 };
    });
}

function togglePin() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            const tab = tabs[0];
            const tabId = tab.id;

            // If tab is natively pinned, the action is to unpin it natively.
            if (tab.pinned) {
                chrome.tabs.update(tabId, { pinned: false });
                // Also remove from our internal list just in case it was there.
                const index = pinnedTabs.indexOf(tabId);
                if (index > -1) {
                    pinnedTabs.splice(index, 1);
                }
                updateTabTitle(tabId, false); // Clean up title emoji
            } else {
                // If not natively pinned, toggle its state in our internal list.
                const index = pinnedTabs.indexOf(tabId);
                if (index > -1) {
                    // It's in our list, so unpin it.
                    pinnedTabs.splice(index, 1);
                    updateTabTitle(tabId, false);
                } else {
                    // It's not in our list, so pin it.
                    pinnedTabs.push(tabId);
                    updateTabTitle(tabId, true);
                }
            }

            chrome.storage.local.set({ pinnedTabs: pinnedTabs });

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
            }).catch(err => {});
        });
    });
}

function isUrlRestricted(url) {
    if (!url) return true;
    return url.startsWith('chrome://') ||
           url.startsWith('edge://') ||
           url.startsWith('about:') ||
           url.startsWith('chrome-extension://') ||
           url.startsWith('https://chrome.google.com/webstore/');
}

// A comprehensive check to see if a tab should be treated as pinned
function isTabPinned(tab) {
    if (!tab) return false;
    // Check native browser pin, our internal list, or a title marker
    return tab.pinned || pinnedTabs.includes(tab.id) || (tab.title && tab.title.startsWith("📌"));
}

function updateTabTitle(tabId, isPinned) {
    chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
            return;
        }

        if (isUrlRestricted(tab.url)) {
            return;
        }

        let newTitle = tab.title;
        const pinMarker = "📌 ";

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
        }).catch(err => {});
    });
}
