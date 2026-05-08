# Keyboard Interactions

MIMO session pages support browser-safe `Mod+Shift` shortcuts (`Mod = Cmd on macOS, Ctrl on Windows/Linux`) in addition to standard browser/form keyboard behavior.

## Navigation

| Key         | Action           | Description                                         |
| ----------- | ---------------- | --------------------------------------------------- |
| `Tab`       | Next Element     | Move to the next interactive element                |
| `Shift+Tab` | Previous Element | Move to the previous interactive element            |
| `Enter`     | Select/Submit    | Activate a focused control or submit a focused form |
| `Esc`       | Cancel/Close     | Close dialogs or cancel browser-native interactions |

## Chat Input

| Key     | Action       | Description             |
| ------- | ------------ | ----------------------- |
| `Enter` | Send Message | Submit the chat message |

## Create Thread Dialog

| Key           | Action        | Description                                                            |
| ------------- | ------------- | ---------------------------------------------------------------------- |
| `Enter`       | Verify/Create | Submit the create-thread form when the focused control supports submit |
| `Ctrl+Enter`  | Verify/Create | Submit the create-thread form from any field                           |
| `Alt+Shift+G` | Cancel        | Close the create-thread dialog without creating                        |

## Session Shortcuts

### Notation

Shortcuts use **Emacs-style notation** in the UI:

| Symbol | Meaning               | macOS   | Linux/Windows |
| ------ | --------------------- | ------- | ------------- |
| `C`    | Mod (Command/Control) | `Cmd`   | `Ctrl`        |
| `M`    | Meta (Alt/Option)     | `Alt`   | `Alt`         |
| `S`    | Shift                 | `Shift` | `Shift`       |

So `C-M-<right>` means **Mod+Alt+Right Arrow**.

### Actions

| Key                    | Action             | Description                                |
| ---------------------- | ------------------ | ------------------------------------------ |
| `Mod+Shift+N`          | New Thread         | Open the create-thread dialog              |
| `Mod+Shift+ArrowRight` | Next Thread        | Activate the next chat thread              |
| `Mod+Shift+ArrowLeft`  | Previous Thread    | Activate the previous chat thread          |
| `Mod+Shift+M`          | Commit             | Open the commit dialog                     |
| `Mod+Shift+,`          | Project Notes      | Focus the Project Notes textarea           |
| `Mod+Shift+.`          | Session Notes      | Focus the Session Notes textarea           |
| `Mod+Shift+/`          | Shortcuts Help     | Toggle the shortcuts help overlay          |
| `Mod+Shift+F`          | Open File          | Open the file finder                       |
| `Alt+Shift+C`          | Find Content       | Open content search dialog                 |
| `Mod+Alt+ArrowRight`   | Next File          | Switch to next open file (Edit Buffer)     |
| `Mod+Alt+ArrowLeft`    | Previous File      | Switch to previous open file (Edit Buffer) |
| `Alt+Shift+W`          | Close File         | Close the active file (Edit Buffer)        |
| `Alt+Shift+PageDown`   | Next Buffer        | Switch to next left-frame buffer           |
| `Alt+Shift+PageUp`     | Previous Buffer    | Switch to previous left-frame buffer       |
| `Alt+Shift+Control+F`  | Toggle Right Frame | Collapse or restore the right frame        |

## YAML Configuration

You can customize session shortcuts in `~/.mimo/config.yaml`:

```yaml
sessionKeybindings:
  newThread: "Mod+Shift+N"
  nextThread: "Mod+Shift+ArrowRight"
  previousThread: "Mod+Shift+ArrowLeft"
  commit: "Mod+Shift+M"
  projectNotes: "Mod+Shift,"
  sessionNotes: "Mod+Shift."
  shortcutsHelp: "Mod+Shift+/"
  closeModal: "Escape"
  openFileFinder: "Mod+Shift+F"
  openContentFinder: "Alt+Shift+C"
  nextFile: "Mod+Alt+ArrowRight"
  previousFile: "Mod+Alt+ArrowLeft"
  closeFile: "Alt+Shift+W"
  reloadFile: "Alt+Shift+R"
  nextLeftBuffer: "Alt+Shift+PageDown"
  previousLeftBuffer: "Alt+Shift+PageUp"
  toggleRightFrame: "Alt+Shift+Control+F"
  toggleExpertMode: "Alt+Shift+E"
  expertInput: "Enter"
  moveFocusUp: "Alt+ArrowUp"
  moveFocusDown: "Alt+ArrowDown"
  centerFocus: "Alt+Enter"
  increaseFocus: "Alt+Shift+ArrowRight"
  decreaseFocus: "Alt+Shift+ArrowLeft"
```

## Patch Buffer

| Key           | Action        | Description                           |
| ------------- | ------------- | ------------------------------------- |
| `Ctrl+Enter`  | Approve Patch | Approve the active patch (applies it) |
| `Alt+Shift+G` | Decline Patch | Decline and discard the active patch  |

## Notes

- Session shortcuts are active even while focus is inside text inputs and editable chat content.
- When the commit dialog is open, `closeModal` (default: `Escape`) closes it.
