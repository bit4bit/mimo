# mimo-platform

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.23. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the platform listens on |
| `PLATFORM_URL` | `http://localhost:PORT` | Public URL of the platform, used to tell agents where to connect for Fossil sync. **Must be set when mimo-agent runs on a different host than mimo-platform.** |

### Remote agent setup

By default `PLATFORM_URL` resolves to `http://localhost:<PORT>`, which works when the agent and platform run on the same machine. When they run on different hosts, set `PLATFORM_URL` to the address the agent can reach:

```bash
PLATFORM_URL=http://192.168.1.10:3000 bun run index.ts
```

The agent uses this URL to construct the Fossil server address for each session.

## Project Form Fields

### Local Development Mirror

An optional path that enables real-time sync of agent changes to a local directory.

**Field:** `defaultLocalDevMirrorPath`
- **Location:** Project creation and edit forms
- **Purpose:** Sets a default mirror path for all sessions in the project
- **Behavior:** Pre-fills the mirror path when creating new sessions
- **Format:** Absolute filesystem path (e.g., `/home/user/myproject-dev`)

**Related Session Field:** `localDevMirrorPath`
- Each session can override the project default
- Can be cleared to disable sync for a specific session
- Empty/null means no sync is performed

**Example use case:**
1. User creates a project with `defaultLocalDevMirrorPath: /home/user/dev/myproject`
2. When creating a session, the mirror path is pre-filled
3. User can modify or clear the path before creating the session
4. Agent syncs file changes to the configured path in real-time

## Session Form Fields

### Local Development Mirror (Session)

- **Field:** `localDevMirrorPath`
- **Pre-filled from:** Project's `defaultLocalDevMirrorPath`
- **Can be cleared:** Yes (disables sync for that session)
- **Persistence:** Stored in session.yaml
