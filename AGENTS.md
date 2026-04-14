# AGENTS.md

## Development Philosophy

### Behavior-Driven Development (BDD)

**Write tests first — always. No implementation code exists before a failing test.**

Tests describe **behavior from the outside**, not internal implementation details.
Focus on what the system does, not how it does it.

#### Rules
- Write the integration test **before** any implementation
- Tests must be **high-coverage integration tests** — they cross real boundaries (API, DB, file system)
- Test must **fail first**, then implement the minimum code to make it pass
- **Test behaviors, never internals** — do not test variables, state, or implementation details; test what the system does, not how it does it
- No low-value or trivial tests — if it doesn't describe meaningful behavior, don't write it

#### What is a behavior test
- ✅ "when a user submits an invalid form, it returns a validation error"
- ✅ "when payment succeeds, the order status becomes confirmed"
- ❌ testing the value of a variable
- ❌ ❌ testing that a specific function or method was called
- ❌ ❌ testing internal state that is not observable from outside

#### Bug Fixing Workflow
1. **Write a failing test** that reproduces the bug exactly
2. **Confirm the test fails** — this proves the bug is real and the test is valid
3. **Fix the bug** with the minimum code change necessary
4. **Confirm the test passes** — this proves the fix works
5. Do not fix the bug before the test exists

---

### Simple Design (Kent Beck's 4 Rules)

In priority order:

1. **Tests pass** — the code does what it's supposed to do
2. **Reveals intention** — anyone can read it and understand what it does
3. **No duplication** — every piece of knowledge exists in one place (DRY)
4. **Fewest elements** — no unnecessary classes, functions, abstractions, or indirection

When in doubt, delete code, not add it. Prefer the simpler solution.

---

### Functional Thinking First

- **Prefer pure functions** — same input, same output, no side effects
- **Immutable data** — don't mutate, transform
- **Compose, don't inherit** — build behavior by combining small functions
- **Explicit over implicit** — data flows visibly through function arguments and return values
- **Side effects at the boundary** — isolate I/O, DB, and network calls to the edges of the system; keep the core pure

---

## Commits

**Before committing, always format the code:**

```bash
cd packages/mimo-platform && bun prettier . --write
```

Use the following message format **strictly**. Do not add any extra lines (e.g. no `Co-Authored-By`, no trailers, no blank lines beyond what is shown).

```
<type>(<scope>): <short description>

Agent: <agent or user name>
Task: <task name>
Description: <one sentence of what was done>
```

### Example

```
feat(parser): add discriminator support

Agent: opencode
Task: discriminator support
Description: Extended the parser to handle OpenAPI 3.1 discriminator mappings.
```

---

## Workflow: OpenSpec

This project uses OpenSpec for structured change management. Always follow this workflow:

### Starting a New Feature/Fix

1. **Explore mode** - Think through the problem, investigate, clarify requirements
   - `/opsx:explore <topic>` - Enter explore mode to think through requirements
   
2. **Create Change** - Create structured artifacts before implementing
   - `/opsx:new <change-name>` or `/opsx:ff <change-name>` - Create change with artifacts
   - Artifacts: proposal.md → design.md → specs/**/*.md → tasks.md

3. **Implement** - Execute tasks from the change
   - `/opsx:apply <change-name>` - Start implementing tasks
   - Mark tasks complete as you go: `- [ ]` → `- [x]`

4. **Verify** - Validate implementation against specs
   - `/opsx:verify <change-name>` - Check completeness, correctness, coherence

5. **Archive** - Complete the change
   - `/opsx:archive <change-name>` - Archive change, sync specs to main

---

## ACP Provider Architecture

### Provider Behavior

The mimo-agent supports multiple ACP (Agent Client Protocol) providers. Each provider has different session management characteristics:

#### opencode

| Feature | Support | Notes |
|---------|---------|-------|
| **newSession** | ✅ Supported | Creates fresh session with new ACP session ID |
| **loadSession** | ✅ Supported | Resumes existing session if `acpSessionId` provided |
| **unstable_closeSession** | ❌ Not supported | Returns "Method not found" error |
| **Session Lifecycle** | Stateless | Sessions managed in-process; old sessions garbage collected when abandoned |
| **Context Reset** | ✅ Via newSession | Creating new session abandons old one, creating fresh context |

**Key Behaviors:**
- Each `newSession` creates a new in-process session state
- Sessions are isolated but share the same opencode process
- Old sessions are automatically cleaned up when no longer referenced
- Session clearing: Simply call `newSession` - old session abandoned, new context created

#### claude-agent-acp

| Feature | Support | Notes |
|---------|---------|-------|
| **newSession** | ✅ Supported | Creates fresh Claude Agent SDK Query process |
| **loadSession** | ✅ Supported | Resumes with `acpSessionId`; replays history from disk |
| **unstable_closeSession** | ✅ Supported | Properly tears down Query process and releases resources |
| **Session Lifecycle** | Stateful | Each session has dedicated Query process with its own state |
| **Context Reset** | ✅ Via newSession | Each session = isolated Query process = fresh context |

**Key Behaviors:**
- Each `newSession` spawns a new `@anthropic-ai/claude-agent-sdk` Query process
- Sessions are completely isolated with independent state
- `unstable_closeSession` should be called to properly clean up resources:
  - Cancels active query
  - Disposes settings manager
  - Aborts controller
  - Removes from session map
- Session clearing: `newSession` creates fresh Query process; optionally call `unstable_closeSession` first to clean up

### Session Clearing Implementation

The "Clear Session" feature creates a new ACP session while preserving mimo session and chat history:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLEAR SESSION FLOW                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   UI ──clear_session──► Platform ──clear_session──► Agent            │
│                                                              │      │
│                                                              ▼      │
│   Agent calls: connection.newSession({ cwd, mcpServers })         │
│                                                              │      │
│                                                              ▼      │
│   Agent updates internal session with new acpSessionId            │
│                                                              │      │
│                                                              ▼      │
│   Agent sends acp_session_cleared ──► Platform                      │
│                                                              │      │
│                                                              ▼      │
│   Platform updates session.yaml with new acpSessionId             │
│   Platform appends system message to chat.jsonl                   │
│   Platform broadcasts session_cleared ──► UI                       │
│                                                                     │
│   UI displays: "Session cleared - context reset"                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Provider-Specific Notes:**
- **opencode**: Does not call `closeSession` (not supported). Creating new session abandons old one.
- **claude-agent-acp**: Could call `unstable_closeSession` first for proper cleanup, but `newSession` alone works.

---

## ACP Session Parking

The mimo-agent implements automatic resource management through "session parking" - an idle timeout mechanism that terminates ACP processes when inactive, freeing system resources while maintaining a seamless user experience.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ACP SESSION PARKING                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────┐                    ┌──────────────────────────────┐  │
│   │ mimo-platform│                    │        mimo-agent            │  │
│   │              │◄──── WebSocket ───►│                              │  │
│   │              │                    │  ┌──────────────────────────┐  │  │
│   │  Session     │                    │  │ SessionLifecycleManager│  │  │
│   │  Repository  │                    │  │                        │  │  │
│   │  - idleTimeoutMs                   │  │ ┌─────────┐            │  │  │
│   │  - acpStatus   │                    │  │ │ ACTIVE  │───idle────►│  │  │
│   │  - modelState  │                    │  │ │         │   timeout  │  │  │
│   │  - modeState   │                    │  │ └────┬────┘            │  │  │
│   │  - acpSessionId│                    │  │      │                  │  │  │
│   └──────────────┘                    │  │      ▼                  │  │  │
│                                         │  │ ┌─────────┐            │  │  │
│   ┌──────────────┐                    │  │ │ PARKED  │───prompt───►│  │  │
│   │   Chat UI    │◄── acp_status ───┤  │  │ │         │   arrives  │  │  │
│   │              │                    │  │ └────┬────┘            │  │  │
│   │  ● active    │                    │  │      │                  │  │  │
│   │  💤 parked    │                    │  │      ▼                  │  │  │
│   │  ⏳ waking    │                    │  │ ┌─────────┐            │  │  │
│   └──────────────┘                    │  │ │ WAKING  │───ready────►│  │  │
│                                         │  │ └─────────┘            │  │  │
│                                         │  └──────────────────────────┘  │  │
│                                         │                                 │  │
└─────────────────────────────────────────────────────────────────────────┘
```

### State Machine

| State | Description | Triggers |
|-------|-------------|----------|
| **ACTIVE** | ACP process running, normal operation | - Session created<br>- Wake-up complete |
| **PARKED** | ACP terminated, resources freed | - Idle timeout reached (default: 10 min) |
| **WAKING** | ACP respawning, queued prompts | - New prompt received while parked |

### Activity Tracking

The following events reset the idle timer:
- User messages from platform
- ACP thought events (start, chunk, end)
- ACP message chunks
- ACP usage updates

### Configuration

Per-session idle timeout is configurable via the platform API:

```
PATCH /sessions/:id/config
Content-Type: application/json

{
  "idleTimeoutMs": 120000  // 2 minutes (minimum: 10000, 0 to disable)
}
```

**Default:** 600000ms (10 minutes)

### Session Resumption

When a parked session receives a new prompt:

1. State transitions to WAKING
2. New ACP process spawned
3. `loadSession(acpSessionId)` called to resume context
4. Model/mode restored from cached values
5. Queued prompts processed
6. State transitions to ACTIVE

### Error Handling

If `loadSession()` fails (e.g., session expired on provider):
- Falls back to `newSession()`
- Model/mode still restored from cache
- User sees: "Session expired - starting fresh"
- Chat history preserved, only LLM context is fresh

### Auto-Commit on Thought End

- Platform triggers auto-sync when `thought_end` is received for a session
- Commit message format: `[SessionName] - X files changed (+Y/-Z lines)`
- If no changes are detected, commit is skipped
- Sync status is exposed via `GET /sessions/:sessionId/sync-status`
- Manual retry is available via `POST /sessions/:sessionId/sync`

### Code Duplication Detection

- The Impact Buffer displays a **Code Duplication** section powered by [jscpd](https://github.com/kucherenko/jscpd)
- Duplication is calculated on changed files only (workspace vs upstream delta)
- Metrics include: duplicated lines, percentage, cross-file clones, and intra-file clones
- Auto-commit integration enforces configurable thresholds:
  - **Warning threshold** (default 15%): appends `[duplication: X%]` to the commit message
  - **Block threshold** (default 30%): prevents the commit and notifies the user
  - Both thresholds are configurable via `AutoCommitService` dependencies (`duplicationWarningThreshold`, `duplicationBlockThreshold`)
- Key files:
  - `packages/mimo-platform/src/impact/jscpd-service.ts` — jscpd CLI wrapper
  - `packages/mimo-platform/src/impact/calculator.ts` — `calculateDuplication()` integrates jscpd into impact metrics
  - `packages/mimo-platform/src/components/ImpactBuffer.tsx` — renders duplication section
  - `packages/mimo-platform/src/auto-commit/service.ts` — enforces thresholds

### Implementation Notes

**mimo-platform responsibilities:**
- Store `idleTimeoutMs`, `acpStatus`, cached `modelState`/`modeState`/`acpSessionId`
- Broadcast `acp_status` messages to UI
- Handle config updates from API

**mimo-agent responsibilities:**
- Track activity and manage idle timers
- Execute parking (terminate ACP, stop file watcher)
- Handle resumption (spawn, loadSession, restore model/mode)
- Queue prompts during WAKE-UP

**UI responsibilities:**
- Display status indicator (active/parked/waking)
- Disable input during WAKING state
- Show notifications for session reset

### Performance Considerations

- First prompt after idle has ~1-2s latency (wake-up time)
- File watcher stopped during parking saves resources
- Queue allows multiple prompts during wake-up without loss
- Configurable timeout allows tuning for user workflows

---

## UI Page Requirements

Every new page MUST follow these standards:

**Component Structure:**
- MUST extend `Layout` component with appropriate `title` prop
- MUST render inside container with consistent max-width (800px for lists, 400px for forms)
- MUST use project standard CSS classes (`.btn`, `.btn-secondary`, `.form-group`, etc.)

**Form Requirements:**
- MUST use `method="post"` (lowercase)
- MUST provide Cancel button alongside Submit
- MUST display validation errors in `.error-message` div
- MUST include help text with `.form-help` class

**Page Standards:**
- List pages: max-width 800px, title bar with action button
- Form pages: max-width 400px, consistent field styling
- Detail pages: max-width 800px, clearly organized sections

### Key Spec Locations

- `openspec/specs/vcs-credentials/spec.md` - VCS credential requirements
- `openspec/specs/projects/spec.md` - Project requirements
- `openspec/specs/<capability>/spec.md` - Other capability specs

### Never Skip

- ✅ Write tests first (BDD)
- ✅ Create OpenSpec artifacts before implementing
- ✅ Use Layout component for all pages
- ✅ Follow UI standards from specs
- ✅ Verify before archiving

---

## Test Suite Health

### Before Any Change

**Always verify the test suite is passing before starting work:**

```bash
# Run all tests in both packages
cd packages/mimo-platform && bun test
cd packages/mimo-agent && bun test
```

- If tests are failing, **fix them first** or document known failures
- Do not build on a broken foundation

### After Committing Changes

**Always verify the test suite passes after committing:**

```bash
# Run all tests to ensure no regressions
cd packages/mimo-platform && bun test
cd packages/mimo-agent && bun test
```

- All tests must pass before considering the change complete
- If tests fail after your changes, **fix them before pushing**

### Test Philosophy

- Tests are the safety net — they must be green to work effectively
- A failing test suite is a blocker, not a suggestion
- Keep tests fast, reliable, and meaningful
- When tests fail, investigate immediately — don't accumulate broken tests
- Do not HTML/Component content, test should verify HTTP endpoints instead.