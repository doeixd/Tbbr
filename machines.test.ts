import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBackgroundMachine, createNewTab, MouseTracker } from "./machines";

type ChromeStub = {
    tabs: {
        move: ReturnType<typeof vi.fn>;
        get: ReturnType<typeof vi.fn>;
        query: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        sendMessage: ReturnType<typeof vi.fn>;
        remove: ReturnType<typeof vi.fn>;
    };
    storage: {
        local: { set: ReturnType<typeof vi.fn> };
        sync: { get: ReturnType<typeof vi.fn> };
    };
    alarms: {
        create: ReturnType<typeof vi.fn>;
        clear: ReturnType<typeof vi.fn>;
    };
    notifications: {
        create: ReturnType<typeof vi.fn>;
    };
    sessions: {
        getRecentlyClosed: ReturnType<typeof vi.fn>;
        restore: ReturnType<typeof vi.fn>;
    };
    runtime: {
        lastError?: unknown;
    };
};

const createChromeStub = (): ChromeStub => ({
    tabs: {
        move: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        sendMessage: vi.fn(),
        remove: vi.fn().mockResolvedValue(undefined)
    },
    storage: {
        local: { set: vi.fn() },
        sync: { get: vi.fn() }
    },
    alarms: {
        create: vi.fn(),
        clear: vi.fn()
    },
    notifications: {
        create: vi.fn()
    },
    sessions: {
        getRecentlyClosed: vi.fn(),
        restore: vi.fn().mockResolvedValue(undefined)
    },
    runtime: {}
});

describe("machines", () => {
    let chromeStub: ChromeStub;

    beforeEach(() => {
        chromeStub = createChromeStub();
        (globalThis as any).chrome = chromeStub;
    });

    it("moves new tab pages to index 0", async () => {
        const machine = createBackgroundMachine();
        const tab = { id: 1, pendingUrl: "chrome://newtab/", url: "chrome://newtab/", pinned: false };

        await machine.tabCreated(tab as any);

        expect(machine.context.trackedNewTabs.get(1)?.context.status).toBe("newTabPage");
        expect(chromeStub.tabs.move).toHaveBeenCalledWith(1, { index: 0 });
    });

    it("moves tracked new tab after navigation", async () => {
        const machine = createBackgroundMachine();
        machine.context.trackedNewTabs.set(2, createNewTab({ status: "newTabPage" }));
        const tab = { id: 2, url: "https://example.com", pinned: false };

        await machine.tabUpdated(2, { url: "https://example.com" }, tab as any);

        expect(machine.context.trackedNewTabs.has(2)).toBe(false);
        expect(chromeStub.tabs.move).toHaveBeenCalledWith(2, { index: 0 });
    });

    it("tracks Edge new tab pages too", async () => {
        const machine = createBackgroundMachine();
        const tab = { id: 7, pendingUrl: "edge://newtab/", url: "edge://newtab/", pinned: false };

        await machine.tabCreated(tab as any);

        expect(machine.context.trackedNewTabs.get(7)?.context.status).toBe("newTabPage");
        expect(chromeStub.tabs.move).toHaveBeenCalledWith(7, { index: 0 });
    });

    it("tracks unresolved new tabs and moves them when URL resolves", async () => {
        const machine = createBackgroundMachine();
        const tab = { id: 8, pendingUrl: "", url: "", pinned: false };

        await machine.tabCreated(tab as any);

        expect(machine.context.trackedNewTabs.get(8)?.context.status).toBe("unresolved");
        expect(chromeStub.tabs.move).not.toHaveBeenCalled();

        await machine.tabUpdated(8, { url: "https://example.com" }, { id: 8, url: "https://example.com", pinned: false } as any);

        expect(chromeStub.tabs.move).toHaveBeenCalledWith(8, { index: 0 });
        expect(machine.context.trackedNewTabs.has(8)).toBe(false);
    });

    it("promotes unresolved tab to newTabPage when URL resolves to an NTP", async () => {
        const machine = createBackgroundMachine();
        const tab = { id: 9, pendingUrl: "", url: "", pinned: false };

        await machine.tabCreated(tab as any);
        await machine.tabUpdated(9, { url: "chrome://newtab/" }, { id: 9, url: "chrome://newtab/", pinned: false } as any);

        expect(machine.context.trackedNewTabs.get(9)?.context.status).toBe("newTabPage");
        expect(chromeStub.tabs.move).toHaveBeenCalledWith(9, { index: 0 });
    });

    it("skips redundant moves when a confirmed NTP keeps an NTP URL", async () => {
        const machine = createBackgroundMachine();
        const tab = { id: 10, pendingUrl: "chrome://newtab/", url: "chrome://newtab/", pinned: false };

        await machine.tabCreated(tab as any);
        chromeStub.tabs.move.mockClear();

        await machine.tabUpdated(10, { url: "chrome://newtab/" }, { id: 10, url: "chrome://newtab/", pinned: false } as any);

        expect(chromeStub.tabs.move).not.toHaveBeenCalled();
        expect(machine.context.trackedNewTabs.get(10)?.context.status).toBe("newTabPage");
    });

    it("does not move restricted tabs", async () => {
        vi.useFakeTimers();
        chromeStub.tabs.get.mockResolvedValue({ id: 3, url: "chrome://newtab/", pinned: false });

        const machine = createBackgroundMachine({ mouse: new MouseTracker(true) });

        await machine.startMoveTimer(3, 10);
        await vi.runAllTimersAsync();

        expect(chromeStub.tabs.move).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it("does not refresh last-activated on background tab load completion", async () => {
        const machine = createBackgroundMachine({
            tabLastActivated: { 4: 100 }
        });
        const before = machine.context.tabLastActivated[4];

        await machine.tabUpdated(4, { status: "complete" }, { id: 4, active: false, url: "https://example.com", pinned: false } as any);

        expect(machine.context.tabLastActivated[4]).toBe(before);
    });

    it("only reorders active tabs", () => {
        const machine = createBackgroundMachine({ mouse: new MouseTracker(true) });

        expect(machine.shouldReorderTab({ id: 5, active: false, url: "https://example.com", pinned: false })).toBe(false);
        expect(machine.shouldReorderTab({ id: 5, active: true, url: "https://example.com", pinned: false })).toBe(true);
    });

    it("uses only current-window history for go-to-last-tab", async () => {
        chromeStub.tabs.query.mockResolvedValue([{ id: 11 }, { id: 12 }]);
        const machine = createBackgroundMachine({
            tabHistory: [12, 99, 11]
        });

        await machine.goToLastTab();

        expect(chromeStub.tabs.update).toHaveBeenCalledWith(11, { active: true });
        expect(chromeStub.tabs.update).not.toHaveBeenCalledWith(99, { active: true });
    });

    it("re-checks full auto-close eligibility before removing a tab", async () => {
        const machine = createBackgroundMachine({
            autoClose: (createBackgroundMachine().context.autoClose as any).enable(),
            autoCloseWhitelist: [],
            tabLastActivated: { 21: 0 }
        });

        vi.spyOn(machine, "canAutoCloseTab")
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false);

        chromeStub.tabs.query.mockResolvedValue([{ id: 21, active: false, audible: false, pinned: false, url: "https://example.com", title: "Example" }]);
        chromeStub.tabs.sendMessage.mockImplementation((_tabId: number, _message: any, callback: (response: any) => void) => callback({ hasUnsavedChanges: false }));
        chromeStub.tabs.get.mockResolvedValue({ id: 21, active: false, audible: false, pinned: true, url: "https://example.com", title: "Example" });

        await machine.closeOldTabs();

        expect(chromeStub.tabs.remove).not.toHaveBeenCalled();
    });

    it("reopens all recently closed sessions until the stack is empty", async () => {
        const machine = createBackgroundMachine();

        chromeStub.sessions.getRecentlyClosed
            .mockResolvedValueOnce([{ sessionId: "tab-1", tab: { sessionId: "tab-1" } }])
            .mockResolvedValueOnce([{ sessionId: "window-1", window: { sessionId: "window-1" } }])
            .mockResolvedValueOnce([]);

        await machine.reopenAllClosedTabs();

        expect(chromeStub.sessions.restore).toHaveBeenCalledTimes(2);
        expect(chromeStub.sessions.restore).toHaveBeenNthCalledWith(1, "tab-1");
        expect(chromeStub.sessions.restore).toHaveBeenNthCalledWith(2, "window-1");
    });
});
