## Context

Expert mode currently constrains the LLM to return a single replacement object:

```typescript
interface Replacement {
  file: string;
  replace_start_line: number;
  replace_end_line: number;
  replacement: string;
}
```

This design was chosen for simplicity, but real-world usage shows that many legitimate edit requests require changes in multiple, non-contiguous locations within the same file. For example:
- Adding an import at the top AND modifying a function elsewhere
- Updating multiple function signatures in a file
- Refactoring a class property and its usages

## Goals / Non-Goals

**Goals:**
- Allow LLM to return multiple replacements in a single response
- Apply all replacements atomically to produce final patched content
- Maintain backward compatibility with single-object format
- Detect and reject overlapping replacement ranges
- Keep the change minimal and focused

**Non-Goals:**
- Multi-file editing (still one file per expert-mode session)
- Interactive per-replacement approve/decline
- Partial application of a replacements array
- Line number shifting (client applies in correct order)

## Decisions

### D1: Array Format with Backward Compatibility

**Decision**: The new format is `{"replacements": [...]}`, while maintaining support for the legacy single-object format `{"file": ..., "replace_start_line": ..., ...}`.

**Rationale**: This allows gradual migration and ensures existing tests/prompts continue working. The `extractReplacement` function will return a normalized array in both cases.

### D2: Apply Replacements from Bottom to Top

**Decision**: When applying multiple replacements, apply them in descending order of `replace_start_line` (highest line number first).

**Rationale**: This ensures that replacing earlier lines doesn't shift the line numbers of later replacements. Example:

```
File: 10 lines
Replacement A: lines 2-3
Replacement B: lines 8-9

If we apply A first (lines 2-3), line 8 becomes line 7.
If we apply B first (lines 8-9), line 2 stays at line 2.
```

By applying from bottom to top, we avoid complex line number recalculation.

### D3: Reject Overlapping Ranges

**Decision**: If any two replacements in the array have overlapping line ranges, reject the entire request with an error.

**Rationale**: Overlapping ranges create ambiguity about which replacement takes precedence. Better to fail fast and let the LLM retry with non-overlapping ranges.

Overlap detection logic:
```typescript
function rangesOverlap(a: Replacement, b: Replacement): boolean {
  return a.replace_start_line <= b.replace_end_line && 
         b.replace_start_line <= a.replace_end_line;
}
```

### D4: Update Prompt Template

**Decision**: Update the prompt to explicitly request the array format:

```
Output rules:
Return valid JSON only. The response must contain a "replacements" array with one or more replacement objects:

{
  "replacements": [
    {
      "file": "<FILE_PATH>",
      "replace_start_line": <number>,
      "replace_end_line": <number>,
      "replacement": "<string>"
    }
  ]
}

Each replacement in the array should target a distinct, non-overlapping line range.
Apply multiple replacements only when they are logically independent changes
that don't depend on each other's line positions.

If the task cannot be completed within this file alone, return:
{
  "file": "<FILE_PATH>",
  "error": "OUT_OF_SCOPE_CHANGE_REQUIRED"
}
```

### D5: API Changes

**Decision**: No API changes required. The patch file is written with the final content after all replacements are applied.

The flow remains:
1. Client receives LLM response with `replacements` array
2. Client applies all replacements in-memory to get `patchedContent`
3. Client POSTs `{originalPath, content: patchedContent}` to `/sessions/:sid/patches`
4. Server writes patched content to `.mimo-patches/`

## Implementation Plan

### expert-utils.js Changes

1. Update `extractReplacement()` to:
   - Parse `{"replacements": [...]}` format
   - Parse legacy single-object format
   - Return normalized array of replacements
   - Validate array is non-empty
   - Validate each replacement has required fields

2. Add `applyReplacements()` function:
   - Sort replacements by `replace_start_line` descending
   - Detect overlapping ranges
   - Apply each replacement using existing `applyReplacement()` logic
   - Return final content or throw error on overlap

### edit-buffer.js Changes

1. Update `sendExpertInstruction()` prompt template to request array format
2. Update `handleExpertDiffReady()` to:
   - Call `extractReplacement()` (now returns array)
   - Call `applyReplacements()` instead of single `applyReplacement()`
   - Handle error cases (overlap, invalid format, etc.)

### Test Coverage

Update `expert-utils.test.ts`:
- Parse `{"replacements": [...]}` array format
- Parse legacy single-object format (backward compat)
- Apply single replacement via array
- Apply multiple non-overlapping replacements
- Reject overlapping replacement ranges
- Handle empty replacements array
- Handle missing required fields in replacement objects

## Data Flow

```
User submits instruction
    ↓
edit-buffer.js sends prompt with new array schema
    ↓
LLM returns {"replacements": [...]} or legacy format
    ↓
edit-buffer.js calls extractReplacement(llmResponse)
    ↓
Returns: Array<Replacement> (normalized)
    ↓
edit-buffer.js calls applyReplacements(originalContent, replacements)
    ↓
Validates: No overlaps, all required fields present
    ↓
Applies: From bottom to top (highest line first)
    ↓
Returns: patchedContent
    ↓
POST /sessions/:sid/patches with patchedContent
    ↓
PatchBuffer displays diff for review
```

## Error Handling

| Error Condition | Behavior |
|-----------------|----------|
| Overlapping ranges | Throw error: "Replacements have overlapping line ranges" |
| Empty replacements array | Throw error: "No replacements provided" |
| Missing required field | Throw error: "Invalid replacement: missing [field]" |
| Invalid line numbers | Throw error per existing single replacement logic |
| Legacy format | Convert to single-element array and proceed |

## Risks / Trade-offs

- **Prompt change**: The updated prompt may confuse older LLMs or those with limited context. Mitigation: clear examples in prompt.
- **Order sensitivity**: If replacements are not applied bottom-to-top, line numbers shift. Mitigation: explicit sorting in `applyReplacements()`.
- **Overlap edge cases**: Adjacent replacements (end_line of A == start_line of B) are NOT overlapping and should work fine.

## Testing Strategy

1. Unit tests in `expert-utils.test.ts`:
   - Parse both formats
   - Apply single and multiple replacements
   - Detect overlaps
   - Error cases

2. Integration: Verify end-to-end flow in browser with:
   - Single replacement (backward compat)
   - Two non-overlapping replacements
   - Three replacements at different file locations
