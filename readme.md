# Tbbr

Tbbr is a Chrome extension I made for sane tab management. Best used in conjunction with [Vimium C](https://github.com/gdh1995/vimium-c).

I hacked this together and don't recommend you using this.

## Installation

First, download the files.
```sh
npx degit doeixd/Tbbr ~/.local/share/Tbbr
```

Then go to [chrome://extensions](chrome://extensions), and turn on developer mode.

After that, click *Load unpacked* and navigate to/select the `~/.local/share/Tbbr` directory.

Finally, and this is the important part, navigate to [chrome://extensions/shortcuts](chrome://extensions/shortcuts). You'll need to set your own keyboard shortcuts for the extension's commands to make them do anything.

## Usage

Tbbr does a few things.

First, it will automatically order your tabs according to when they were last active. After you land on a tab and wait 5 seconds, it gets moved to the first position. This helps keep your current context from getting buried.

Second, there's a tab selection mode that lets you switch to any open tab with a couple of keystrokes.
1.  Activate it with the keyboard shortcut you defined.
2.  The title of each tab will get a letter prepended to it.
3.  Press the letter corresponding to the tab you want to go to.
You can cancel out by hitting `Escape`.

Finally, you can set direct shortcuts to focus your first four tabs. The suggested keybindings are vim-style:

*   **Focus the first tab**: `Alt+J`
*   **Focus the second tab**: `Alt+K`
*   **Focus the third tab**: `Alt+L`
*   **Focus the fourth tab**: `Alt+;`

You have to set these yourself at [chrome://extensions/shortcuts](chrome://extensions/shortcuts).
