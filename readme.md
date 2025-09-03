# Tbbr

Tbbr is a Chrome extension I made for sane tab management. Best used in conjunction with [Vimium C](https://github.com/gdh1995/vimium-c).

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

Then go to `chrome://extensions`, and turn on developer mode.

After that, click *Load unpacked* and navigate to/select the directory where you downloaded the files (e.g., `cd ~/.local/share/Tbbr` on Linux or `cd "$env:LOCALAPPDATA\Tbbr"` on Windows).

Finally, and this is the important part, navigate to `chrome://extensions/shortcuts`. You'll need to set your own keyboard shortcuts for the extension's commands to make them do anything.

## Usage

Tbbr does a few things. All commands must have shortcuts assigned by you at `chrome://extensions/shortcuts`.

### Automatic Tab Reordering

By default, after you land on a tab and wait 5 seconds (configurable in settings), it gets moved to the first position. This helps keep your current context from getting buried. Pinned tabs are ignored. The timer pauses if your mouse leaves the webpage.

### Pick Mode (Tab Switching & Closing)

There's a tab selection mode that lets you switch to, or close, any open tab with a couple of keystrokes.
1.  Activate it with the keyboard shortcut for the `"pick"` command.
2.  The title of each tab will get a letter prepended to it, like `s: Google Search - Results ...`
3.  To switch to a tab, press the letter corresponding to that tab.
4.  To **close** a tab, press **Shift + letter** for that tab.

There is also a dedicated `"close-pick"` command. If you activate pick mode using the shortcut for this command, pressing a letter will close the corresponding tab directly, without needing to hold Shift.

You can cancel out of Pick Mode by hitting `Escape`.

### Navigation Commands

#### Recency-based Navigation
*   **`go-to-last-tab`**: Instantly switch to your previously active tab.
*   **`cycle-through-tabs`**: Activate this command to jump to the last tab you were on. Activate it again (within a configurable timeout) to jump to the one before that, and so on.

#### Positional Navigation
*   **`go-to-following-tab`**: Switch to the tab immediately to the right (wraps around).
*   **`go-to-preceeding-tab`**: Switch to the tab immediately to the left (wraps around).
*   **`go-to-first-tab`**: Jump to the first tab in the tab list.
*   **`go-to-last-tab-in-list`**: Jump to the last tab in the tab list.
*   **`focus-tab-1`**: `Alt+u` (suggested)
*   **`focus-tab-2`**: `Alt+i` (suggested)
*   **`focus-tab-3`**: `Alt+o` (suggested)
*   **`focus-tab-4`**: `Alt+p` (suggested)

### Tab Management Commands

*   **`move-to-first`**: Move current tab to the front. `Alt+g` (suggested)
*   **`reopen-last-closed-tab`**: Restores the most recently closed tab or window.
*   **`close-all-preceding-tabs`**: Closes all tabs to the left of the current tab.
*   **`close-all-following-tabs`**: Closes all tabs to the right of the current tab.
*   **`close-all-except-current`**: Closes all other tabs in the window.

### Pin a Tab

To prevent a tab from being automatically reordered or closed by bulk actions, you can "pin" it. This is useful for tabs you always want to keep in a specific place.

*   To pin or unpin a tab, use the keyboard shortcut for the `"toggle-pin"` command.
*   When a tab is pinned, you'll see a "📌" icon at the beginning of its title.
*   This works with Chrome's native pinning feature—if you pin a tab with your mouse, the extension will also treat it as pinned.

### Automatic Tab Closing

You can enable a feature to automatically close tabs that have not been used after a configurable amount of time. This feature is disabled by default and has several safeguards: it will not close pinned tabs, audible tabs, or tabs that appear to have unsaved changes.

*   **`close-all-old-tabs`**: You can also manually trigger this cleanup with a keyboard shortcut.
*   **`toggle-countdown-timers`**: When auto-close is on, this shows a countdown in each tab's title (e.g., `[59:30]`) for when it will be closed.

### Extension Options

You can configure the extension's behavior by right-clicking the extension icon and selecting "Options". Settings include:
*   Auto-reorder delay.
*   Tab cycle timeout.
*   Enable and configure automatic tab closing.
*   Choose whether bulk-closing commands should ignore pinned tabs (enabled by default).

### Planned Features
- About-to-be-deleted indicator: When a tab is close to deletion, its title will update to show an indicator and an optional countdown.
- Customizable isActive timer: Lets users quickly switch or pass through tabs without marking them as "active." This prevents their inactivity timer from resetting or adding them to the history stack—unless the isActive timer runs out.
