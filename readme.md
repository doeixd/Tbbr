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

By default, after you land on a tab and wait 5 seconds (configurable in settings), it gets moved to the first position. This helps keep your current context from getting buried. Pinned tabs are ignored.

### Pick Mode (Tab Switching & Closing)

There's a tab selection mode that lets you switch to, or close, any open tab with a couple of keystrokes.
1.  Activate it with the keyboard shortcut for the "pick" command.
2.  The title of each tab will get a letter prepended to it, like `s: Google Search - Results ...`
3.  To switch to a tab, press the letter corresponding to that tab.
4.  To **close** a tab, press **Shift + letter** for that tab.

There is also a dedicated "close-pick" command. If you activate pick mode using the shortcut for this command, pressing a letter will close the corresponding tab directly, without needing to hold Shift.

You can cancel out of Pick Mode by hitting `Escape`.

### Navigation Commands

#### Recency-based Navigation
*   **Go to Last Tab**: Instantly switch to your previously active tab.
*   **Cycle Through Previous Tabs**: Activate this command to jump to the last tab you were on. Activate it again (within a configurable timeout) to jump to the one before that, and so on.

#### Positional Navigation
*   **Go to Following Tab**: Switch to the tab immediately to the right (wraps around).
*   **Go to Preceeding Tab**: Switch to the tab immediately to the left (wraps around).
*   **Go to First Tab**: Jump to the first tab in the tab list.
*   **Go to Last Tab in List**: Jump to the last tab in the tab list.
*   **Focus the first tab**: `Alt+u` (suggested)
*   **Focus the second tab**: `Alt+i` (suggested)
*   **Focus the third tab**: `Alt+o` (suggested)
*   **Focus the fourth tab**: `Alt+p` (suggested)

### Tab Management Commands

*   **Move current tab to the front**: `Alt+g` (suggested)
*   **Reopen Last Closed Tab**: Restores the most recently closed tab or window.
*   **Close All Preceding Tabs**: Closes all tabs to the left of the current tab.
*   **Close All Following Tabs**: Closes all tabs to the right of the current tab.
*   **Close All Except Current**: Closes all other tabs in the window.

### Pin a Tab

To prevent a tab from being automatically reordered or closed by bulk actions, you can "pin" it. Pinned tabs will stay where they are. This is useful for tabs you always want to keep in a specific place, like your email or a music player.

To pin or unpin a tab, use the keyboard shortcut for the "toggle-pin" command. When a tab is pinned, you'll see a "📌" icon at the beginning of its title.

This works with Chrome's native pinning feature—if you pin a tab with your mouse, the extension will also treat it as pinned.

### Automatic Tab Closing

You can enable a feature to automatically close tabs that have not been used after a configurable amount of time. This feature is disabled by default and has several safeguards: it will not close pinned tabs, audible tabs, or tabs that appear to have unsaved changes.

*   **Close All Old Tabs**: You can also manually trigger this cleanup with a keyboard shortcut.

### Extension Options

You can configure the extension's behavior by right-clicking the extension icon and selecting "Options". Settings include:
*   Auto-reorder delay.
*   Tab cycle timeout.
*   Enable and configure automatic tab closing.
*   Choose whether bulk-closing commands should ignore pinned tabs (enabled by default).
