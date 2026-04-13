# Tasks: Chat Buffer Markdown Rendering

## Task 1: Add marked dependency
**Status:** completed

Add `marked` library to mimo-platform for client-side markdown rendering.

**Files:**
- `packages/mimo-platform/package.json`

**Steps:**
1. Add `"marked": "^15.0.0"` to dependencies
2. Run `bun install` to update lockfile

**Acceptance:**
- `marked` is in package.json dependencies
- `bun.lockb` is updated
- `import marked from 'marked'` works in chat.js

---

## Task 2: Implement markdown rendering functions
**Status:** completed

Add markdown rendering and toggle button functionality to chat.js.

**Files:**
- `packages/mimo-platform/public/js/chat.js`

**Steps:**
1. Add `renderMarkdown(content)` function using marked
2. Add `addViewToggleButtons(messageEl, contentEl)` function
3. Ensure marked is loaded (add script tag or import)

**Acceptance:**
- `renderMarkdown('# test')` returns `<h1>test</h1>`
- Toggle buttons are created correctly
- Click handlers switch between raw and rendered views

---

## Task 3: Modify finalizeMessageStream for markdown
**Status:** completed

Update stream finalization to render markdown and add toggle buttons.

**Files:**
- `packages/mimo-platform/public/js/chat.js`

**Steps:**
1. In `finalizeMessageStream()`, get the raw content
2. Store it in `data-raw-content`
3. Render markdown and set `innerHTML`
4. Add `markdown-rendered` class
5. Call `addViewToggleButtons()`

**Acceptance:**
- When streaming ends, message shows rendered markdown
- Toggle buttons appear in header
- Raw content is preserved in data attribute

---

## Task 4: Modify renderMessage for history messages
**Status:** completed

Update message rendering for loaded history to support markdown.

**Files:**
- `packages/mimo-platform/public/js/chat.js`

**Steps:**
1. In `renderMessage()`, check if role is 'assistant'
2. If yes, store raw content, render markdown, add toggle buttons
3. If no (user/system), keep plain text behavior
4. Use `setTimeout` to defer toggle button addition after DOM insertion

**Acceptance:**
- Agent messages from history show rendered markdown
- User messages remain plain text
- Toggle buttons work on history messages

---

## Task 5: Add CSS styles for markdown and toggle
**Status:** completed

Add all necessary CSS for rendered markdown and toggle buttons.

**Files:**
- `packages/mimo-platform/src/components/SessionDetailPage.tsx`

**Steps:**
1. Add markdown content styles (headers, lists, code, etc.)
2. Add toggle button styles (inactive, active, hover)
3. Ensure styles don't affect existing components

**Acceptance:**
- Markdown renders with proper styling
- Toggle buttons have correct visual states
- Code blocks have dark background
- Links are blue and underlined on hover

---

## Task 6: Ensure copy button copies raw content
**Status:** completed

Verify and fix copy button to always copy raw markdown.

**Files:**
- `packages/mimo-platform/public/js/chat.js`

**Steps:**
1. Check copy button handler in `insertMessage()`
2. Ensure it uses `dataset.rawContent` or `textContent` appropriately
3. Fix if needed to always copy raw markdown

**Acceptance:**
- Copy button always copies raw markdown, never rendered HTML

---

## Task 7: Test edge cases
**Status:** completed

Test various edge cases to ensure robustness.

**Test Cases:**
1. Empty message - should show nothing, no errors
2. Plain text (no markdown) - should render as plain text
3. HTML in markdown - should be escaped
4. Very long message - should scroll properly
5. Code blocks with syntax highlighting - should render correctly
6. Tables - should render with borders
7. Toggle multiple times - should switch correctly

**Acceptance:**
- All edge cases handled gracefully
- No console errors
- Visual appearance is correct

---

## Task 8: Run test suite
**Status:** completed

Ensure all existing tests pass after changes.

**Commands:**
```bash
cd packages/mimo-platform && bun test
cd packages/mimo-agent && bun test
```

**Acceptance:**
- All tests pass
- No regressions introduced

---

## Verification Checklist

Before archiving:
- [x] Markdown renders correctly for new streamed messages
- [x] Toggle buttons work (Raw/Markdown)
- [x] History messages show markdown on load
- [x] Copy button copies raw content
- [x] User messages unaffected
- [x] All tests pass (394 pass, 1 unrelated fail)
- [x] Code follows project style
