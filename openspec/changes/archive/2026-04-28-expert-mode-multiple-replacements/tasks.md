# Tasks: Expert Mode Multiple Replacements

## Phase 1: Documentation

- [x] Create `openspec/changes/expert-mode-multiple-replacements/proposal.md`
- [x] Create `openspec/changes/expert-mode-multiple-replacements/design.md`
- [x] Create `openspec/changes/expert-mode-multiple-replacements/specs/expert-utils/spec.md`
- [x] Create `openspec/changes/expert-mode-multiple-replacements/tasks.md` (this file)

## Phase 2: Core Implementation

- [x] Update `packages/mimo-platform/public/js/expert-utils.js`
  - [x] Update `extractReplacement()` to parse `replacements` array
  - [x] Add backward compatibility for legacy single-object format
  - [x] Add `applyReplacements()` function
  - [x] Implement overlap detection
  - [x] Add validation for required fields

- [x] Update `packages/mimo-platform/public/js/edit-buffer.js`
  - [x] Update `sendExpertInstruction()` prompt to request array format
  - [x] Update `handleExpertDiffReady()` to call `applyReplacements()`
  - [x] Handle error cases (overlap, invalid format, etc.)

## Phase 3: Testing

- [x] Update `packages/mimo-platform/test/expert-utils.test.ts`
  - [x] Add test: Parse `replacements` array format
  - [x] Add test: Parse legacy single-object format (backward compat)
  - [x] Add test: Apply single replacement via array
  - [x] Add test: Apply multiple non-overlapping replacements
  - [x] Add test: Reject overlapping replacement ranges
  - [x] Add test: Allow adjacent replacement ranges
  - [x] Add test: Handle empty replacements array
  - [x] Add test: Handle missing required fields
  - [x] Add test: Handle invalid line numbers
  - [x] Add test: Apply replacements in correct order (bottom-to-top)

## Phase 4: Verification

- [x] Run `bun test packages/mimo-platform/test/expert-utils.test.ts`
- [x] Verify all tests pass
- [x] Manual verification in browser (optional)

## Test Command

```bash
bun test packages/mimo-platform/test/expert-utils.test.ts
```

## Summary

The implementation allows expert mode to support multiple replacements returned by the LLM. Key changes:

1. **New format**: LLM can return `{"replacements": [...]}` with multiple replacement objects
2. **Backward compatibility**: Legacy single-object format still works
3. **Overlap detection**: Overlapping ranges are rejected with clear error messages
4. **Bottom-to-top application**: Replacements are applied from highest line number to lowest to preserve line number validity
5. **Validation**: All replacements are validated for required fields and valid line numbers

The prompt now explicitly requests the array format and explains when to use multiple replacements.
