# Tbbr

Tbbr is a Chrome extension I made for sane tab management. Best used in conjunction with [Vimium C](https://github.com/gdh1995/vimium-c).

I hacked this together and don't recommend you using this.

## Installation

### Linux/macOS

First, download the files.
```sh
npx degit doeixd/Tbbr ~/.local/share/Tbbr
```

### Windows

First, download the files. You can use this command in your terminal:
```powershell
npx degit doeixd/Tbbr "$env:LOCALAPPDATA\Tbbr"
```
This will download the extension to a folder named `Tbbr` inside your local AppData directory.

### Loading the extension

Then go to <chrome://extensions>, and turn on developer mode.

After that, click *Load unpacked* and navigate to/select the directory where you downloaded the files (e.g., `cd ~/.local/share/Tbbr` on Linux or cd "$env:LOCALAPPDATA\Tbbr"` on Windows).

Finally, and this is the important part, navigate to <chrome://extensions/shortcuts>. You'll need to set your own keyboard shortcuts for the extension's commands to make them do anything.

## Usage

Tbbr does a few things.

### Automatic Tab Reordering

By default, after you land on a tab and wait 5 seconds (configurable in settings), it gets moved to the first position. This helps keep your current context from getting buried.

This delay is configurable. You can change it by right-clicking the extension icon and selecting "Options", or by navigating to the extension's details page and clicking "Extension options".

### Pick Mode (Tab Switching & Closing)

There's a tab selection mode that lets you switch to, or close, any open tab with a couple of keystrokes.
1.  Activate it with the keyboard shortcut you defined for the "pick" command.
2.  The title of each tab will get a letter prepended to it. Like `s: Google Search - Results ...`
3.  To switch to a tab, press the letter corresponding to that tab. So in that ^ example it'd be `s`
4.  To **close** a tab, press **Shift + letter** for that tab.

You can cancel out of Pick Mode by hitting `Escape`.

Finally, you can set direct shortcuts to focus your first four tabs. The suggested keybindings are vim-style:

*   **Focus the first tab**&nbsp;:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`Alt+J`
*   **Focus the second tab**: `Alt+K`
*   **Focus the third tab** :&nbsp;&nbsp;&nbsp;&nbsp;`Alt+L`
*   **Focus the fourth tab**:&nbsp;&nbsp;`Alt+;`

You have to set these yourself at <chrome://extensions/shortcuts>.

### Move Tab to First Position

You can move the current tab to the first position using a keyboard shortcut.

*   **Move current tab to the front**: `Alt+G` (default)

### Pin a Tab

To prevent a tab from being automatically reordered, you can "pin" it. Pinned tabs will stay where they are. This is useful for tabs you always want to keep in a specific place, like your email or a music player.

To pin or unpin a tab, you first need to set a keyboard shortcut for the "toggle-pin" command at <chrome://extensions/shortcuts>. Once you've set a shortcut, you can use it to toggle the pinned state of the current tab.

When a tab is pinned, you'll see a "📌" icon at the beginning of its title.

### Automatic Tab Closing

You can enable a feature to automatically close tabs that have not been opened after a configurable amount of time. This feature is disabled by default.

To enable it, go to the extension's options page. You can set the time in hours (default is 1 hour).

### Close All Old Tabs

You can manually trigger the closing of old tabs by using a keyboard shortcut. You'll need to set a shortcut for the "close-all-old-tabs" command at <chrome://extensions/shortcuts>. This will close all tabs that haven't been opened after the configurable time.
