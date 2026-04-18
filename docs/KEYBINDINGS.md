# Keyboard Interactions

MIMO session pages support browser-safe `Mod+Shift` shortcuts (`Mod = Cmd on macOS, Ctrl on Windows/Linux`) in addition to standard browser/form keyboard behavior.

## Navigation

| Key | Action | Description |
|-----|--------|-------------|
| `Tab` | Next Element | Move to the next interactive element |
| `Shift+Tab` | Previous Element | Move to the previous interactive element |
| `Enter` | Select/Submit | Activate a focused control or submit a focused form |
| `Esc` | Cancel/Close | Close dialogs or cancel browser-native interactions |

## Chat Input

| Key | Action | Description |
|-----|--------|-------------|
| `Enter` | Send Message | Submit the chat message |

## Session Shortcuts

| Key | Action | Description |
|-----|--------|-------------|
| `Mod+Shift+N` | New Thread | Open the create-thread dialog |
| `Mod+Shift+ArrowRight` | Next Thread | Activate the next chat thread |
| `Mod+Shift+ArrowLeft` | Previous Thread | Activate the previous chat thread |
| `Mod+Shift+M` | Commit | Open the commit dialog |
| `Mod+Shift+,` | Project Notes | Focus the Project Notes textarea |
| `Mod+Shift+.` | Session Notes | Focus the Session Notes textarea |
| `Mod+Shift+/` | Shortcuts Help | Toggle the shortcuts help overlay |

## YAML Configuration

You can customize session shortcuts in `~/.mimo/config.yaml`:

```yaml
sessionKeybindings:
  newThread: "Mod+Shift+N"
  nextThread: "Mod+Shift+ArrowRight"
  previousThread: "Mod+Shift+ArrowLeft"
  commit: "Mod+Shift+M"
  projectNotes: "Mod+Shift+,"
  sessionNotes: "Mod+Shift+."
  shortcutsHelp: "Mod+Shift+/"
  closeModal: "Escape"
```

## Notes

- Session shortcuts are active even while focus is inside text inputs and editable chat content.
- When the commit dialog is open, `closeModal` (default: `Escape`) closes it.
