import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBackgroundMachine, MouseTracker } from "./machines";

type ChromeStub = {
    tabs: {
        move: ReturnType<typeof vi.fn>;
        get: ReturnType<typeof vi.fn>;
    };
    storage: {
        local: { set: ReturnType<typeof vi.fn> };
        sync: { get: ReturnType<typeof vi.fn> };
    };
    alarms: {
        create: ReturnType<typeof vi.fn>;
        clear: ReturnType<typeof vi.fn>;
    };
};

const createChromeStub = (): ChromeStub => ({
    tabs: {
        move: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(undefined)
    },
    storage: {
        local: { set: vi.fn() },
        sync: { get: vi.fn() }
    },
    alarms: {
        create: vi.fn(),
        clear: vi.fn()
    }
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

        expect(machine.context.newTabIds.has(1)).toBe(true);
        expect(chromeStub.tabs.move).toHaveBeenCalledWith(1, { index: 0 });
    });

    it("moves tracked new tab after navigation", async () => {
        const machine = createBackgroundMachine();
        machine.context.newTabIds.add(2);
        const tab = { id: 2, url: "https://example.com", pinned: false };

        await machine.tabUpdated(2, { url: "https://example.com" }, tab as any);

        expect(machine.context.newTabIds.has(2)).toBe(false);
        expect(chromeStub.tabs.move).toHaveBeenCalledWith(2, { index: 0 });
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
});
