# Configuration Options

MIMO Platform configuration reference.

## Configuration File

Configuration is stored in `~/.mimo/config.yaml` in YAML format.

## Example Configuration

```yaml
theme: dark
fontSize: 14
fontFamily: "monospace"
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

## Options Reference

### appearance

#### theme

- **Type**: `"dark" | "light"`
- **Default**: `"dark"`
- **Description**: UI color theme

#### fontSize

- **Type**: `number`
- **Default**: `14`
- **Range**: `8` to `32`
- **Description**: Editor font size in pixels

#### fontFamily

- **Type**: `string`
- **Default**: `"monospace"`
- **Description**: CSS font family for editor

### keybindings

All keybinding options use the same format:

**Format Rules**:
- Prefixes: `C-` (Ctrl), `M-` (Alt/Meta), `S-` (Shift)
- Chords: Separate with space (e.g., `"C-x c"`)
- Special keys: `escape`, `tab`, `space`, `enter`, `backspace`, `delete`, `home`, `end`, `pageup`, `pagedown`, `up`, `down`, `left`, `right`
- Function keys: `F1` through `F12`

#### cancel_request

- **Type**: `string`
- **Default**: `"C-c C-c"`
- **Description**: Cancel current agent request

#### commit

- **Type**: `string`
- **Default**: `"C-x c"`
- **Description**: Open commit dialog

#### find_file

- **Type**: `string`
- **Default**: `"C-x C-f"`
- **Description**: Open file finder

#### switch_project

- **Type**: `string`
- **Default**: `"C-x p"`
- **Description**: Open project switcher

#### switch_session

- **Type**: `string`
- **Default**: `"C-x s"`
- **Description**: Open session switcher

#### focus_left

- **Type**: `string`
- **Default**: `"C-x h"`
- **Description**: Focus left buffer (Files)

#### focus_center

- **Type**: `string`
- **Default**: `"C-x j"`
- **Description**: Focus center buffer (Chat)

#### focus_right

- **Type**: `string`
- **Default**: `"C-x l"`
- **Description**: Focus right buffer (Changes)

## Environment Variables

These environment variables control platform behavior:

### JWT_SECRET

- **Required**: Yes
- **Description**: Secret key for JWT token signing
- **Example**: `JWT_SECRET=your-secret-key-32-characters`

### PORT

- **Required**: No
- **Default**: `3000`
- **Description**: HTTP server port

### PLATFORM_URL

- **Required**: No
- **Default**: `ws://localhost:3000`
- **Description**: Base URL for WebSocket connections

### MIMO_AGENT_PATH

- **Required**: No
- **Default**: `mimo-agent` (searches PATH)
- **Description**: Path to mimo-agent binary

### NODE_ENV

- **Required**: No
- **Default**: `development`
- **Values**: `development`, `production`, `test`
- **Description**: Runtime environment mode

### DEBUG

- **Required**: No
- **Description**: Enable debug logging when set to any value

## Filesystem Paths

Default data directory: `~/.mimo/`

### Structure

```
~/.mimo/
├── config.yaml              # This configuration file
├── users/
│   └── {username}/
│       └── credentials.yaml # User auth data
├── projects/
│   └── {uuid}/
│       ├── project.yaml     # Project metadata
│       ├── repo.fossil     # Fossil repository
│       ├── original/        # Original repo checkout
│       └── sessions/
│           └── {uuid}/
│               ├── session.yaml
│               └── chat.jsonl
└── agents/
    └── {uuid}/
        └── agent.yaml
```

## Validation

The configuration is validated on load:

- Invalid themes fall back to "dark"
- Font sizes outside 8-32 fall back to 14
- Invalid keybinding formats are rejected
- Duplicate keybindings are detected and reported

## Editing Configuration

### Via Web UI

1. Navigate to `/config` or click "Settings" in any session
2. Modify values in the form
3. Click "Save Configuration"
4. Changes take effect immediately

### Via File

1. Edit `~/.mimo/config.yaml` with any text editor
2. Save the file
3. Reload the page for changes to take effect

### Via API

```bash
# Get current config
curl http://localhost:3000/config/api \
  -H "Cookie: token=YOUR_JWT"

# Update config
curl -X POST http://localhost:3000/config/api \
  -H "Cookie: token=YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "theme": "light",
    "fontSize": 16,
    "keybindings": {
      "commit": "C-c C-c"
    }
  }'
```

## Reset to Defaults

### Via Web UI

Click "Reset to Defaults" button on the configuration page.

### Via API

```bash
curl -X POST http://localhost:3000/config/reset \
  -H "Cookie: token=YOUR_JWT"
```

### Manual

```bash
rm ~/.mimo/config.yaml
# Platform will recreate with defaults on next load
```

## Customization Examples

### High Contrast Theme

```yaml
theme: light
fontSize: 16
fontFamily: "Consolas, monospace"
```

### Vim-style Keybindings

```yaml
keybindings:
  cancel_request: "C-c"
  commit: ":w"
  find_file: ":e"
  switch_project: ":bp"
  switch_session: ":bn"
  focus_left: "C-w h"
  focus_center: "C-w j"
  focus_right: "C-w l"
```

### Large Text for Presentations

```yaml
fontSize: 20
fontFamily: "Fira Code, monospace"
```

## See Also

- [Keybindings Reference](KEYBINDINGS.md) - Complete keybinding documentation
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and solutions
