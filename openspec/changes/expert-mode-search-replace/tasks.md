# Tasks: Expert Mode SEARCH/REPLACE

## Specification

- [x] Create `openspec/changes/expert-mode-search-replace/proposal.md`
- [x] Create `openspec/changes/expert-mode-search-replace/design.md`
- [x] Create `openspec/changes/expert-mode-search-replace/specs/expert-utils/spec.md`
- [x] Create `openspec/changes/expert-mode-search-replace/tasks.md` (this file)

## Phase 1: Core Engine (`expert-utils.js`)

### Parsing
- [x] Implement `extractSearchReplaceBlocks(response)`
  - [x] Strip `\u003cdetails\u003e` tags
  - [x] Parse `\u003c<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE` pattern
  - [x] Handle multiple blocks
  - [x] Return array of `{search, replace}` objects
  - [x] Handle missing blocks gracefully (return empty array)

### Matching
- [x] Implement `applySearchReplaceBlock(content, block, focusLine?)`
  - [x] Level 1: Exact match (`content.indexOf(search)`)
  - [x] Level 2: Whitespace-normalized match
  - [x] Level 3: Partial match within ±5 lines of focusLine
  - [x] Detect ambiguous matches (multiple exact occurrences)
  - [x] Throw descriptive errors for not-found, ambiguous, empty-search

### Batch Application
- [x] Implement `applySearchReplaceBlocks(content, blocks)`
  - [x] Apply blocks sequentially
  - [x] Track content state across blocks
  - [x] Abort on first failure with block number in error

### Integration
- [x] Update `extractReplacement(response)` to detect both formats
  - [x] Try SEARCH/REPLACE first
  - [x] Fallback to JSON format
  - [x] Return tagged union: `{format, blocks|replacements}`
- [x] Update `applyReplacements(content, parsed)` to route by format
  - [x] Route to `applySearchReplaceBlocks` for search_replace format
  - [x] Route to existing logic for json format

## Phase 2: Prompt Update (`edit-buffer.js`)

- [x] Replace line-number schema with SEARCH/REPLACE format in `sendExpertInstruction()`
  - [x] Update format description
  - [x] Add concrete examples (replace, insert, delete)
  - [x] Emphasize: "Copy EXACT old code into SEARCH block"
  - [x] Include anchor pattern example for insertion

## Phase 3: Tests (`expert-utils.test.ts`)

- [x] Parse tests
  - [x] T1: Parse single block
  - [x] T2: Parse multiple blocks
  - [x] T3: Parse blocks with surrounding text
  - [x] T4: No blocks found returns empty array
- [x] Application tests
  - [x] T5: Apply exact match
  - [x] T6: Apply fuzzy match (whitespace)
  - [x] T7: Apply insertion (anchor pattern)
  - [x] T8: Apply deletion (empty replace)
  - [x] T9: Apply multiple blocks
- [x] Error tests
  - [x] T10: Not found error
  - [x] T11: Ambiguous match error
  - [x] T12: Empty search block error
- [x] Backward compatibility
  - [ ] T13: JSON format still works
  - [ ] T14: SEARCH/REPLACE takes precedence over JSON
- [x] End-to-end
  - [x] T15: Real-world example (replace function with docstring)
  - [x] T16: Multiple independent edits in one response

## Phase 4: Verification

- [x] Run all existing tests: `cd packages/mimo-platform && bun test`
- [x] Run new tests: `cd packages/mimo-platform && bun test test/expert-utils.test.ts`
- [ ] Verify no regressions in existing expert mode functionality
- [ ] Verify backward compatibility with JSON format

## Phase 5: Documentation

- [x] Update any inline code comments in `expert-utils.js`
- [x] Update `edit-buffer.js` comments if needed

## Acceptance Criteria

- [x] All 16 new tests pass
- [ ] All existing tests continue to pass
- [ ] SEARCH/REPLACE blocks are parsed and applied correctly
- [ ] Fuzzy matching handles minor whitespace variations
- [ ] Multiple blocks work in single response
- [ ] Insertion via anchor pattern works
- [ ] Deletion via empty replace works
- [ ] JSON format still works (backward compatibility)
- [ ] Clear error messages for all failure cases
- [ ] Prompt updated to request SEARCH/REPLACE format
