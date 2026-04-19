## Context

Expert mode currently uses line-number-based JSON replacements. The LLM returns:

```json
{
  "replacements": [
    {
      "file": "calc.py",
      "replace_start_line": 48,
      "replace_end_line": 54,
      "replacement": "..."
    }
  ]
}
```

This design fails in practice because LLMs miscount lines, leading to cascading corruption. We need a fundamentally different approach that doesn't rely on line numbers.

## Goals / Non-Goals

**Goals:**
- Eliminate line-number-based failures entirely
- Support replace, insert, and delete operations
- Handle multiple edits in one response
- Provide clear feedback when edits can't be applied
- Maintain backward compatibility during migration

**Non-Goals:**
- Multi-file editing
- Per-block interactive approval
- Semantic/AST-aware matching
- Deprecating JSON format in this change

## Decisions

### D1: SEARCH/REPLACE Block Format (Aider-style)

**Decision**: Use standard `<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE` delimiters.

**Rationale**:
- Proven at scale (Aider has processed millions of edits with this format)
- Human-readable and reviewable
- No line numbers = no miscounting
- Naturally supports insert, delete, replace via same syntax
- PatchBuffer already shows diffs, so the format aligns with review UX

```
<<<<<<< SEARCH
    def old_method(self):
        pass
=======
    def new_method(self):
        return 42
>>>>>>> REPLACE
```

### D2: Fuzzy Matching with Fallback Levels

**Decision**: Apply matching in 3 levels of strictness:

1. **Exact match** — byte-for-byte identical
2. **Whitespace-normalized** — ignore leading whitespace differences per line
3. **Partial match** — search within ±5 lines of the focus range

**Rationale**: LLMs sometimes slightly alter indentation or add/remove blank lines. Fuzzy matching handles these variations while still being safe. The ±5 line fallback handles cases where the LLM includes nearby context that moved.

```typescript
function findMatch(content: string, search: string, focusLine: number): MatchResult {
  // Level 1: Exact
  const exactIdx = content.indexOf(search);
  if (exactIdx !== -1) return { found: true, index: exactIdx };
  
  // Level 2: Whitespace-normalized
  const normalizedSearch = normalizeWhitespace(search);
  const normalizedContent = normalizeWhitespace(content);
  const fuzzyIdx = normalizedContent.indexOf(normalizedSearch);
  if (fuzzyIdx !== -1) return { found: true, index: fuzzyIdx };
  
  // Level 3: Search near focus line
  return searchNearLine(content, search, focusLine, radius = 5);
}
```

### D3: Sequential Application (Not Parallel)

**Decision**: Apply blocks in the order they appear in the response, not sorted by position.

**Rationale**: Unlike line-number-based replacements, SEARCH/REPLACE blocks don't have ordering issues because each block is self-locating. The LLM can place blocks in any order. Sequential application is simpler and matches user expectations.

### D4: Backward Compatibility — Dual Format Support

**Decision**: Support both SEARCH/REPLACE and JSON formats simultaneously during migration.

**Rationale**: This is a core mechanism change. We need a safe migration path:
1. Add SEARCH/REPLACE support alongside JSON
2. Update prompt to request SEARCH/REPLACE
3. Monitor for 2-4 weeks
4. Deprecate JSON in a future change

The `extractReplacement()` function returns a tagged union:
```typescript
type ReplacementFormat = 
  | { format: 'search_replace'; blocks: SearchReplaceBlock[] }
  | { format: 'json'; replacements: JsonReplacement[] };
```

### D5: Error Handling — Fail Fast with Context

**Decision**: If any block fails to match, abort the entire operation and return a detailed error.

**Rationale**: Partial application is dangerous — it could leave the file in an inconsistent state. Better to fail fast and let the user retry or decline.

Error messages include:
- Which block failed (1st, 2nd, etc.)
- The search text that wasn't found
- Suggestion: "The file may have changed since the LLM analyzed it"

## Data Flow

```
User submits instruction
    ↓
edit-buffer.js sends prompt with SEARCH/REPLACE examples
    ↓
LLM returns response with SEARCH/REPLACE blocks
    ↓
extractReplacement(response) detects format
    ↓
Format = 'search_replace' → extractSearchReplaceBlocks()
    ↓
Returns: Array<{search: string, replace: string}>
    ↓
applySearchReplaceBlocks(originalContent, blocks)
    ↓
For each block:
  - Find match (exact → fuzzy → partial)
  - Replace matched text with replacement text
    ↓
Returns: patchedContent or throws descriptive error
    ↓
POST /sessions/:sid/patches with patchedContent
    ↓
PatchBuffer displays diff for review
```

## Implementation Plan

### expert-utils.js Changes

1. **Add `extractSearchReplaceBlocks(response)`**:
   - Parse `<<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE` blocks
   - Strip `<details>` tags first
   - Handle multiple blocks
   - Return array of `{search, replace}` objects

2. **Add `applySearchReplaceBlock(content, block)`**:
   - Find exact match
   - If not found: try whitespace-normalized match
   - If not found: search within ±5 lines of focus range
   - Replace and return new content
   - Throw descriptive error if no match found

3. **Add `applySearchReplaceBlocks(content, blocks)`**:
   - Apply each block sequentially
   - Track content state across blocks
   - Abort on first failure

4. **Update `extractReplacement(response)`**:
   - Try SEARCH/REPLACE first
   - Fallback to JSON format
   - Return tagged union

5. **Update `applyReplacements(content, parsed)`**:
   - Route to `applySearchReplaceBlocks` or `applyReplacementsLegacy` based on format

### edit-buffer.js Changes

1. **Update prompt in `sendExpertInstruction()`**:
   - Replace line-number schema with SEARCH/REPLACE format
   - Include concrete examples (replace, insert, delete)
   - Emphasize: "Copy the EXACT old code into SEARCH block"

### Test Coverage

Update `expert-utils.test.ts`:
- Parse single SEARCH/REPLACE block
- Parse multiple blocks
- Apply exact match
- Apply fuzzy match (whitespace differences)
- Apply insertion (anchor pattern)
- Apply deletion (empty REPLACE)
- Handle not-found error
- Handle ambiguous match (multiple occurrences)
- Backward compatibility: JSON format
- Multiple blocks in one response

## Error Handling

| Error Condition | Behavior |
|-----------------|----------|
| SEARCH block not found | Try fuzzy match, then partial match. If still not found: throw "Could not find code to replace" |
| Ambiguous match (multiple exact matches) | Throw "Multiple matches found. Make search text more specific." |
| Empty SEARCH block | Throw "Empty search block" |
| Invalid block format (missing delimiters) | Skip invalid block, continue parsing others |
| Block application fails mid-way | Abort all changes, throw error with block number |

## Risks / Trade-offs

- **Prompt length**: SEARCH/REPLACE examples make the prompt longer. Mitigation: keep examples minimal and clear.
- **LLM compliance**: LLM must copy exact code. Mitigation: prompt emphasis + fuzzy matching handles minor variations.
- **Large replacements**: Replacing 100+ lines means large SEARCH block. Mitigation: this is rare; LLM prefers smaller changes.
- **Migration complexity**: Supporting dual formats temporarily increases code complexity. Mitigation: clean deprecation planned.

## Testing Strategy

1. Unit tests in `expert-utils.test.ts`:
   - Parsing: single block, multiple blocks, malformed blocks
   - Matching: exact, fuzzy, partial, not found, ambiguous
   - Application: replace, insert, delete, multiple blocks
   - Error cases: all error conditions
   - Backward compatibility: JSON format still works

2. Integration: Verify end-to-end flow in browser with:
   - Single replacement
   - Insertion with anchor
   - Multiple blocks
   - Error case (not found)
