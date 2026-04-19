# Proposal: Add PatchBuffer

## Problem

ExpertMode currently manages diff state entirely in the browser (`localStorage` + in-memory JS).
This has three compounding problems:

1. **Browser reload loses state.** A pending diff is gone after any reload.
2. **Single replacement only.** The LLM prompt returns one `{replace_start_line, replace_end_line, replacement}` object. Tasks that require multiple non-contiguous edits in the same file cannot be expressed.
3. **No dedicated UI surface.** The diff is rendered as an overlay inside the Edit buffer container, fighting for space with the file view.

## Proposed Solution

Introduce a **PatchBuffer** as a first-class backend-owned concept and a dedicated UI buffer.

- The backend holds patch state keyed by `sessionId + filePath`. Browser reloads recover cleanly by fetching the pending patch from the server.
- The LLM prompt schema is updated to return an **array of replacements**, allowing multiple non-contiguous edits per file per instruction.
- ExpertMode hands off to PatchBuffer after the LLM response: it creates a backend patch record and navigates the UI to the PatchBuffer tab.
- PatchBuffer renders a vertical-split diff (left = original, right = patched), with change highlighting and Approve / Decline buttons.
- Approve/Decline is **all-or-nothing per file**. Each file gets its own PatchBuffer tab.
- On approve, the backend applies the patch and writes the file. On decline, the record is discarded. Either way the tab auto-closes and focus returns to the Edit buffer.

## Out of Scope

- Per-replacement granular approve/decline (all-or-nothing per file is sufficient).
- Cross-file instructions (each replacement entry already carries a `file` field but this change only creates one PatchBuffer per file; multi-file is a future concern).
- Persisting patch history after resolution.
