## Context

The EditBuffer currently displays files read-only with a tab system, file context bar, and syntax-highlighted content. The chat thread system allows users to send instructions to an LLM agent via ACP, with messages stored as JSONL and streamed back through WebSocket.

Expert mode bridges these two systems: it lets the user issue edit/refactor instructions from within the EditBuffer, using an active chat thread as the LLM conduit, with a copy-on-write safety mechanism and a preview-before-apply confirmation flow.

Key files:
- `packages/mimo-platform/src/buffers/EditBuffer.tsx` — server-rendered HTML shell
- `packages/mimo-platform/public/js/edit-buffer.js` — client-side state management, file finder, rendering
- `packages/mimo-platform/src/files/routes.ts` — file listing and content API
- `packages/mimo-platform/src/files/service.ts` — file operations (pure functions)
- `packages/mimo-platform/src/index.tsx` — WebSocket hub, chat message routing
- `packages/mimo-platform/public/js/chat.js` — chat state, editable bubble, WebSocket messaging
- `packages/mimo-platform/public/js/chat-threads.js` — thread selection, switching, creation
- `packages/mimo-platform/src/buffers/ChatThreadsBuffer.tsx` — thread tabs and context bar
- `packages/mimo-platform/public/js/session-keybindings.js` — keyboard shortcut handlers

## Goals / Non-Goals

**Goals:**
- Allow users to instruct the LLM to edit the file currently open in EditBuffer
- Use the selected chat thread's ACP session for LLM communication
- Provide a visual focus guide showing the user's area of interest
- Create a temporary copy for the LLM to edit, preserving the original
- Show a diff preview before applying changes
- Require explicit user confirmation before overwriting the original file
- Minimal changes to the agent — it receives a normal user_message with context prefix

**Non-Goals:**
- Multi-file editing in a single expert-mode session
- Instructing the LLM to edit files other than the one open in EditBuffer
- Replacing the chat thread's editable bubble — expert mode adds a parallel input in EditBuffer
- Conflict resolution UI for concurrent edits (warn only)
- Automatic merge or partial-apply of LLM changes (accept-all or reject-all only, for MVP)

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      EditBuffer (Expert Mode ON)                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   File Tabs Bar                           │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─── ──── ┌─────┐ │  │
│  │  │file1.ts │ │file2.ts │ │file3.ts │ │ + Open  │[🛆] │ │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └───────── └─────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  File Context Bar                         │  │
│  │  File: src/utils/helpers.ts   Lines: 42   [🛆 Expert]   │  │
│  │  Thread: "Refactor Thread"                                │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  File Content View                        │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  1  │ import { FC } from "hono/jsx";               │  │  │
│  │  │  2  │                                              │  │  │
│  │  │  3  │ export const helper = () => {       ┌──────┐ │  │  │
│  │  │  4  │   return "highlighted";              │FOCUS │ │  │  │
│  │  │  5  │ };                                   │GUIDE │ │  │  │
│  │  │  6  │                                       │7-LINE│ │  │  │
│  │  │  7  │ export const other = () => {          │OVLY  │ │  │  │
│  │  │  8  │   return "value";                     └──────┘ │  │  │
│  │  │  9  │ }                                              │  │  │
│  │  │ ... │                                              │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │               Expert Instruction Input                    │  │
│  │  ┌───────────────────────────────────────────┬─────────┐ │  │
│  │  │ Refactor the helper function to be async  │ ⌃↵ Send │ │  │
│  │  └───────────────────────────────────────────┴─────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                Expert Diff Preview (Pending Confirmation)       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  File Context Bar                         │  │
│  │  File: src/utils/helpers.ts   [✓ Apply] [✕ Reject]      │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  ORIGINAL (current)                       │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  3  │ export const helper = () => {          ← ✕    │  │  │
│  │  │  4  │   return "highlighted";               ← ✕    │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │                  MODIFIED (proposed)                      │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  3' │ export const helper = async () => {    ← ✓    │  │  │
│  │  │  4' │   const result = await fetch("/api");  ← ✓    │  │  │
│  │  │  5' │   return result;                       ← ✓    │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### UI States

**State 1: Expert Mode OFF (current EditBuffer)**
- Toggle button in context bar shows "Expert" label, inactive style
- No focus guide, no instruction input

**State 2: Expert Mode ON — Idle**
- Toggle button shows "Expert" active style (highlighted)
- Focus guide overlay visible (7 lines centered on cursor/scroll position)
- Instruction input box visible at bottom
- Thread name shown in context bar (the thread that will receive the instruction)

**State 3: Expert Mode ON — Processing**
- Instruction input becomes read-only, shows "Processing..."
- Focus guide stays visible
- Cancel button appears (if ACP supports cancellation, reuse existing cancel flow)

**State 4: Expert Mode ON — Diff Preview**
- Diff view replaces file content with two stacked panes:
  - **Top pane**: "ORIGINAL" header, shows the current file with removed lines highlighted in red
  - **Bottom pane**: "MODIFIED" header, shows the proposed changes with added lines highlighted in green
- Both panes display full file content with line numbers and syntax highlighting
- Scrolling is independent per pane (user can compare sections)
- Context bar shows [✓ Apply] and [✕ Reject] buttons
- Instruction input is hidden
- Focus guide is hidden

**State 5: Expert Mode ON — Applied/Rejected**
- Brief status message ("Changes applied" or "Changes rejected")
- Returns to State 2 (idle) after 2 seconds
- Original file refreshed in content view

## Decisions

### D1: Focus Guide — Visual Overlay, Not LLM Constraint

**Decision**: The 7-line focus guide is a visual highlight in the EditBuffer only. It informs the LLM prompt but does not restrict line editing.

```typescript
interface FocusGuide {
  startLine: number;
  endLine: number;    // startLine + 6 (7 lines total)
  centerLine: number;  // The line closest to the center of the viewport
}

// Computed from current scroll position and viewport height
const computeFocusGuide = (
  firstVisibleLine: number,
  lastVisibleLine: number
): FocusGuide => {
  const centerLine = Math.floor((firstVisibleLine + lastVisibleLine) / 2);
  const startLine = Math.max(1, centerLine - 3);
  const endLine = startLine + 6;
  return { startLine, endLine, centerLine };
};
```

**Rationale**: Line-based restriction would require complex validation and might prevent necessary edits outside the range (e.g., adding imports). The focus guide gives the LLM context about the user's focus area without artificial constraints.

### D2: Instruction Context — Prepend to User Message

**Decision**: The expert-mode instruction is sent as a regular `user_message` through the chat thread, prepended with a structured context block:

```
[Expert Mode - File Edit Request]
File: <filepath>
Focus lines: <start>-<end>
Task: Edit the file at the temporary path shown below. Do NOT edit the original file.
Original path: <original-path>
Temporary path: <temp-path>
Instruction: <user instruction>
```

**Rationale**: This avoids modifying the agent or ACP protocol. The agent receives a normal user message with clear instructions. The chat thread naturally preserves the context in its history. The temporary path convention (`<path>.mimo-expert.tmp`) tells the agent exactly which file to modify.

### D3: Temp File Strategy — Same Directory, Suffix Convention

**Decision**: The temporary file is created as `<original-path>.mimo-expert.tmp` in the same directory. The copy operation is performed server-side via a new API endpoint.

```
original: src/utils/helpers.ts
temp:     src/utils/helpers.ts.mimo-expert.tmp
```

**Rationale**: Keeping the temp file in the same directory ensures relative imports and paths work correctly when the LLM reads/modifies the file. The `.mimo-expert.tmp` suffix is distinctive enough to avoid collisions and can be easily filtered from file listings.

### D4: Diff View — Stacked Panes (Original on Top, Modified Below)

**Decision**: The diff preview uses a vertical stacked layout with the original file on top and the modified version below. Both panes are line-numbered and syntax-highlighted, with changed lines visually marked. This gives the user full context of the current file at a glance, making it easy to understand what changed and where.

```
┌─────────────────────────────────────────────┐
│  ORIGINAL  (current file on disk)           │
│  1  │ import { FC } from "hono/jsx";       │
│  2  │                                      │
│  3  │ export const helper = () => {        │  ← marked removed
│   4  │   return "highlighted";             │  ← marked removed
│  5  │ };                                   │
│  ...│                                      │
├─────────────────────────────────────────────┤
│  MODIFIED  (proposed changes)               │
│  1  │ import { FC } from "hono/jsx";       │
│  2  │                                      │
│  3' │ export const helper = async () => {  │  ← marked added
│  4' │   const result = await fetch(...);    │  ← marked added
│  5' │   return result;                     │  ← marked added
│  6  │ };                                   │
│  ...│                                      │
└─────────────────────────────────────────────┘
```

```typescript
interface DiffResult {
  original: DiffPane;
  modified: DiffPane;
}

interface DiffPane {
  lines: DiffLine[];
}

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber: number;
}

const computeDiff = (original: string, modified: string): DiffResult => {
  // Line-based diff (Myers or LCS) produces two aligned line arrays
  // Original pane: removed lines marked red, unchanged lines normal
  // Modified pane: added lines marked green, unchanged lines normal
  // Both panes show full file content with line numbers
};
```

**Rationale**: Showing the original file on top gives the user immediate familiarity — they can see the file they were just looking at, understand its current state, and then compare below to see exactly what changed. This is clearer than an interleaved unified diff where removed and added lines alternate, which can fragment context. The stacked layout preserves full-file readability in both panes while still highlighting the specific changes. Client-side diff computation keeps the server simple.

### D5: State Machine for Expert Mode Lifecycle

**Decision**: Expert mode uses a simple state machine in the client-side `EditBufferState`:

```
OFF → IDLE → PROCESSING → DIFF_PREVIEW → IDLE
                ↓                ↓
              (cancel)        (reject → IDLE)
                              (apply → IDLE)
```

```typescript
type ExpertModeState = "off" | "idle" | "processing" | "diff_preview";

interface ExpertMode {
  enabled: boolean;
  state: ExpertModeState;
  focusGuide: FocusGuide | null;
  tempFilePath: string | null;
  originalChecksum: string | null;
  diffContent: DiffLine[] | null;
  instruction: string | null;
}

// In EditBufferState:
interface EditBufferState {
  openFiles: OpenFile[];
  activeIndex: number;
  expertMode: ExpertMode;  // NEW
}
```

**Rationale**: A state machine prevents invalid transitions (e.g., sending a second instruction while one is pending). Each state maps to a distinct UI. The `enabled` flag persists via localStorage; `state` resets to `"idle"` on page reload since temp files are session-scoped.

### D6: Thread Selection — Use Active Chat Thread

**Decision**: Expert mode uses whichever chat thread is currently active in the ChatThreadsBuffer. The thread name is shown in the EditBuffer context bar. If no thread exists, the instruction input is disabled with a message "Create a chat thread first."

**Rationale**: Avoids duplicating thread management in the EditBuffer. Users already manage threads in the chat buffer; the EditBuffer just reads the active thread ID via `window.MIMO_CHAT_THREADS.getActiveThreadId()`.

### D7: Ignore Temp Files in File Listings and Watchers

**Decision**: Add `.mimo-expert.tmp` to the default ignore patterns in `applyIgnorePatterns()` and to the file watcher exclusion list.

**Rationale**: Temp files must not appear in the file finder, impact buffer, or trigger file-outdated notifications.

## Data Flow

### Enabling Expert Mode

1. User clicks "Expert" button in EditBuffer context bar (or presses Alt+Shift+E)
2. `edit-buffer.js` toggles `expertMode.enabled = true`, `expertMode.state = "idle"`
3. UI renders focus guide overlay and instruction input box
4. Focus guide computes from current viewport center in the content area
5. `expertMode.enabled` is persisted to localStorage key `mimo:edit-buffer-expert:<sessionId>`

### Sending an Expert Instruction

1. User types instruction and presses Ctrl+Enter (or Send button)
2. `edit-buffer.js` reads `window.MIMO_CHAT_THREADS.getActiveThreadId()` to get current thread
3. If no active thread, show error: "Create a chat thread first"
4. `edit-buffer.js` calls `POST /api/sessions/:sessionId/files/copy` with `{ path: activeFile.path }`
5. Server copies file to `<path>.mimo-expert.tmp`, returns `{ tempPath, originalChecksum }`
6. `edit-buffer.js` stores `tempFilePath` and `originalChecksum` in `expertMode`
7. `edit-buffer.js` constructs context message (D2) and sends WebSocket message:
   ```json
   {
     "type": "expert_instruction",
     "chatThreadId": "<threadId>",
     "originalPath": "<path>",
     "tempPath": "<path>.mimo-expert.tmp",
     "focusStart": 34,
     "focusEnd": 40,
     "instruction": "Refactor to async"
   }
   ```
8. Platform WebSocket handler (`index.tsx`) receives `expert_instruction`, constructs the full prompt per D2, and forwards as `user_message` to the agent
9. Platform also saves the message in the chat thread JSONL with `metadata.expertMode = true`
10. Chat UI renders the message in the thread with a collapsed `[Expert Edit: helpers.ts]` badge
11. `expertMode.state` transitions to `"processing"`

### LLM Processing and Response

1. Agent receives the user_message, processes it (potentially editing the temp file)
2. Agent streams thought_chunk and message_chunk as normal
3. Chat thread displays the response inline
4. On `usage_update`, platform sends the usual message finalization

### Diff Preview Flow

1. Platform detects `usage_update` for a thread that has an active `expert_instruction`
2. Platform tracks `expertModePending: Map<sessionId:threadId, { originalPath, tempPath }>`
3. On `usage_update`, platform checks if this thread has a pending expert instruction
4. If yes, platform sends an additional WebSocket message to the **EditBuffer client** (not chat):
   ```json
   {
     "type": "expert_diff_ready",
     "chatThreadId": "<threadId>",
     "originalPath": "<path>",
     "tempPath": "<path>.mimo-expert.tmp"
   }
   ```
5. `edit-buffer.js` receives `expert_diff_ready`
6. Fetches original content from EditBufferState (already in memory)
7. Fetches temp file content from `GET /sessions/:sessionId/files/content?path=<tempPath>`
8. Computes stacked diff client-side: two aligned line arrays (original pane with removed lines marked, modified pane with added lines marked)
9. `expertMode.state` transitions to `"diff_preview"`
10. UI switches to stacked diff view — original file on top, modified version below, changed lines highlighted

### Apply Changes

1. User clicks "✓ Apply" button (or presses Ctrl+Enter)
2. `edit-buffer.js` calls `POST /api/sessions/:sessionId/files/apply` with `{ originalPath, tempPath }`
3. Server reads temp file content, overwrites original file, deletes temp file
4. Server sends `file_changed` event via file watcher (existing mechanism)
5. EditBuffer receives `file_changed`, refreshes file content
6. `expertMode.state` transitions to `"idle"`, brief "Changes applied" toast

### Reject Changes

1. User clicks "✕ Reject" button (or presses Alt+Shift+G)
2. `edit-buffer.js` calls `DELETE /api/sessions/:sessionId/files/temp` with `{ tempPath }`
3. Server deletes temp file
4. `expertMode.state` transitions to `"idle"`, brief "Changes rejected" toast
5. Original file content remains unchanged

### Cancelling During Processing

1. User clicks Cancel button during "processing" state
2. `edit-buffer.js` sends `cancel_request` through the existing chat cancel mechanism
3. On cancellation, transition back to `"idle"` state
4. Temp file may or may not have been partially modified — fetch fresh content to determine
5. If temp file exists with changes, show diff preview; otherwise, delete temp file

### Original File Modified During Processing (Race Condition)

1. File watcher detects original file changed externally
2. EditBuffer shows "Outdated" indicator as per existing outdated-detection feature
3. If expert mode is in `"processing"` or `"diff_preview"` state, add a warning banner:
   "Warning: The original file has been modified externally. applying changes may overwrite recent edits."
4. User decides whether to proceed with apply or reject

## Key Components

### EditBuffer.tsx (Server-Side HTML Shell)

Extensions to the existing component:
- Expert mode toggle button in context bar (id="expert-mode-toggle")
- Thread name display in context bar (id="expert-thread-name")
- Focus guide overlay container (id="expert-focus-guide")
- Instruction input box container (id="expert-instruction-input")
- Diff preview container (id="expert-diff-preview")
- Apply/Reject buttons container (id="expert-actions")

### edit-buffer.js (Client-Side State)

New state and functions:
- `ExpertMode` state object with `enabled`, `state`, `focusGuide`, `tempFilePath`, `originalChecksum`, `diffContent`
- `toggleExpertMode()` — toggle enabled, render UI
- `computeFocusGuide()` — calculate 7-line range from viewport
- `sendExpertInstruction(instruction)` — copy file, construct context, send via WebSocket
- `showDiffPreview(original, modified)` — compute and render stacked diff (original on top, modified below)
- `renderDiffPanes(diffResult)` — render two vertically stacked panes with headers, highlighting, and independent scroll
- `applyExpertChanges()` — call apply API, refresh
- `rejectExpertChanges()` — call delete temp API, return to idle
- `handleExpertDiffReady(event)` — WebSocket handler for `expert_diff_ready`
- `updateFocusGuideOnScroll()` — recalculate on scroll

### Platform WebSocket Handler (index.tsx)

New message type handling:
- `expert_instruction` — construct context prompt, forward as `user_message` to agent, track pending state
- `expert_diff_ready` — sent to EditBuffer client when LLM finishes for a tracked expert instruction

### New API Endpoints

```typescript
// POST /api/sessions/:sessionId/files/copy
// Body: { path: string }
// Response: { tempPath: string, originalChecksum: string }
// Copies file to <path>.mimo-expert.tmp

// POST /api/sessions/:sessionId/files/apply
// Body: { originalPath: string, tempPath: string }
// Response: { success: boolean }
// Reads temp, overwrites original, deletes temp

// DELETE /api/sessions/:sessionId/files/temp
// Body: { tempPath: string }
// Response: { success: boolean }
// Deletes the temp file
```

### Diff Computation (Client-Side)

```typescript
// packages/mimo-platform/public/js/diff.js
// Line-based diff (Myers algorithm or LCS) producing two aligned panes
// Original pane: full file, removed lines marked red, unchanged lines normal
// Modified pane: full file, added lines marked green, unchanged lines normal
export function computeDiff(original: string, modified: string): DiffResult

interface DiffResult {
  original: DiffPane;
  modified: DiffPane;
}

interface DiffPane {
  lines: DiffLine[];
}

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber: number;
}

// Rendering:
// - Original pane header: "ORIGINAL (current)"
// - Modified pane header: "MODIFIED (proposed)"
// - Both panes render full file content with line numbers
// - Removed lines in original pane: red background (#3a1a1a), red left border
// - Added lines in modified pane: green background (#1a3a1a), green left border
// - Each pane scrolls independently
```

## Risks / Trade-offs

- **LLM may not edit the temp file exclusively**: The context prefix strongly instructs the LLM, but compliance is not guaranteed. The diff preview mitigates this — the user sees exactly what changed.
- **Large files**: Computing diffs client-side for very large files could be slow. Mitigation: limit EditBuffer to files under a configurable size (already no virtual scrolling, so this is bounded).
- **Thread context pollution**: Each expert instruction adds a technical message to the chat thread. Mitigation: the `expertMode: true` metadata allows future UI improvements to collapse or filter these messages.
- **Temp file cleanup on crash**: If the browser crashes during processing, temp files may be left behind. Mitigation: On EditBuffer initialization, scan for `.mimo-expert.tmp` files and offer cleanup; these files are also filtered from all listings.
- **One expert session per file**: The state machine prevents concurrent expert instructions on the same file. Multiple files could theoretically have concurrent sessions, but MVP restricts to one at a time globally for simplicity.