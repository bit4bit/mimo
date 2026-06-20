# Configuration Options

MIMO Platform configuration reference.

## Configuration File

Configuration is stored in `~/.mimo/config.yaml` in YAML format.

## Example Configuration

```yaml
theme: dark
fontSize: 14
fontFamily: "monospace"
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

## Environment Variables

These environment variables control platform behavior.

### Internal vs external addressing

MIMO has two distinct network audiences, and they use different addresses:

- **Internal** — how a `mimo-agent` reaches the platform (WebSocket) and clones a
  session's repository over HTTP. These addresses must be reachable from wherever
  the agent runs (e.g. the Docker service name `platform`, or an internal IP).
- **External** — how a human user reaches the platform in a browser and copies the
  `git clone` command. Behind a custom domain this is typically a TLS reverse proxy.

Keeping these separate is what lets the clone command shown in the UI differ from
the address the agent uses internally.

### JWT_SECRET

- **Required**: Yes
- **Description**: Secret key for JWT token signing
- **Example**: `JWT_SECRET=your-secret-key-32-characters`

### PORT

- **Required**: No
- **Default**: `3000`
- **Description**: HTTP server port the platform listens on.

### PLATFORM_URL

- **Required**: No
- **Default**: `http://${MIMO_HOST}:${PORT}`
- **Description**: Public URL agents/users use to reach the platform (HTTP/WebSocket).
  Must be reachable by the agent. Used as the `platformUrl` sent in `session_ready`.

### MIMO_HOST

- **Required**: No
- **Default**: `localhost`
- **Description**: General hostname used to build default internal URLs.

### MIMO_LISTEN_HOST

- **Required**: No
- **Default**: `MIMO_HOST`
- **Description**: Network interface the platform binds to (e.g. `0.0.0.0` in a
  container). Independent of the advertised host.

### MIMO_INTERNAL_VCS_PORT

- **Required**: No
- **Default**: `8000`
- **Description**: Port of the VCS (git) HTTP server that serves session repositories.

### MIMO_INTERNAL_VCS_HOST

- **Required**: No
- **Default**: `MIMO_HOST`
- **Scope**: Internal
- **Description**: Hostname embedded in the clone URL sent to the **agent**
  (`http://${MIMO_INTERNAL_VCS_HOST}:${MIMO_INTERNAL_VCS_PORT}/<sid>.git/`).
  Set this to an address the agent can resolve (e.g. the Docker service name
  `platform`).

### MIMO_PUBLIC_VCS_URL

- **Required**: No
- **Default**: _(derived from the internal server host)_
- **Scope**: External
- **Description**: Public-facing base URL used to build the `git clone` command
  shown to **browser users**. Set this when the platform is deployed behind a custom
  domain / reverse proxy so the displayed URL uses the right scheme, host, and path
  instead of the raw internal VCS port. When unset, the UI falls back to the
  internal server URL with its hostname swapped to the platform's. This same public
  URL is also sent to agents as `publicCloneUrl` and used by agents started with
  `--external` (see below), so an agent running outside the deployment can clone.
- **Example**: `MIMO_PUBLIC_VCS_URL=https://yourdomain.com/git`
  → clone URL becomes `https://yourdomain.com/git/<sid>.git/`

### mimo-agent `--external`

The `mimo-agent` CLI flag `--external` tells the agent it runs **outside** the
platform's deployment (e.g. not in the container). It then clones session repos from
the public clone URL (`MIMO_PUBLIC_VCS_URL`) instead of the internal `cloneUrl`
(`MIMO_INTERNAL_VCS_HOST`), which is unreachable from outside. Omit the flag for
in-deployment agents.

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
    "fontSize": 16
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

### Large Text for Presentations

```yaml
fontSize: 20
fontFamily: "Fira Code, monospace"
```

## See Also

- [Keyboard Reference](KEYBINDINGS.md) - Standard keyboard interactions
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and solutions
