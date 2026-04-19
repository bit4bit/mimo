# Proposal: Expert Mode SEARCH/REPLACE Blocks

## Problem Statement

The current expert mode uses line-number-based JSON replacements (`replace_start_line`, `replace_end_line`). This approach is fundamentally fragile because LLMs cannot accurately count lines in files beyond ~50 lines. Real-world usage shows catastrophic failures:

- **Line miscounting**: LLM thinks `sin()` method is lines 48-54, but it's actually lines 48-56
- **Cascading corruption**: First wrong replacement shifts all subsequent line numbers
- **Duplicate/dead code**: Old code remains while new code is inserted, creating broken files
- **Silent failures**: Patch applies "successfully" but produces syntactically or semantically invalid code

The current "search" field mitigation helps find the start line but still relies on the LLM's end line count, which is equally error-prone.

## Proposal

Replace line-number-based patching with **fuzzy SEARCH/REPLACE blocks** (Aider-style). This is the industry-standard approach used successfully by Aider, Cursor, and other AI coding tools at scale.

## Proposed Change

### New Format

The LLM returns one or more SEARCH/REPLACE blocks:

```
<<<<<<< SEARCH
    def sin(self, x: float, degrees: bool = False) -> float:
        """Return the sine of x."""
        if degrees:
            return math.sin(math.radians(x))
        return math.sin(x)
=======
    def sin(self, x: float, degrees: bool = False) -> float:
        """Return the sine of x."""
        return math.sin(self._to_radians(x, degrees))
>>>>>>> REPLACE
```

### Operations Supported

- **Replace**: SEARCH = old code, REPLACE = new code
- **Insert**: Include anchor line in both blocks, add new code in REPLACE
- **Delete**: SEARCH = code to remove, REPLACE = empty
- **Multiple edits**: Multiple blocks in one response

### Backward Compatibility

The system will continue to support the existing JSON format (`{"replacements": [...]}`) during a migration period. Both formats are detected and routed to the appropriate handler.

## Scope

### In Scope
- Add SEARCH/REPLACE parsing and application engine
- Implement fuzzy matching (exact → whitespace-normalized → partial)
- Update LLM prompt to request SEARCH/REPLACE format
- Support multiple blocks in single response
- Comprehensive test coverage
- Maintain backward compatibility with JSON format

### Out of Scope
- Multi-file editing in single expert-mode session
- Interactive per-block approve/decline
- AST-aware or semantic matching
- Line-number format deprecation (future change)

## Success Criteria
- LLM can reliably replace, insert, and delete code using SEARCH/REPLACE
- Fuzzy matching handles minor whitespace variations
- Multiple independent edits work in single response
- Clear error messages when SEARCH block not found
- Backward compatibility: JSON format still works
- All existing tests continue to pass
- New tests cover: exact match, fuzzy match, insertion, deletion, multiple blocks, not-found error

## Affected Components

- `packages/mimo-platform/public/js/expert-utils.js` — parsing and application logic
- `packages/mimo-platform/public/js/edit-buffer.js` — prompt template
- `packages/mimo-platform/test/expert-utils.test.ts` — test coverage

## Change Classification

- **Type**: Enhancement / Architecture improvement
- **Risk**: Medium — changes core editing mechanism but adds backward compatibility
- **Breaking**: No
