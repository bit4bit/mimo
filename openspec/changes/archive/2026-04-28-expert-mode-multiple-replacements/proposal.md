# Proposal: Expert Mode Multiple Replacements

## Problem Statement

Currently, expert mode only supports single replacement operations. The LLM returns a single `replacement` object with `replace_start_line`, `replace_end_line`, and `replacement` fields. This limits the LLM's ability to make multiple discrete edits to a file in response to a single instruction.

When a user asks for changes that affect multiple, non-contiguous areas of a file, the LLM must either:
1. Return a single large replacement that includes unchanged code, which is inefficient and harder to review
2. Only make one of the requested changes
3. Return an error indicating out-of-scope changes are required

## Proposal

Allow the LLM to return an array of replacements (`replacements`) instead of a single replacement. Each element in the array targets a specific line range, enabling multiple discrete edits within a single expert-mode session.

## Proposed Change

### Current Format
```json
{
  "file": "src/utils/helpers.ts",
  "replace_start_line": 10,
  "replace_end_line": 15,
  "replacement": "// new content"
}
```

### New Format (Backward Compatible)
```json
{
  "replacements": [
    {
      "file": "src/utils/helpers.ts",
      "replace_start_line": 10,
      "replace_end_line": 12,
      "replacement": "// first change"
    },
    {
      "file": "src/utils/helpers.ts",
      "replace_start_line": 25,
      "replace_end_line": 28,
      "replacement": "// second change"
    }
  ]
}
```

The system will:
1. Apply replacements in order from highest line number to lowest (to preserve line number validity)
2. Reject overlapping replacement ranges
3. Maintain backward compatibility by also supporting the single-object format

## Scope

### In Scope
- Update `expert-utils.js` to parse `replacements` array
- Add `applyReplacements()` function for multiple replacements
- Update prompt template to request array format
- Update `edit-buffer.js` to handle array in `handleExpertDiffReady`
- Add comprehensive tests for new functionality
- Maintain backward compatibility with single-object format

### Out of Scope
- Multi-file editing in a single expert-mode session (each `replacements` array targets one file)
- Interactive selection of which replacements to apply
- Partial apply/reject of individual replacements within an array

## Success Criteria
- LLM can return multiple replacements for a single file
- Replacements are applied correctly to produce the final patched content
- Overlapping ranges are detected and rejected with clear error
- Backward compatibility: single-object format still works
- Tests cover: single replacement, multiple replacements, overlapping ranges, invalid line numbers

## Affected Components

- `packages/mimo-platform/public/js/expert-utils.js` — parsing and application logic
- `packages/mimo-platform/public/js/edit-buffer.js` — prompt template and response handling
- `packages/mimo-platform/test/expert-utils.test.ts` — test coverage

## Change Classification

- **Type**: Enhancement
- **Risk**: Low — additive change with backward compatibility
- **Breaking**: No
