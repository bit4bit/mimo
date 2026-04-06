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
