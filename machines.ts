import {
    action,
    Actor,
    createActor,
    createMachine,
    createMachineBuilder,
    classCase,
    createMachineFactory,
    createMatcher,
    describe,
    discriminantCase,
    MachineBase,
    mergeContext,
    toggle,
    transitionTo
} from "@doeixd/machine";

declare const chrome: any;

type CycleContext =
    | { status: "idle" }
    | { status: "active"; originalTabId: number; currentIndex: number; timeoutId: number };

type CountdownContext =
    | { status: "off" }
    | { status: "on"; intervalId: number };

type MoveTimerContext =
    | { status: "idle" }
    | { status: "running"; tabId: number; initialDuration: number; timeoutId: number; startTime: number }
    | { status: "paused"; tabId: number; remainingDuration: number; initialDuration: number; pausedAt: number };

type ActiveDelayContext =
    | { status: "idle" }
    | { status: "pending"; timeoutId: number };

type AutoCloseContext =
    | { status: "disabled" }
    | { status: "enabled"; alarmName: "autoCloseAlarm" };

export class PickModeIdle extends MachineBase<{ status: "idle" }> {
    constructor() {
        super({ status: "idle" });
    }

    start = describe(
        "Activate pick mode for tab selection",
        action(
            { name: "startPickMode", description: "Initialize pick mode state" },
            transitionTo(PickModeActive, (isCloseMode: boolean, timeoutId: number) => {
                return new PickModeActive(isCloseMode, timeoutId);
            })
        )
    );
}

export class PickModeActive extends MachineBase<{ status: "active"; isCloseMode: boolean; timeoutId: number }> {
    constructor(isCloseMode: boolean, timeoutId: number) {
        super({ status: "active", isCloseMode, timeoutId });
    }

    updateTimeout(timeoutId: number) {
        return new PickModeActive(this.context.isCloseMode, timeoutId);
    }

    end() {
        return new PickModeIdle();
    }
}

const cycleFactory = createMachineFactory<CycleContext>()({
    start: (_ctx, originalTabId: number, currentIndex: number, timeoutId: number) => ({
        status: "active",
        originalTabId,
        currentIndex,
        timeoutId
    }),
    advance: (ctx, currentIndex: number, timeoutId: number) =>
        ctx.status === "active"
            ? {
                ...ctx,
                currentIndex,
                timeoutId
            }
            : ctx,
    end: () => ({ status: "idle" })
});

const createCycle = (context: CycleContext = { status: "idle" }) => cycleFactory(context);

const countdownFactory = createMachineFactory<CountdownContext>()({
    start: (_ctx, intervalId: number) => ({ status: "on", intervalId }),
    stop: () => ({ status: "off" })
});

const createCountdown = (context: CountdownContext = { status: "off" }) => countdownFactory(context);

const moveTimerFactory = createMachineFactory<MoveTimerContext>()({
    start: (_ctx, tabId: number, initialDuration: number, timeoutId: number, startTime: number) => ({
        status: "running",
        tabId,
        initialDuration,
        timeoutId,
        startTime
    }),
    pause: (ctx, remainingDuration: number, pausedAt: number) =>
        ctx.status === "running"
            ? {
                status: "paused",
                tabId: ctx.tabId,
                remainingDuration,
                initialDuration: ctx.initialDuration,
                pausedAt
            }
            : ctx,
    finish: () => ({ status: "idle" }),
    resume: (ctx, timeoutId: number, startTime: number) =>
        ctx.status === "paused"
            ? {
                status: "running",
                tabId: ctx.tabId,
                initialDuration: ctx.initialDuration,
                timeoutId,
                startTime
            }
            : ctx,
    clear: () => ({ status: "idle" })
});

const createMoveTimer = (context: MoveTimerContext = { status: "idle" }) => moveTimerFactory(context);

const activeDelayFactory = createMachineFactory<ActiveDelayContext>()({
    schedule: (_ctx, timeoutId: number) => ({ status: "pending", timeoutId }),
    clear: () => ({ status: "idle" })
});

const createActiveDelay = (context: ActiveDelayContext = { status: "idle" }) => activeDelayFactory(context);

const autoCloseFactory = createMachineFactory<AutoCloseContext>()({
    enable: () => ({ status: "enabled", alarmName: "autoCloseAlarm" }),
    disable: () => ({ status: "disabled" })
});

const createAutoClose = (context: AutoCloseContext = { status: "disabled" }) => autoCloseFactory(context);

export class MouseTracker extends MachineBase<{ inside: boolean }> {
    public enter!: () => MouseTracker;
    public leave!: () => MouseTracker;
    public toggleInside!: () => MouseTracker;

    constructor(inside = false) {
        super({ inside });
        this.toggleInside = toggle("inside");
        this.enter = function (this: MouseTracker) {
            return this.context.inside ? this : this.toggleInside();
        };
        this.leave = function (this: MouseTracker) {
            return this.context.inside ? this.toggleInside() : this;
        };
    }
}

const createMouseState = (inside = false) => new MouseTracker(inside);

type PickModeState = PickModeIdle | PickModeActive;

type CycleState = ReturnType<typeof createCycle>;

type CountdownState = ReturnType<typeof createCountdown>;

type MoveTimerState = ReturnType<typeof createMoveTimer>;

type ActiveDelayState = ReturnType<typeof createActiveDelay>;

type AutoCloseState = ReturnType<typeof createAutoClose>;

type MouseState = ReturnType<typeof createMouseState>;

type BackgroundContext = {
    reorderDelay: number;
    autoCloseTime: number;
    cycleTimeout: number;
    skipPinnedOnCloseAll: boolean;
    warningTime: number;
    isActiveDelay: number;
    autoCloseWhitelist: string[];
    tabLastActivated: Record<number, number>;
    tabHistory: number[];
    pinnedTabs: number[];
    newTabIds: Set<number>;
    pickMode: PickModeState;
    cycleState: CycleState;
    countdown: CountdownState;
    moveTimer: MoveTimerState;
    activeDelay: ActiveDelayState;
    autoClose: AutoCloseState;
    mouse: MouseState;
    tabOriginalTitles: Map<number, string>;
};

export const listOfLetters = [
    "a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "u", "i", "o", "p", "n", "m", ",", ".", "q", "w", "e", "r", "t", "y", "b", "v", "c", "x", "z"
];

const defaultContext: BackgroundContext = {
    reorderDelay: 5000,
    autoCloseTime: 60,
    cycleTimeout: 3000,
    skipPinnedOnCloseAll: true,
    warningTime: 5,
    isActiveDelay: 0,
    autoCloseWhitelist: [],
    tabLastActivated: {},
    tabHistory: [],
    pinnedTabs: [],
    newTabIds: new Set<number>(),
    pickMode: new PickModeIdle(),
    cycleState: createCycle(),
    countdown: createCountdown(),
    moveTimer: createMoveTimer(),
    activeDelay: createActiveDelay(),
    autoClose: createAutoClose(),
    mouse: createMouseState(),
    tabOriginalTitles: new Map<number, string>()
};

const pickModeMatch = createMatcher(
    classCase("idle", PickModeIdle),
    classCase("active", PickModeActive)
);

const cycleMatch = createMatcher(
    discriminantCase<"idle", CycleState, "status", "idle">("idle", "status", "idle"),
    discriminantCase<"active", CycleState, "status", "active">("active", "status", "active")
);

const countdownMatch = createMatcher(
    discriminantCase<"off", CountdownState, "status", "off">("off", "status", "off"),
    discriminantCase<"on", CountdownState, "status", "on">("on", "status", "on")
);

const moveTimerMatch = createMatcher(
    discriminantCase<"idle", MoveTimerState, "status", "idle">("idle", "status", "idle"),
    discriminantCase<"running", MoveTimerState, "status", "running">("running", "status", "running"),
    discriminantCase<"paused", MoveTimerState, "status", "paused">("paused", "status", "paused")
);

const activeDelayMatch = createMatcher(
    discriminantCase<"idle", ActiveDelayState, "status", "idle">("idle", "status", "idle"),
    discriminantCase<"pending", ActiveDelayState, "status", "pending">("pending", "status", "pending")
);

const autoCloseMatch = createMatcher(
    discriminantCase<"disabled", AutoCloseState, "status", "disabled">("disabled", "status", "disabled"),
    discriminantCase<"enabled", AutoCloseState, "status", "enabled">("enabled", "status", "enabled")
);

const mouseMatch = createMatcher(
    discriminantCase<"outside", MouseState, "inside", false>("outside", "inside", false),
    discriminantCase<"inside", MouseState, "inside", true>("inside", "inside", true)
);

const delegateChild = <K extends keyof BackgroundContext>(key: K, action: string) => {
    return function (this: { context: BackgroundContext }, ...args: any[]) {
        const child = this.context[key] as any;
        if (child && typeof child[action] === "function") {
            this.context[key] = child[action](...args);
        }
        return this;
    };
};

export const createBackgroundMachine = (overrides: Partial<BackgroundContext> = {}) =>
    createMachine({ ...defaultContext, ...overrides }, () => ({
        enableAutoCloseState: delegateChild("autoClose", "enable"),
        disableAutoCloseState: delegateChild("autoClose", "disable"),
        enterMouseState: delegateChild("mouse", "enter"),
        leaveMouseState: delegateChild("mouse", "leave"),
        initialize() {
            this.loadSettings();
            this.loadPersistentState();
            this.attachEventListeners();
            return this;
        },
        loadSettings() {
            chrome.storage.sync.get({
                delay: 5,
                autoCloseEnabled: false,
                autoCloseTime: 60,
                cycleTimeout: 3,
                skipPinned: true,
                warningTime: 5,
                isActiveDelay: 0,
                autoCloseWhitelist: []
            }, (items: any) => {
                this.settingsLoaded(items);
            });
            return this;
        },
        settingsLoaded(items: any) {
            const buildMachine = createMachineBuilder(this);
            Object.assign(this, buildMachine({
                ...this.context,
                reorderDelay: items.delay * 1000,
                autoCloseTime: items.autoCloseTime,
                cycleTimeout: items.cycleTimeout * 1000,
                skipPinnedOnCloseAll: items.skipPinned,
                warningTime: items.warningTime,
                isActiveDelay: items.isActiveDelay * 1000,
                autoCloseWhitelist: items.autoCloseWhitelist
            }));

            if (items.autoCloseEnabled) {
                this.enableAutoCloseState();
                chrome.alarms.create("autoCloseAlarm", { periodInMinutes: 1 });
            } else {
                this.disableAutoCloseState();
            }
            return this;
        },
        async closeAllPrecedingTabs() {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab) return this;

            const allTabs = await chrome.tabs.query({ currentWindow: true });
            let tabsToClose = allTabs.filter((tab: any) => tab.index < activeTab.index);

            if (this.context.skipPinnedOnCloseAll) {
                tabsToClose = tabsToClose.filter((tab: any) => !this.isTabPinned(tab));
            }

            if (tabsToClose.length > 0) {
                chrome.tabs.remove(tabsToClose.map((tab: any) => tab.id));
            }

            return this;
        },
        async closeAllFollowingTabs() {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab) return this;

            const allTabs = await chrome.tabs.query({ currentWindow: true });
            let tabsToClose = allTabs.filter((tab: any) => tab.index > activeTab.index);

            if (this.context.skipPinnedOnCloseAll) {
                tabsToClose = tabsToClose.filter((tab: any) => !this.isTabPinned(tab));
            }

            if (tabsToClose.length > 0) {
                chrome.tabs.remove(tabsToClose.map((tab: any) => tab.id));
            }

            return this;
        },
        async closeAllExceptCurrent() {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab) return this;

            const allTabs = await chrome.tabs.query({ currentWindow: true });
            let tabsToClose = allTabs.filter((tab: any) => tab.id !== activeTab.id);

            if (this.context.skipPinnedOnCloseAll) {
                tabsToClose = tabsToClose.filter((tab: any) => !this.isTabPinned(tab));
            }

            if (tabsToClose.length > 0) {
                chrome.tabs.remove(tabsToClose.map((tab: any) => tab.id));
            }

            return this;
        },
        loadPersistentState() {
            chrome.storage.local.get({ pinnedTabs: [], tabLastActivated: {} }, (result: any) => {
                this.context.pinnedTabs = result.pinnedTabs;
                this.context.tabLastActivated = result.tabLastActivated;
                this.initializeTabHistory();
            });
            return this;
        },
        attachEventListeners() {
            return this;
        },
        storageChanged(changes: any, namespace: string) {
            if (namespace !== "sync") return this;

            const updates: Partial<BackgroundContext> = {};

            if (changes.delay) {
                updates.reorderDelay = changes.delay.newValue * 1000;
            }
            if (changes.autoCloseEnabled) {
                if (changes.autoCloseEnabled.newValue) {
                    this.enableAutoCloseState();
                    chrome.alarms.create("autoCloseAlarm", { periodInMinutes: 1 });
                } else {
                    this.disableAutoCloseState();
                    chrome.alarms.clear("autoCloseAlarm");
                    if (countdownMatch.is.on(this.context.countdown)) {
                        this.toggleCountdownTimers();
                    }
                }
            }
            if (changes.autoCloseTime) {
                updates.autoCloseTime = changes.autoCloseTime.newValue;
            }
            if (changes.cycleTimeout) {
                updates.cycleTimeout = changes.cycleTimeout.newValue * 1000;
            }
            if (changes.skipPinned) {
                updates.skipPinnedOnCloseAll = changes.skipPinned.newValue;
            }
            if (changes.warningTime) {
                updates.warningTime = changes.warningTime.newValue;
            }
            if (changes.isActiveDelay) {
                updates.isActiveDelay = changes.isActiveDelay.newValue * 1000;
            }
            if (changes.autoCloseWhitelist) {
                updates.autoCloseWhitelist = changes.autoCloseWhitelist.newValue;
            }

            if (Object.keys(updates).length > 0) {
                Object.assign(this, mergeContext(this, updates));
            }

            return this;
        },
        async tabCreated(tab: any) {
            this.updateTabActivationTime(tab.id);

            if (tab.pendingUrl === "chrome://newtab/" || tab.url === "chrome://newtab/") {
                this.context.newTabIds.add(tab.id);

                if (!this.isTabPinned(tab)) {
                    try {
                        await chrome.tabs.move(tab.id, { index: 0 });
                    } catch (error) {
                        console.error(error);
                    }
                }
            }

            return this;
        },
        tabRemoved(tabId: number) {
            delete this.context.tabLastActivated[tabId];
            chrome.storage.local.set({ tabLastActivated: this.context.tabLastActivated });

            const index = this.context.tabHistory.indexOf(tabId);
            if (index > -1) {
                this.context.tabHistory.splice(index, 1);
            }

            this.context.newTabIds.delete(tabId);
            this.context.tabOriginalTitles.delete(tabId);
            return this;
        },
        async tabUpdated(tabId: number, changeInfo: any, tab: any) {
            if (this.context.newTabIds.has(tabId) && changeInfo.url && !changeInfo.url.startsWith("chrome://newtab")) {
                if (!this.isTabPinned(tab)) {
                    try {
                        await chrome.tabs.move(tabId, { index: 0 });
                    } catch (error) {
                        console.error(error);
                    }
                }
                this.context.newTabIds.delete(tabId);
            }

            if (typeof changeInfo.pinned !== "undefined") {
                const isNativelyPinned = changeInfo.pinned;
                const internalIndex = this.context.pinnedTabs.indexOf(tabId);

                if (isNativelyPinned && internalIndex > -1) {
                    this.context.pinnedTabs.splice(internalIndex, 1);
                }

                chrome.storage.local.set({ pinnedTabs: this.context.pinnedTabs }, () => {
                    chrome.tabs.get(tabId, (updatedTab: any) => {
                        if (updatedTab) {
                            this.updateTabTitle(tabId, this.isTabPinned(updatedTab));
                        }
                    });
                });
            }

            if (changeInfo.status === "complete") {
                this.updateTabActivationTime(tabId);
            }

            return this;
        },
        finalizeTabActivation(tabId: number) {
            this.updateTabActivationTime(tabId);
            this.updateTabHistory(tabId);
            this.resetMoveTimer();
            this.startMoveTimer(tabId, this.context.reorderDelay);
            return this;
        },
        tabActivated(activeInfo: any) {
            if (activeDelayMatch.is.pending(this.context.activeDelay)) {
                clearTimeout(this.context.activeDelay.context.timeoutId);
                this.context.activeDelay = this.context.activeDelay.clear();
            }

            if (this.context.isActiveDelay === 0) {
                this.finalizeTabActivation(activeInfo.tabId);
            } else {
                const timeoutId = setTimeout(
                    () => this.activeDelayFired(timeoutId, activeInfo.tabId),
                    this.context.isActiveDelay
                ) as unknown as number;
                this.context.activeDelay = this.context.activeDelay.schedule(timeoutId);
            }

            return this;
        },
        activeDelayFired(timeoutId: number, tabId: number) {
            if (activeDelayMatch.is.pending(this.context.activeDelay) &&
                this.context.activeDelay.context.timeoutId === timeoutId) {
                this.finalizeTabActivation(tabId);
                this.context.activeDelay = createActiveDelay();
            }
            return this;
        },
        command(command: string) {
            switch (command) {
                case "go-to-last-tab":
                    this.goToLastTab();
                    break;
                case "cycle-through-tabs":
                    this.cycleThroughTabs("backward");
                    break;
                case "cycle-through-tabs-forward":
                    this.cycleThroughTabs("forward");
                    break;
                case "toggle-pin":
                    this.togglePin();
                    break;
                case "move-to-first":
                    this.moveTabToFirst();
                    break;
                case "close-all-old-tabs":
                    this.closeOldTabs();
                    break;
                case "clear-pick-mode":
                    this.endPickMode();
                    break;
                case "pick":
                case "close-pick":
                    this.startPickMode(command === "close-pick");
                    break;
                case "go-to-following-tab":
                    this.goToFollowingTab();
                    break;
                case "go-to-preceeding-tab":
                    this.goToPreceedingTab();
                    break;
                case "go-to-first-tab":
                    this.goToFirstTab();
                    break;
                case "go-to-last-tab-in-list":
                    this.goToLastTabInList();
                    break;
                case "reopen-last-closed-tab":
                    this.reopenLastClosedTab();
                    break;
                case "close-all-preceding-tabs":
                    this.closeAllPrecedingTabs();
                    break;
                case "close-all-following-tabs":
                    this.closeAllFollowingTabs();
                    break;
                case "close-all-except-current":
                    this.closeAllExceptCurrent();
                    break;
                case "toggle-countdown-timers":
                    this.toggleCountdownTimers();
                    break;
                case "move-tab-left":
                    this.moveTabLeft();
                    break;
                case "move-tab-right":
                    this.moveTabRight();
                    break;
                case "move-tab-to-end":
                    this.moveTabToEnd();
                    break;
                default:
                    if (command.startsWith("focus-tab-")) {
                        this.focusTabByIndex(command);
                    }
            }

            return this;
        },
        message(message: any) {
            const { key, type, shiftKey } = message;

            if (key && listOfLetters.includes(key)) {
                this.handlePickModeKeyPress(key, shiftKey);
            } else if (type === "cancel_pick_mode") {
                this.endPickMode();
            }

            return this;
        },
        alarm(alarm: any) {
            if (alarm.name === "autoCloseAlarm") {
                this.closeOldTabs();
            }
            return this;
        },
        mouseLeave() {
            this.leaveMouseState();
            if (moveTimerMatch.is.running(this.context.moveTimer)) {
                const elapsedTime = Date.now() - this.context.moveTimer.context.startTime;
                const remainingDuration = this.context.moveTimer.context.initialDuration - elapsedTime;
                clearTimeout(this.context.moveTimer.context.timeoutId);
                const nextRemaining = remainingDuration > 0 ? remainingDuration : 0;
                this.context.moveTimer = this.context.moveTimer.pause(nextRemaining, Date.now());
            }
            return this;
        },
        mouseEnter() {
            this.enterMouseState();
            if (moveTimerMatch.is.paused(this.context.moveTimer) && this.context.moveTimer.context.remainingDuration > 0) {
                this.startMoveTimer(this.context.moveTimer.context.tabId, this.context.moveTimer.context.remainingDuration);
            }
            return this;
        },
        async startMoveTimer(tabId: number, duration: number) {
            try {
                const tab = await chrome.tabs.get(tabId);
                if (this.isTabPinned(tab)) {
                    return this;
                }
            } catch (error) {
                return this;
            }

            if (moveTimerMatch.is.running(this.context.moveTimer)) {
                clearTimeout(this.context.moveTimer.context.timeoutId);
            }

            const startTime = Date.now();
            const timeoutId = setTimeout(
                () => this.moveTimeoutFired(timeoutId),
                duration
            ) as unknown as number;

            this.context.moveTimer = this.context.moveTimer.start(tabId, duration, timeoutId, startTime);

            return this;
        },
        async moveTimeoutFired(timeoutId: number) {
            if (!moveTimerMatch.is.running(this.context.moveTimer)) return this;
            if (this.context.moveTimer.context.timeoutId !== timeoutId) return this;

            const tabId = this.context.moveTimer.context.tabId;

            try {
                const tab = await chrome.tabs.get(tabId);
                if (!this.shouldReorderTab(tab)) {
                    return this;
                }
                await chrome.tabs.move(tabId, { index: 0 });
            } catch (error) {
                console.error(`Error moving tab ${tabId}:`, error);
            }

            this.context.moveTimer = createMoveTimer();
            return this;
        },
        async closeOldTabs() {
            if (!autoCloseMatch.is.enabled(this.context.autoClose)) {
                return this;
            }

            const tabs = await chrome.tabs.query({ currentWindow: true });
            const now = Date.now();
            const autoCloseTimeMs = this.context.autoCloseTime * 60 * 1000;

            const closingPromises = tabs.map((tab: any) => {
                return new Promise(async (resolve) => {
                    if (tab.url) {
                        if (tab.url.startsWith("http:") || tab.url.startsWith("https:")) {
                            try {
                                const tabUrl = new URL(tab.url);
                                if (this.context.autoCloseWhitelist.includes(tabUrl.hostname)) {
                                    return resolve(false);
                                }
                            } catch (e) {
                                return resolve(false);
                            }
                        } else if (tab.url.startsWith("file:")) {
                            if (this.context.autoCloseWhitelist.includes(tab.url)) {
                                return resolve(false);
                            }
                        }
                    }

                    if (this.isTabPinned(tab) || tab.audible) {
                        return resolve(false);
                    }

                    const lastActivated = this.context.tabLastActivated[tab.id];
                    if (!lastActivated) {
                        this.updateTabActivationTime(tab.id);
                        return resolve(false);
                    }

                    if (now - lastActivated > autoCloseTimeMs) {
                        try {
                            const response = await new Promise((resolveResponse) => {
                                chrome.tabs.sendMessage(tab.id, { type: "checkUnsaved" }, (responseMessage: any) => {
                                    if (chrome.runtime.lastError) {
                                        return resolveResponse({ hasUnsavedChanges: true });
                                    }
                                    resolveResponse(responseMessage);
                                });
                            });

                            if (response && !(response as any).hasUnsavedChanges) {
                                const currentTabState = await chrome.tabs.get(tab.id);
                                if (!currentTabState.active) {
                                    await chrome.tabs.remove(tab.id);
                                    return resolve(tab);
                                }
                            }
                        } catch (e) {
                            return resolve(false);
                        }
                    }

                    return resolve(false);
                });
            });

            const results = await Promise.all(closingPromises);
            const closedTabs = results.filter(Boolean) as any[];

            if (closedTabs.length > 0) {
                const notificationItems = closedTabs.map((tab: any) => ({ title: tab.title, message: tab.url || "No URL available" }));
                const title = `Closed ${closedTabs.length} old tab(s)`;

                chrome.notifications.create({
                    type: "list",
                    iconUrl: "icon128.png",
                    title,
                    message: title,
                    items: notificationItems
                });
            }

            return this;
        },
        startPickMode(isCloseMode: boolean) {
            this.resetMoveTimer();

            const timeoutId = setTimeout(
                () => this.pickTimeoutFired(timeoutId),
                5000
            ) as unknown as number;
            this.context.pickMode = pickModeMatch.when(this.context.pickMode).is(
                pickModeMatch.case.active((mode) => {
                    clearTimeout(mode.context.timeoutId);
                    return mode.updateTimeout(timeoutId);
                }),
                pickModeMatch.case.idle((mode) => mode.start(isCloseMode, timeoutId)),
                pickModeMatch.exhaustive
            );

            chrome.tabs.query({ currentWindow: true }, (tabList: any[]) => {
                const injectableTabs = tabList.filter((tab) => !this.isUrlRestricted(tab.url));
                if (!injectableTabs.length) return;

                injectableTabs.forEach((tab, index) => {
                    this.setOriginalTitle(tab.id, tab.title);

                    const listenerToInject = tab.active ? politeListener : robustListener;
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        args: [listOfLetters],
                        func: listenerToInject
                    }).catch(() => {});

                    const titlePrefix = listOfLetters[index] ?? index.toString();

                    chrome.scripting.executeScript({
                        func: function (prefix: string, currentTitle: string) {
                            document.title = prefix + ": " + currentTitle;
                        },
                        args: [titlePrefix, tab.title],
                        target: { tabId: tab.id, allFrames: true }
                    }).catch(() => {});
                });
            });

            return this;
        },
        endPickMode() {
            this.context.pickMode = pickModeMatch.when(this.context.pickMode).is(
                pickModeMatch.case.active((mode) => {
                    clearTimeout(mode.context.timeoutId);
                    return mode.end();
                }),
                pickModeMatch.case.idle((mode) => mode),
                pickModeMatch.exhaustive
            );

            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => {
                if (!tabs || tabs.length === 0) return;
                tabs.forEach((tab) => {
                    chrome.tabs.sendMessage(tab.id, { type: "cleanup_pick_mode" }).catch(() => {});
                });
            });

            this.revertAllTabTitlesAndCleanUp();
            return this;
        },
        pickTimeoutFired(timeoutId: number) {
            if (pickModeMatch.is.active(this.context.pickMode) &&
                this.context.pickMode.context.timeoutId === timeoutId) {
                this.endPickMode();
            }
            return this;
        },
        handlePickModeKeyPress(key: string, shiftKey: boolean) {
            this.resetMoveTimer();

            const letterIndex = listOfLetters.indexOf(key);
            if (letterIndex > -1) {
                const shouldClose = pickModeMatch.is.active(this.context.pickMode)
                    ? this.context.pickMode.context.isCloseMode
                    : false;

                chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => {
                    const injectableTabs = tabs.filter((tab) => !this.isUrlRestricted(tab.url));
                    if (letterIndex < injectableTabs.length) {
                        const targetTab = injectableTabs[letterIndex];
                        if (targetTab) {
                            const targetTabId = targetTab.id;
                            if (shiftKey || shouldClose) {
                                chrome.tabs.remove(targetTabId);
                            } else {
                                chrome.tabs.update(targetTabId, { active: true, highlighted: true });
                            }
                        }
                    }
                    this.endPickMode();
                });
            } else {
                this.endPickMode();
            }

            return this;
        },
        toggleCountdownTimers() {
            if (countdownMatch.is.on(this.context.countdown)) {
                this.stopAllCountdownTimers();
                return this;
            }

            if (autoCloseMatch.is.enabled(this.context.autoClose)) {
                this.startAllCountdownTimers();
            } else {
                console.log("Tbbr: Countdown timers require auto-close to be enabled in options.");
            }

            return this;
        },
        startAllCountdownTimers() {
            if (countdownMatch.is.on(this.context.countdown)) {
                clearInterval(this.context.countdown.context.intervalId);
            }
            this.updateAllTabTimers();
            const intervalId = setInterval(() => this.updateAllTabTimers(), 1000) as unknown as number;
            this.context.countdown = this.context.countdown.start(intervalId);
            return this;
        },
        stopAllCountdownTimers() {
            if (countdownMatch.is.on(this.context.countdown)) {
                clearInterval(this.context.countdown.context.intervalId);
                this.context.countdown = this.context.countdown.stop();
            }
            this.revertAllTabTitlesAndCleanUp();
            return this;
        },
        async updateAllTabTimers() {
            if (!countdownMatch.is.on(this.context.countdown)) return this;

            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const allTabs = await chrome.tabs.query({ currentWindow: true });

            for (const tab of allTabs) {
                if (this.isUrlRestricted(tab.url)) continue;

                const lastActivated = this.context.tabLastActivated[tab.id];
                const isExcluded = !tab.id || !lastActivated || (activeTab && tab.id === activeTab.id) || this.isTabPinned(tab);

                this.setOriginalTitle(tab.id, tab.title);
                const originalTitle = this.context.tabOriginalTitles.get(tab.id) ?? tab.title;
                const isPinned = this.isTabPinned(tab);
                const pinMarker = "📌 ";
                let newTitle = isPinned ? pinMarker + originalTitle : originalTitle;

                if (!isExcluded) {
                    const now = Date.now();
                    const autoCloseTimeMs = this.context.autoCloseTime * 60 * 1000;
                    const deadline = lastActivated + autoCloseTimeMs;
                    const remainingMs = deadline - now;
                    const warningTimeMs = this.context.warningTime * 60 * 1000;
                    let timeStr;

                    if (remainingMs <= 0) {
                        timeStr = "[EXPIRED]";
                    } else {
                        const minutes = String(Math.floor(remainingMs / 60000)).padStart(2, "0");
                        const seconds = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0");
                        if (warningTimeMs > 0 && remainingMs <= warningTimeMs) {
                            timeStr = `[WARN ${minutes}:${seconds}]`;
                        } else {
                            timeStr = `[${minutes}:${seconds}]`;
                        }
                    }
                    newTitle = timeStr + " " + newTitle;
                }

                if (tab.title !== newTitle) {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: (title: string) => { document.title = title; },
                        args: [newTitle]
                    }).catch(() => {});
                }
            }

            return this;
        },
        moveTabLeft() {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                if (tabs.length > 0) {
                    const currentTab = tabs[0];
                    if (currentTab.index > 0) {
                        chrome.tabs.move(currentTab.id, { index: currentTab.index - 1 });
                    }
                }
            });
            return this;
        },
        moveTabRight() {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                if (tabs.length > 0) {
                    const currentTab = tabs[0];
                    chrome.tabs.query({ currentWindow: true }, (allTabs: any[]) => {
                        if (currentTab.index < allTabs.length - 1) {
                            chrome.tabs.move(currentTab.id, { index: currentTab.index + 1 });
                        }
                    });
                }
            });
            return this;
        },
        moveTabToEnd() {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                if (tabs.length > 0) {
                    const currentTab = tabs[0];
                    chrome.tabs.query({ currentWindow: true }, (allTabs: any[]) => {
                        chrome.tabs.move(currentTab.id, { index: allTabs.length - 1 });
                    });
                }
            });
            return this;
        },
        goToFollowingTab() {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                if (tabs.length > 0) {
                    const currentTab = tabs[0];
                    chrome.tabs.query({ currentWindow: true }, (allTabs: any[]) => {
                        const nextTabIndex = (currentTab.index + 1) % allTabs.length;
                        const nextTab = allTabs.find((tab) => tab.index === nextTabIndex);
                        if (nextTab) {
                            chrome.tabs.update(nextTab.id, { active: true });
                        }
                    });
                }
            });
            return this;
        },
        goToPreceedingTab() {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                if (tabs.length > 0) {
                    const currentTab = tabs[0];
                    chrome.tabs.query({ currentWindow: true }, (allTabs: any[]) => {
                        const prevTabIndex = (currentTab.index - 1 + allTabs.length) % allTabs.length;
                        const prevTab = allTabs.find((tab) => tab.index === prevTabIndex);
                        if (prevTab) {
                            chrome.tabs.update(prevTab.id, { active: true });
                        }
                    });
                }
            });
            return this;
        },
        goToFirstTab() {
            chrome.tabs.query({ index: 0, currentWindow: true }, (tabs: any[]) => {
                if (tabs.length > 0) {
                    chrome.tabs.update(tabs[0].id, { active: true });
                }
            });
            return this;
        },
        goToLastTabInList() {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => {
                if (tabs.length > 0) {
                    const lastTabIndex = Math.max(...tabs.map((t) => t.index));
                    const lastTab = tabs.find((t) => t.index === lastTabIndex);
                    if (lastTab) {
                        chrome.tabs.update(lastTab.id, { active: true });
                    }
                }
            });
            return this;
        },
        goToLastTab() {
            if (this.context.tabHistory.length > 1) {
                chrome.tabs.update(this.context.tabHistory[1], { active: true });
            }
            return this;
        },
        reopenLastClosedTab() {
            chrome.sessions.getRecentlyClosed({ maxResults: 1 }, (sessions: any[]) => {
                if (sessions && sessions.length > 0) {
                    const lastClosedSession = sessions[0];
                    if (lastClosedSession.tab || lastClosedSession.window) {
                        chrome.sessions.restore(lastClosedSession.sessionId);
                    }
                }
            });
            return this;
        },
        getNextCycleTabIndex(currentIndex: number, direction: "backward" | "forward", history: number[], originalTabId: number | null) {
            if (history.length < 2) return currentIndex;

            const increment = direction === "backward" ? 1 : -1;
            let nextIndex = currentIndex;

            for (let i = 0; i < history.length; i++) {
                nextIndex = (nextIndex + increment + history.length) % history.length;
                if (history[nextIndex] !== originalTabId) {
                    return nextIndex;
                }
            }
            return (currentIndex + increment + history.length) % history.length;
        },
        cycleThroughTabs(direction: "backward" | "forward" = "backward") {
            if (this.context.tabHistory.length < 2) return this;

            if (!cycleMatch.is.active(this.context.cycleState)) {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                    if (tabs.length > 0) {
                        const originalTabId = tabs[0].id;
                        const startIndex = this.context.tabHistory.indexOf(originalTabId);
                        const validStartIndex = startIndex !== -1 ? startIndex : 0;
                        const nextIndex = this.getNextCycleTabIndex(validStartIndex, direction, this.context.tabHistory, originalTabId);

                        chrome.tabs.update(this.context.tabHistory[nextIndex], { active: true });
                        const timeoutId = setTimeout(
                            () => this.cycleTimeoutFired(timeoutId),
                            this.context.cycleTimeout
                        ) as unknown as number;
                        this.context.cycleState = this.context.cycleState.start(originalTabId, nextIndex, timeoutId);
                    }
                });
            } else {
                clearTimeout(this.context.cycleState.context.timeoutId);

                const nextIndex = this.getNextCycleTabIndex(this.context.cycleState.context.currentIndex, direction, this.context.tabHistory, this.context.cycleState.context.originalTabId);

                chrome.tabs.update(this.context.tabHistory[nextIndex], { active: true });
                const timeoutId = setTimeout(
                    () => this.cycleTimeoutFired(timeoutId),
                    this.context.cycleTimeout
                ) as unknown as number;
                this.context.cycleState = this.context.cycleState.advance(nextIndex, timeoutId);
            }

            return this;
        },
        endCycle() {
            if (!cycleMatch.is.active(this.context.cycleState)) return this;

            this.resetMoveTimer();

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                if (tabs.length > 0) {
                    const finalTabId = tabs[0].id;
                    this.updateTabHistory(finalTabId);
                    const originalIndex = this.context.tabHistory.indexOf(this.context.cycleState.context.originalTabId);
                    if (originalIndex > -1) {
                        this.context.tabHistory.splice(originalIndex, 1);
                    }
                    this.context.tabHistory.splice(1, 0, this.context.cycleState.context.originalTabId);

                    if (this.shouldReorderTab(tabs[0])) {
                        this.startMoveTimer(finalTabId, this.context.reorderDelay);
                    }
                }
                this.context.cycleState = this.context.cycleState.end();
            });

            return this;
        },
        cycleTimeoutFired(timeoutId: number) {
            if (cycleMatch.is.active(this.context.cycleState) &&
                this.context.cycleState.context.timeoutId === timeoutId) {
                this.endCycle();
            }
            return this;
        },
        togglePin() {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                if (tabs.length > 0) {
                    const tab = tabs[0];
                    const tabId = tab.id;

                    if (tab.pinned) {
                        console.log("Tbbr: Cannot modify soft-pin on a natively pinned tab.");
                        return;
                    }

                    const internalIndex = this.context.pinnedTabs.indexOf(tabId);
                    if (internalIndex > -1) {
                        this.context.pinnedTabs.splice(internalIndex, 1);
                    } else {
                        this.context.pinnedTabs.push(tabId);
                    }

                    const shouldBePinned = this.isTabPinned(tab);

                    chrome.storage.local.set({ pinnedTabs: this.context.pinnedTabs }, () => {
                        this.updateTabTitle(tabId, shouldBePinned);
                    });

                    if (moveTimerMatch.is.running(this.context.moveTimer) && this.context.moveTimer.context.tabId === tabId) {
                        clearTimeout(this.context.moveTimer.context.timeoutId);
                        this.context.moveTimer = this.context.moveTimer.finish();
                    }
                }
            });
            return this;
        },
        moveTabToFirst() {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                if (tabs.length > 0) {
                    chrome.tabs.move(tabs[0].id, { index: 0 });
                }
            });
            return this;
        },
        focusTabByIndex(command: string) {
            const tabIndex = parseInt(command.split("-")[2], 10) - 1;
            chrome.tabs.query({ index: tabIndex, currentWindow: true }, (tabs: any[]) => {
                if (tabs.length > 0) {
                    chrome.tabs.update(tabs[0].id, { active: true });
                }
            });
            return this;
        },
        async initializeTabHistory() {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            tabs.sort((a: any, b: any) => {
                const timeA = this.context.tabLastActivated[a.id] || 0;
                const timeB = this.context.tabLastActivated[b.id] || 0;
                return timeB - timeA;
            });
            this.context.tabHistory = tabs.map((tab: any) => tab.id);
            return this;
        },
        updateTabHistory(tabId: number) {
            const index = this.context.tabHistory.indexOf(tabId);
            if (index > -1) {
                this.context.tabHistory.splice(index, 1);
            }
            this.context.tabHistory.unshift(tabId);
            return this;
        },
        updateTabActivationTime(tabId: number) {
            this.context.tabLastActivated[tabId] = Date.now();
            chrome.storage.local.set({ tabLastActivated: this.context.tabLastActivated });
            return this;
        },
        revertAllTabTitlesAndCleanUp() {
            chrome.tabs.query({ currentWindow: true }, (tabs: any[]) => {
                if (!tabs || tabs.length === 0) {
                    return;
                }
                tabs.forEach((tab) => {
                    if (this.isUrlRestricted(tab.url) || !this.context.tabOriginalTitles.has(tab.id)) {
                        return;
                    }

                    const originalTitle = this.context.tabOriginalTitles.get(tab.id) ?? tab.title;
                    const isPinned = this.isTabPinned(tab);
                    const pinMarker = "📌 ";
                    const restoredTitle = isPinned ? pinMarker + originalTitle : originalTitle;

                    if (tab.title !== restoredTitle) {
                        chrome.scripting.executeScript({
                            target: { tabId: tab.id, allFrames: true },
                            func: (title: string) => { document.title = title; },
                            args: [restoredTitle]
                        }).catch(() => {});
                    }
                });
            });
            return this;
        },
        setOriginalTitle(tabId: number, title: string) {
            const canRefreshBaseline =
                pickModeMatch.is.idle(this.context.pickMode) && countdownMatch.is.off(this.context.countdown);

            if (!this.context.tabOriginalTitles.has(tabId) || canRefreshBaseline) {
                const timerRegex = /^\[((WARN\s)?\d{1,2}:\d{2}|EXPIRED)\]\s/;
                const pickModeRegex = /^[a-z;,.]:\s/;
                const pinMarker = "📌 ";
                const cleanedTitle = title
                    .replace(timerRegex, "")
                    .replace(pickModeRegex, "")
                    .replace(pinMarker, "");
                this.context.tabOriginalTitles.set(tabId, cleanedTitle);
            }
            return this;
        },
        isUrlRestricted(url: string) {
            if (!url) return true;
            return url.startsWith("chrome://") ||
                url.startsWith("edge://") ||
                url.startsWith("about:") ||
                url.startsWith("chrome-extension://") ||
                url.startsWith("edge-extension://") ||
                url.startsWith("https://chrome.google.com/webstore/");
        },
        isTabPinned(tab: any) {
            if (!tab) return false;
            return tab.pinned || this.context.pinnedTabs.includes(tab.id);
        },
        shouldReorderTab(tab: any) {
            return !!tab &&
                mouseMatch.is.inside(this.context.mouse) &&
                !this.isUrlRestricted(tab.url) &&
                !this.isTabPinned(tab);
        },
        updateTabTitle(tabId: number, shouldBePinned: boolean) {
            chrome.tabs.get(tabId, (tab: any) => {
                if (chrome.runtime.lastError || !tab || this.isUrlRestricted(tab.url)) {
                    return;
                }

                this.setOriginalTitle(tabId, tab.title);
                const originalTitle = this.context.tabOriginalTitles.get(tabId) ?? tab.title;

                const pinMarker = "📌 ";
                let newTitle = originalTitle;

                if (shouldBePinned) {
                    newTitle = pinMarker + originalTitle;
                }

                if (tab.title !== newTitle) {
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        func: (title: string) => { document.title = title; },
                        args: [newTitle]
                    }).catch(() => {});
                }
            });
            return this;
        },
        resetMoveTimer() {
            if (moveTimerMatch.is.running(this.context.moveTimer)) {
                clearTimeout(this.context.moveTimer.context.timeoutId);
            }
            this.context.moveTimer = createMoveTimer();
            return this;
        }
    }));

export type BackgroundMachine = ReturnType<typeof createBackgroundMachine>;

export type BackgroundActor = Actor<BackgroundMachine>;

export const createBackgroundActor = (overrides: Partial<BackgroundContext> = {}) => {
    const actor = createActor(createBackgroundMachine(overrides));
    actor.send.initialize();

    chrome.storage.onChanged.addListener((changes, namespace) => actor.send.storageChanged(changes, namespace));
    chrome.tabs.onCreated.addListener((tab) => actor.send.tabCreated(tab));
    chrome.tabs.onRemoved.addListener((tabId) => actor.send.tabRemoved(tabId));
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => actor.send.tabUpdated(tabId, changeInfo, tab));
    chrome.tabs.onActivated.addListener((activeInfo) => actor.send.tabActivated(activeInfo));
    chrome.commands.onCommand.addListener((command) => actor.send.command(command));
    chrome.runtime.onMessage.addListener((message) => actor.send.message(message));
    chrome.alarms.onAlarm.addListener((alarm) => actor.send.alarm(alarm));

    chrome.runtime.onConnect.addListener((port: any) => {
        if (port.name === "mouse-tracker") {
            port.onMessage.addListener((message: any) => {
                if (message.type === "mouse_enter") {
                    actor.send.mouseEnter();
                } else if (message.type === "mouse_leave") {
                    actor.send.mouseLeave();
                }
            });
        }
    });

    return actor;
};

const politeListener = function (letters: string[]) {
    const ELEMENT_ID = "tbbr-focus-element";
    const cleanup = () => {
        if ((window as any).pickModeCleanupHandler) {
            chrome.runtime.onMessage.removeListener((window as any).pickModeCleanupHandler);
            delete (window as any).pickModeCleanupHandler;
        }
        const focusElement = document.getElementById(ELEMENT_ID);
        if (focusElement) {
            focusElement.remove();
        }
    };
    cleanup();
    const focusElement = document.createElement("input");
    focusElement.id = ELEMENT_ID;
    focusElement.style.cssText = "position:fixed;opacity:0;top:0;left:0;width:0;height:0;padding:0;border:0;";
    document.body.appendChild(focusElement);
    focusElement.focus();
    const keyDownHandler = (e: KeyboardEvent) => {
        e.stopImmediatePropagation();
        if (e.key === "Escape") {
            chrome.runtime.sendMessage({ type: "cancel_pick_mode" });
            cleanup();
        } else if (letters.includes(e.key.toLowerCase())) {
            chrome.runtime.sendMessage({ key: e.key.toLowerCase(), shiftKey: e.shiftKey });
            cleanup();
        }
    };
    focusElement.addEventListener("keydown", keyDownHandler);
    (window as any).pickModeCleanupHandler = (message: any) => {
        if (message && message.type === "cleanup_pick_mode") {
            cleanup();
        }
    };
    chrome.runtime.onMessage.addListener((window as any).pickModeCleanupHandler);
};

const robustListener = function (letters: string[]) {
    const cleanup = () => {
        if ((window as any).pickModeKeyDownHandler) {
            window.removeEventListener("keydown", (window as any).pickModeKeyDownHandler, true);
            delete (window as any).pickModeKeyDownHandler;
        }
        if ((window as any).pickModeCleanupHandler) {
            chrome.runtime.onMessage.removeListener((window as any).pickModeCleanupHandler);
            delete (window as any).pickModeCleanupHandler;
        }
    };
    cleanup();
    (window as any).pickModeKeyDownHandler = (e: KeyboardEvent) => {
        if (document.hidden) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.key === "Escape") {
            chrome.runtime.sendMessage({ type: "cancel_pick_mode" });
            cleanup();
        } else if (letters.includes(e.key.toLowerCase())) {
            chrome.runtime.sendMessage({ key: e.key.toLowerCase(), shiftKey: e.shiftKey });
            cleanup();
        }
    };
    (window as any).pickModeCleanupHandler = (message: any) => {
        if (message && message.type === "cleanup_pick_mode") {
            cleanup();
        }
    };
    window.addEventListener("keydown", (window as any).pickModeKeyDownHandler, true);
    chrome.runtime.onMessage.addListener((window as any).pickModeCleanupHandler);
};
