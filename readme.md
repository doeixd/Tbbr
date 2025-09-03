# Tbbr

Tbbr is a Chrome extension for sane tab management. It's designed to keep your current work front-and-center and reduce tab clutter. Best used in conjunction with [Vimium C](https://github.com/gdh1995/vimium-c).

I hacked this together and don't recommend you using this.

## Installation

### Linux/macOS

First, download the files.
```sh
npx degit --force doeixd/Tbbr ~/.local/share/Tbbr
```

### Windows

First, download the files. You can use this command in your terminal:
```powershell
npx degit --force doeixd/Tbbr "$env:LOCALAPPDATA\Tbbr"
```
This will download the extension to a folder named `Tbbr` inside your local AppData directory.

### Loading the extension

1.  Navigate to `chrome://extensions` in your browser.
2.  Turn on **Developer mode** using the toggle in the top-right corner.
3.  Click **Load unpacked**.
4.  Navigate to and select the directory where you downloaded the files (e.g., `~/.local/share/Tbbr` on Linux or `"$env:LOCALAPPDATA\Tbbr"` on Windows).
5.  **Important:** Go to `chrome://extensions/shortcuts`. You must set your own keyboard shortcuts for the extension's commands to make them do anything.

## Features

All commands must have shortcuts assigned by you at `chrome://extensions/shortcuts`.

### Intelligent Tab Activation

To prevent tabs you flick past from cluttering your history, Tbbr waits for a moment before considering a tab "active." This means quickly cycling through tabs won't reset their auto-close timer or add them to your recency list. This delay is configurable in the extension's options (the default is 0 for immediate activation).

### Automatic Tab Management

#### Auto Reordering
By default, after you land on a tab and it becomes active, a 5-second timer starts (configurable in settings). If you remain on the tab, it gets moved to the first position. This helps keep your current context from getting buried.
*   Pinned tabs are ignored.
*   The timer pauses if your mouse leaves the webpage.

#### Auto Closing
You can enable a feature to automatically close tabs that have not been used after a configurable amount of time. This feature is disabled by default and has several safeguards:
*   It will **not** close pinned tabs, audible tabs, or the currently active tab.
*   It attempts to avoid closing tabs with unsaved form changes.
*   **`close-all-old-tabs`**: You can also manually trigger this cleanup with a keyboard shortcut.

#### Countdown Timers & Warnings
When auto-close is on, you can toggle a countdown timer in each tab's title to see when it will be closed.
*   **`toggle-countdown-timers`**: Shows a countdown like `[59:30]` in each tab's title.
*   **Warning Indicator**: When a tab is close to being automatically closed, the indicator will change to give you a heads-up (e.g., `[WARN 04:59]`). You can configure this warning period in the options.

### Pick Mode (Tab Switching & Closing)

This mode lets you switch to, or close, any open tab with a couple of keystrokes.
1.  Activate it with the keyboard shortcut for the **`"pick"`** command.
2.  The title of each tab will get a letter prepended to it, like `s: Google Search`.
3.  To switch to a tab, press the letter corresponding to that tab.
4.  To **close** a tab, press **Shift + letter**.

There is also a dedicated **`"close-pick"`** command. If you activate pick mode with this command's shortcut, pressing a letter will close the corresponding tab directly, without needing Shift.

You can cancel out of Pick Mode by hitting `Escape`.

### Navigation Commands

#### Recency-based Navigation
*   **`go-to-last-tab`**: Instantly switch to your previously active tab.
*   **`cycle-through-tabs`**: This command lets you walk backward through your tab history. When you activate it the first time, it jumps to the last tab you were on. If you activate it again within a few seconds (configurable), it jumps to the tab before that, and so on. This "cycle mode" ends when you stop activating the command, leaving you on the last tab you cycled to.
*   **`cycle-through-tabs-forward`**: Same as above, but cycles forward through your tab history.

#### Positional Navigation
*   **`go-to-following-tab`**: Switch to the tab immediately to the right (wraps around).
*   **`go-to-preceeding-tab`**: Switch to the tab immediately to the left (wraps around).
*   **`go-to-first-tab`**: Jump to the first tab in the tab list.
*   **`go-to-last-tab-in-list`**: Jump to the last tab in the tab list.
*   **Focus Tab by Position**: Jump directly to a tab based on its physical position in the tab bar.
    *   **`focus-tab-1`**: Jumps to the 1st tab. (Suggested: `Alt+u`)
    *   **`focus-tab-2`**: Jumps to the 2nd tab. (Suggested: `Alt+i`)
    *   **`focus-tab-3`**: Jumps to the 3rd tab. (Suggested: `Alt+o`)
    *   **`focus-tab-4`**: Jumps to the 4th tab. (Suggested: `Alt+p`)

### Tab Organization

#### Pinning a Tab
To prevent a tab from being automatically reordered or closed by bulk actions, you can pin it. This is useful for tabs you always want to keep in a specific place.
*   Use the keyboard shortcut for the **`"toggle-pin"`** command to pin or unpin a tab.
*   Pinned tabs get a "📌" icon at the beginning of their title.
*   This works with Chrome's native pinning feature.

#### Other Management Commands
*   **`move-to-first`**: Move current tab to the front. (Suggested: `Alt+g`)
*   **`move-tab-left`**: Move the current tab one position to the left.
*   **`move-tab-right`**: Move the current tab one position to the right.
*   **`reopen-last-closed-tab`**: Restores the most recently closed tab or window.
*   **`close-all-preceding-tabs`**: Closes all tabs to the left of the current tab.
*   **`close-all-following-tabs`**: Closes all tabs to the right of the current tab.
*   **`close-all-except-current`**: Closes all other tabs in the window.

### Extension Options

You can configure the extension's behavior by right-clicking the extension icon and selecting "Options". Settings include:
*   **Auto-reorder delay**: Time in seconds to wait on a tab before moving it to the front.
*   **Cycle-through-tabs timeout**: Time in seconds you have to activate the cycle command again.
*   **Enable auto-close**: Toggle automatic closing of old tabs.
*   **Auto-close time**: How long a tab must be inactive (in minutes) before it's closed.
*   **Show warning indicator**: How many minutes before auto-closing to show the "WARN" indicator.
*   **Mark tab as active after**: Delay in seconds before a tab is considered "active" for history and timers. Use 0 for immediate.
*   **Skip pinned tabs in "close-all" commands**: Choose whether bulk-closing ignores pinned tabs (enabled by default).
