## Context

The EditBuffer displays files read-only with a tab system, file context bar, and syntax-highlighted content. The chat thread system allows users to send instructions to an LLM agent via ACP.

Expert mode bridges these: it lets the user issue edit/refactor instructions from within the EditBuffer, using an active chat thread as the LLM conduit. When the LLM responds, the proposed change is written to a `.mimo-patches/` folder in the workspace and handed to the **PatchBuffer** — a new dedicated buffer for reviewing, approving, and declining proposed file patches.

Key files:
- `packages/mimo-platform/src/buffers/EditBuffer.tsx` — server-rendered HTML shell
- `packages/mimo-platform/src/buffers/PatchBuffer.tsx` — new buffer component (server-rendered HTML shell)
- `packages/mimo-platform/public/js/edit-buffer.js` — client-side state, file finder, rendering
- `packages/mimo-platform/public/js/patch-buffer.js` — new client JS: patch tab state, diff rendering, approve/decline
- `packages/mimo-platform/src/files/expert-service.ts` — file operations for expert mode and patching
- `packages/mimo-platform/src/sessions/routes.tsx` — session API routes
- `packages/mimo-platform/src/index.tsx` — WebSocket hub, chat message routing
- `packages/mimo-platform/public/js/chat.js` — chat state, WebSocket messaging
- `packages/mimo-platform/public/js/session-keybindings.js` — keyboard shortcut handlers

## Goals / Non-Goals

**Goals:**
- Allow users to instruct the LLM to edit the file currently open in EditBuffer
- Use the selected chat thread's ACP session for LLM communication
- Provide a visual focus guide showing the user's area of interest
- Write proposed changes to a `.mimo-patches/` folder — original file is untouched until approved
- Surface proposed changes in PatchBuffer as a vertical side-by-side diff
- Require explicit Approve or Decline before the original file is modified
- Minimal changes to the agent — it receives a normal user_message

**Non-Goals:**
- Multi-file editing in a single expert-mode session
- Partial-apply or merge of LLM changes (approve-all or decline-all only)
- Conflict resolution UI for concurrent external edits (warn only)
- Replacing the chat thread's editable bubble

## Component Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                      EditBuffer (Expert Mode ON)                  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                      File Tabs Bar                          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐  ┌─────────────┐  │  │
│  │  │ file1.ts │ │ file2.ts │ │ file3.ts │  │ Expert Mode │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘  └─────────────┘  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                     File Context Bar                        │  │
│  │  File: src/utils/helpers.ts   Lines: 42   [Expert Mode ✓]  │  │
│  │  Thread: [▼ my-thread]                                      │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  1  │ import { FC } from "hono/jsx";                        │  │
│  │  2  │                                         ┌──────────┐  │  │
│  │  3  │ export const helper = () => {           │ FOCUS    │  │  │
│  │  4  │   return "highlighted";                 │ GUIDE    │  │  │
│  │  5  │ };                                      │ OVERLAY  │  │  │
│  │  6  │                                         └──────────┘  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  ✎ Expert Edit                                ⌃↵ Send      │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │ Refactor the helper function to be async            │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                          PatchBuffer                              │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                      Patch Tabs Bar                         │  │
│  │  ┌────────────────────┐ ┌────────────────────┐             │  │
│  │  │ helpers.ts      ✕  │ │ service.ts      ✕  │             │  │
│  │  └────────────────────┘ └────────────────────┘             │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                      Context Bar                            │  │
│  │  File: src/utils/helpers.ts      [✓ Approve]  [✕ Decline]  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────┬─────────────────────────────────┐  │
│  │  ORIGINAL                 │  PATCHED                        │  │
│  │  1 │ const helper = () { │ 1 │ const helper = () {         │  │
│  │  2 │   return "hi";      │ 2 │   return "hi";              │  │
│  │  3─│   // old code       │ 3+│   // new async code         │  │
│  │  4 │ }                   │ 4 │ }                           │  │
│  └───────────────────────────┴─────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

### EditBuffer UI States

**State 1: Expert Mode OFF**
- Toggle button in context bar shows "Expert Mode", inactive style
- No focus guide, no instruction input

**State 2: Expert Mode ON — Idle**
- Toggle button shows "Expert Mode" active style
- Thread selector dropdown visible in context bar
- Focus guide overlay visible (7 lines centered on scroll position)
- Instruction input hidden until user presses `Enter`

**State 3: Expert Mode ON — Processing**
- Instruction input becomes read-only, shows "Processing..."
- Cancel button appears
- Focus guide stays visible

**State 4: Expert Mode ON — Done (returns to Idle)**
- After patch is dispatched to PatchBuffer, returns immediately to Idle
- Brief "Patch sent to PatchBuffer" toast

### PatchBuffer UI States

**State 1: Empty**
- Placeholder: "No pending patches"

**State 2: Patch Tab Active**
- Tabs bar shows one tab per pending patch
- Context bar shows file path + Approve / Decline buttons
- Vertical split diff: left = original, right = patched
- Changed lines highlighted inline in both panes

**State 3: Approved / Declined**
- Tab closes after action
- Brief toast "Approved" or "Declined"
- If no more tabs, returns to Empty state

## Decisions

### D1: Focus Guide — Visual Overlay, Not LLM Constraint

**Decision**: The focus guide is a visual highlight in the EditBuffer only. It informs the LLM prompt but does not restrict line editing.

```typescript
interface FocusGuide {
  startLine: number;
  endLine: number;
  centerLine: number;
}

const computeFocusGuide = (
  firstVisibleLine: number,
  lastVisibleLine: number,
  guideSize: number = 7,
): FocusGuide => {
  const centerLine = Math.floor((firstVisibleLine + lastVisibleLine) / 2);
  const half = Math.floor(guideSize / 2);
  const startLine = Math.max(1, centerLine - half);
  const endLine = startLine + guideSize - 1;
  return { startLine, endLine, centerLine };
};
```

**Rationale**: Line-based restriction would prevent necessary edits outside the focus range (e.g., adding imports). The focus guide gives the LLM context without artificial constraints.

### D2: Instruction Context — Structured Prompt Returning a JSON Replacement Fragment

**Decision**: The expert-mode instruction is sent as a regular `user_message` through the chat thread. The prompt supplies the full file content and instructs the LLM to return a minimal JSON replacement fragment:

```
You are a constrained single-file editing assistant.

You will receive a target file, the full file content, a focus line range, and a user request.

Your job is to return the smallest safe contiguous code fragment that should be replaced in order to implement the request.

Rules:
- Edit only the target file.
- Use the focus line range as the initial anchor for analysis.
- Read outside the focus range only as needed for local context in the same file.
- Do not rewrite the full file.
- Do not perform unrelated refactors or formatting-only changes.
- Prefer replacing complete logical units rather than partial statements.
- The replacement must be syntactically valid in context.
- Return valid JSON only, with no explanation and no markdown.

Output schema:
{
  "file": "<FILE_PATH>",
  "replace_start_line": <number>,
  "replace_end_line": <number>,
  "replacement": "<string>"
}

If the task cannot be completed within this file alone, return:
{
  "file": "<FILE_PATH>",
  "error": "OUT_OF_SCOPE_CHANGE_REQUIRED"
}

Input:
Target file: <FILE_PATH>
Focus lines: <START_LINE>-<END_LINE>
Request: <USER_INSTRUCTION>
File content:
<FILE_CONTENT>
```

Key points:
- `FILE_CONTENT` is the **unescaped** raw file content.
- The client applies the replacement in memory, then writes the patched result to `.mimo-patches/`.

### D3: Patch Folder — `.mimo-patches/` in Workspace Root

**Decision**: Proposed changes are written to `.mimo-patches/<original-relative-path>` in the workspace root. The directory mirrors the workspace structure.

```
workspace/
  src/utils/helpers.ts            ← original (untouched)
  .mimo-patches/
    src/utils/helpers.ts          ← patched copy (pending review)
```

**Rationale**: Persisting patch files to disk means patches survive page reloads. The mirrored structure makes it trivial to associate a patch with its original. One patch file per original path enforces a single pending patch per file. The `.mimo-patches/` prefix is distinctive and easy to filter everywhere.

### D4: PatchBuffer — Vertical Split Diff (Left = Original, Right = Patched)

**Decision**: PatchBuffer renders a vertical split with the original file on the left and the patched file on the right. Both panes are line-numbered and scroll independently. Changed lines are highlighted inline:
- Lines removed from original: red background, red left border (left pane only)
- Lines added in patched: green background, green left border (right pane only)
- Unchanged lines: normal styling in both panes

```
┌──────────────────────────┬───────────────────────────┐
│  ORIGINAL                │  PATCHED                  │
│  1 │ const x = 1;        │  1 │ const x = 1;         │
│  2─│ const y = "old";    │  2+│ const y = "new";     │
│  3 │ export { x, y };    │  3 │ export { x, y };     │
└──────────────────────────┴───────────────────────────┘
```

**Rationale**: Left-right (vertical split) is the standard code review layout — familiar to users of GitHub/GitLab diff views and tools like VSCode's diff editor. It allows scanning both versions simultaneously without scrolling back and forth between stacked panes.

### D5: ExpertMode State Machine (Simplified)

**Decision**: Expert mode no longer has a `diff_preview` state. Review moves entirely to PatchBuffer.

```
OFF → IDLE → PROCESSING → IDLE
               ↓
            (cancel → IDLE)
```

```typescript
type ExpertModeState = "off" | "idle" | "processing";

interface ExpertMode {
  enabled: boolean;
  state: ExpertModeState;
  inputVisible: boolean;
  focusRange: string | null;
  originalPath: string | null;
  originalContent: string | null;  // cleared after patch is dispatched
  instruction: string | null;
}
```

**Rationale**: Decoupling the review step from EditBuffer simplifies ExpertMode's state machine and makes PatchBuffer reusable for any future source of patches (not just expert mode).

### D6: Thread Selection — Dropdown in Context Bar

**Decision**: Expert mode shows a thread selector dropdown in the EditBuffer context bar, next to the "Expert Mode" toggle. The dropdown is populated from `window.MIMO_CHAT_THREADS.threads`. If no thread exists, the input shows "Create a chat thread first."

### D7: Patch Folder Filtering

**Decision**: Add `.mimo-patches/` to the default ignore patterns in `applyIgnorePatterns()` and to the file watcher exclusion list.

**Rationale**: Patch files must not appear in the file finder, impact buffer, or trigger `file_outdated` events on the original file's behalf.

### D8: Approve is Server-Side Atomic

**Decision**: Approve calls `POST /sessions/:id/patches/approve` with `{ originalPath, patchPath }`. The server reads the patch file, writes it to the original path, and deletes the patch file in a single handler.

**Rationale**: Doing the read-write-delete server-side prevents partial state if the client disconnects mid-approval.

## Data Flow

### Enabling Expert Mode

1. User clicks "Expert Mode" button (or presses Alt+Shift+E)
2. `edit-buffer.js` sets `expertMode.enabled = true`, `expertMode.state = "idle"`
3. Focus guide renders from current viewport center
4. Thread selector dropdown appears in context bar
5. `expertMode.enabled` persisted to localStorage

### Sending an Expert Instruction

1. User presses `Enter` to show instruction input, types instruction, presses Ctrl+Enter
2. `edit-buffer.js` checks `window.MIMO_CHAT_THREADS.getActiveThreadId()` — error if none
3. `edit-buffer.js` calls `GET /sessions/:sessionId/files/content?path=<filePath>`
4. Client unescapes the HTML-escaped content → `expertMode.originalContent`
5. Constructs constrained editing prompt (file path, focus range, unescaped content, instruction)
6. Sends `expert_instruction` WebSocket message to register pending state
7. Sends `send_message` WebSocket message with the full prompt to the chat thread
8. `expertMode.state` transitions to `"processing"`, input hides

### LLM Processing and Response

1. Agent receives the constrained editing prompt
2. Agent returns a JSON replacement fragment (or `OUT_OF_SCOPE_CHANGE_REQUIRED`)
3. Chat thread displays the JSON response inline
4. Server sends `expert_diff_ready` WebSocket message to client

### Writing the Patch File

1. Client receives `expert_diff_ready`
2. Client fetches the LLM response from streaming content or chat history
3. `extractReplacement()` parses the JSON fragment
4. `applyReplacement()` applies the replacement to `expertMode.originalContent` → `patchedContent`
5. Client calls `POST /sessions/:sessionId/patches` with `{ originalPath, content: patchedContent }`
6. Server writes `patchedContent` to `.mimo-patches/<originalPath>`, returns `{ patchPath }`
7. Client calls `window.MIMO_PATCH_BUFFER.addPatch({ sessionId, originalPath, patchPath })`
8. `expertMode.originalContent` is cleared; `expertMode.state` transitions to `"idle"`
9. Brief "Patch sent to PatchBuffer" toast in EditBuffer

### PatchBuffer: Loading a Patch Tab

1. `addPatch({ sessionId, originalPath, patchPath })` is called
2. PatchBuffer adds a new tab for `originalPath`
3. Fetches original content: `GET /sessions/:sessionId/files/content?path=<originalPath>`
4. Fetches patched content: `GET /sessions/:sessionId/files/content?path=<patchPath>`
5. Calls `window.MIMO_DIFF.computeDiff(unescaped original, unescaped patched)`
6. Renders vertical split diff

### Approve

1. User clicks "✓ Approve" (or Ctrl+Enter when PatchBuffer is focused)
2. `patch-buffer.js` calls `POST /sessions/:sessionId/patches/approve` with `{ originalPath, patchPath }`
3. Server: reads `.mimo-patches/<originalPath>`, writes content to `<originalPath>`, deletes patch file
4. Tab closes; EditBuffer's file watcher detects change and refreshes if the file is open
5. Toast: "Approved"

### Decline

1. User clicks "✕ Decline" (or Alt+Shift+G when PatchBuffer is focused)
2. `patch-buffer.js` calls `DELETE /sessions/:sessionId/patches` with `{ patchPath }`
3. Server deletes `.mimo-patches/<originalPath>`
4. Tab closes; original file unchanged
5. Toast: "Declined"

### Cancelling During Processing

1. User clicks Cancel
2. `edit-buffer.js` sends `cancel_request` via WebSocket
3. `expertMode.originalContent` cleared; `expertMode.state` → `"idle"`
4. No patch file was written — nothing to clean up

### Race Condition: Original File Modified Externally

1. File watcher detects original file changed while a patch tab is open in PatchBuffer
2. PatchBuffer shows warning banner: "The original file has been modified externally. The diff may be stale."
3. User decides whether to Approve (overwrites external change) or Decline

### Recovery on Page Reload

1. On EditBuffer initialization, call `GET /sessions/:sessionId/patches` to list pending patch files
2. For each, call `window.MIMO_PATCH_BUFFER.addPatch()` to restore the tab

## Key Components

### PatchBuffer.tsx (Server-Side HTML Shell)

New buffer component:
- Patch tabs bar (id="patch-buffer-tabs")
- Context bar with file path (id="patch-file-path"), Approve button (id="patch-approve-btn"), Decline button (id="patch-decline-btn")
- Split container: left pane (id="patch-original-pane"), right pane (id="patch-patched-pane") with equal width, independent scroll
- Empty state placeholder (id="patch-empty-state")

### patch-buffer.js (Client-Side State)

```typescript
interface PatchTab {
  sessionId: string;
  originalPath: string;
  patchPath: string;
  originalContent: string | null;
  patchedContent: string | null;
}

interface PatchBufferState {
  tabs: PatchTab[];
  activeIndex: number;
}
```

Functions:
- `addPatch({ sessionId, originalPath, patchPath })` — adds tab, loads content, renders diff
- `approve()` — POST patches/approve, close tab
- `decline()` — DELETE patches, close tab
- `renderDiff(originalContent, patchedContent)` — compute + render vertical split
- `renderTabs()` — render tab bar
- `updateContextBar()` — update file path and button state

### ExpertService (expert-service.ts)

New functions:
- `writePatchFile(workspacePath, originalPath, content)` — writes to `.mimo-patches/<originalPath>`, creates parent dirs
- `approvePatch(workspacePath, originalPath)` — reads `.mimo-patches/<originalPath>`, writes to `<originalPath>`, deletes patch
- `declinePatch(workspacePath, patchPath)` — deletes patch file; `patchPath` must start with `.mimo-patches/`
- `listPatchFiles(workspacePath)` — returns all files under `.mimo-patches/` with their `originalPath` mapping

### API Endpoints

```typescript
// GET /sessions/:id/patches
// Response: { patches: Array<{ originalPath: string, patchPath: string }> }
// Lists all pending patch files in .mimo-patches/

// POST /sessions/:id/patches
// Body: { originalPath: string, content: string }
// Response: { patchPath: string }
// Writes content to .mimo-patches/<originalPath>

// POST /sessions/:id/patches/approve
// Body: { originalPath: string, patchPath: string }
// Response: { success: boolean }
// Copies patch → original, deletes patch file

// DELETE /sessions/:id/patches
// Body: { patchPath: string }
// Response: { success: boolean }
// Deletes patch file; patchPath must start with .mimo-patches/
```

### Diff Computation (Client-Side, shared)

`window.MIMO_DIFF.computeDiff(original, modified)` — used by both EditBuffer (if needed) and PatchBuffer. Returns `DiffResult` with `original` and `modified` panes, each containing `DiffLine[]` with `{ type, content, lineNumber }`.

## Risks / Trade-offs

- **Patch file persistence**: Unlike in-memory content, patch files survive crashes and reloads. The page-load recovery scan handles this. Orphaned patches (e.g., original deleted) are harmless but should be cleaned up via Decline.
- **LLM compliance**: The prompt asks for a minimal JSON fragment but the LLM may produce large replacements. The PatchBuffer diff reveals all changes before approval.
- **LLM non-JSON response**: `extractReplacement()` uses fallback parsing. On failure, no patch file is written and an error is shown in EditBuffer.
- **Race conditions**: If the original file changes externally while a patch is pending, approving overwrites the external change. Mitigation: stale-patch warning in PatchBuffer.
- **`.mimo-patches/` visibility**: Must be filtered from all file listings, file watcher events, and impact buffer.
