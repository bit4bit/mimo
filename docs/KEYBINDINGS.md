# Emacs Keybindings Reference

MIMO uses Emacs-style keybindings for navigation and operations.

## Global Keybindings

| Binding | Action | Description |
|---------|--------|-------------|
| `C-x p` | Switch Project | Open project switcher dialog |
| `C-x s` | Switch Session | Open session switcher dialog |
| `C-x C-f` | Find File | Open file search dialog |
| `C-x c` | Commit | Open commit dialog |
| `C-c C-c` | Cancel Request | Cancel current agent request |

## Buffer Focus

| Binding | Action | Description |
|---------|--------|-------------|
| `C-x h` | Focus Left | Focus the Files buffer |
| `C-x j` | Focus Center | Focus the Chat buffer |
| `C-x l` | Focus Right | Focus the Changes buffer |

## Navigation

| Binding | Action | Description |
|---------|--------|-------------|
| `Tab` | Next Element | Move to next interactive element |
| `Shift+Tab` | Previous Element | Move to previous interactive element |
| `Enter` | Select | Activate focused element |
| `Esc` | Cancel/Close | Close dialog or cancel operation |

## Chat Buffer

When the chat input is focused:

| Binding | Action | Description |
|---------|--------|-------------|
| `Enter` | Send Message | Submit chat message |
| `C-c` | Cancel Input | Clear current input |

## Customization

Keybindings can be customized in `~/.mimo/config.yaml`:

```yaml
keybindings:
  cancel_request: "C-c C-c"
  commit: "C-x c"
  find_file: "C-x C-f"
  switch_project: "C-x p"
  switch_session: "C-x s"
  focus_left: "C-x h"
  focus_center: "C-x j"
  focus_right: "C-x l"
```

### Keybinding Format

- `C-` = Ctrl
- `M-` = Alt/Meta
- `S-` = Shift

Examples:
- `"C-x c"` = Ctrl+X, then c
- `"C-c C-c"` = Ctrl+C, then Ctrl+C
- `"M-x"` = Alt+X
- `"C-x C-f"` = Ctrl+X, then Ctrl+F

## Status Line

The status line at the bottom of the screen shows available keybindings for the current context.

## Chords

Keybindings can be chorded (sequential key combinations):

- `C-x` prefix is used for most commands
- Press `C-x`, release, then press the second key
- If you wait too long, the prefix times out

## Canceling Operations

- `C-g` (not yet implemented) or `Esc` cancels current operation
- `C-c C-c` cancels active agent request
