# Specification: Expert Mode SEARCH/REPLACE

## Requirements

### R1: Parse SEARCH/REPLACE Blocks

The system SHALL parse one or more SEARCH/REPLACE blocks from LLM responses.

#### Block Format

```
<<<<<<< SEARCH
[exact old code to find]
=======
[new code to replace with]
>>>>>>> REPLACE
```

#### Scenario: Single block
- **GIVEN** LLM returns one SEARCH/REPLACE block
- **WHEN** `extractSearchReplaceBlocks()` is called
- **THEN** it returns an array with one `{search, replace}` object
- **AND** `search` contains the exact text between SEARCH and =======
- **AND** `replace` contains the exact text between ======= and REPLACE

#### Scenario: Multiple blocks
- **GIVEN** LLM returns two SEARCH/REPLACE blocks
- **WHEN** `extractSearchReplaceBlocks()` is called
- **THEN** it returns an array with two objects in order of appearance

#### Scenario: Blocks with surrounding text
- **GIVEN** LLM returns explanation text, then a block, then more text
- **WHEN** `extractSearchReplaceBlocks()` is called
- **THEN** it extracts only the block content, ignoring surrounding text

#### Scenario: No blocks found
- **GIVEN** LLM returns text without SEARCH/REPLACE delimiters
- **WHEN** `extractSearchReplaceBlocks()` is called
- **THEN** it returns an empty array

### R2: Apply Exact Match

The system SHALL apply SEARCH/REPLACE blocks using exact text matching by default.

#### Scenario: Exact match succeeds
- **GIVEN** file content contains the SEARCH text exactly
- **AND** a SEARCH/REPLACE block targets that text
- **WHEN** `applySearchReplaceBlocks()` is called
- **THEN** the SEARCH text is replaced with the REPLACE text
- **AND** all other content is preserved exactly

#### Scenario: Whitespace-sensitive
- **GIVEN** SEARCH text has specific indentation
- **WHEN** matching against file content
- **THEN** only exact matches (including whitespace) succeed at level 1

### R3: Apply Fuzzy Match (Level 2)

If exact match fails, the system SHALL try whitespace-normalized matching.

#### Scenario: Different indentation
- **GIVEN** SEARCH text has 4-space indentation
- **AND** file content has the same code with 2-space indentation
- **WHEN** exact match fails
- **THEN** whitespace-normalized match succeeds
- **AND** the replacement preserves the file's original indentation style

#### Scenario: Extra blank lines
- **GIVEN** SEARCH text has no trailing newline
- **AND** file content has the same code with a trailing blank line
- **WHEN** exact match fails
- **THEN** whitespace-normalized match succeeds

### R4: Apply Partial Match (Level 3)

If both exact and fuzzy fail, the system SHALL search near the focus range.

#### Scenario: Code moved slightly
- **GIVEN** SEARCH text is a function that moved down 2 lines due to prior edits
- **AND** focus range indicates the original location
- **WHEN** exact and fuzzy matches fail
- **THEN** the system searches within ±5 lines of the focus range
- **AND** if found, applies the replacement at the discovered location

### R5: Handle Multiple Blocks

The system SHALL apply multiple blocks sequentially.

#### Scenario: Two independent replacements
- **GIVEN** file content with two functions
- **AND** two SEARCH/REPLACE blocks targeting each function
- **WHEN** `applySearchReplaceBlocks()` is called
- **THEN** both replacements are applied
- **AND** the final content reflects both changes

#### Scenario: Insertion via anchor pattern
- **GIVEN** a SEARCH/REPLACE block where SEARCH and REPLACE share an anchor line
- **AND** new code is added after the anchor in REPLACE
- **WHEN** applied
- **THEN** the new code is inserted after the anchor without removing existing code

### R6: Support Deletion

An empty REPLACE block SHALL delete the matched SEARCH text.

#### Scenario: Delete a function
- **GIVEN** SEARCH block contains a function
- **AND** REPLACE block is empty
- **WHEN** applied
- **THEN** the function is removed from the file

### R7: Error Handling

The system SHALL provide clear errors for failure cases.

#### Scenario: SEARCH text not found
- **GIVEN** SEARCH text does not exist in the file
- **WHEN** all matching levels fail
- **THEN** throw: "Block N: Could not find the code to replace. The file may have changed."

#### Scenario: Ambiguous match
- **GIVEN** SEARCH text appears multiple times in the file
- **WHEN** exact match finds multiple occurrences
- **THEN** throw: "Block N: Multiple matches found. Make the search text more specific."

#### Scenario: Empty SEARCH block
- **GIVEN** SEARCH block has no content (only delimiters)
- **WHEN** parsed
- **THEN** throw: "Block N: Empty search block. Use insertion pattern with anchor line instead."

### R8: Backward Compatibility

The system SHALL continue to support the JSON replacement format.

#### Scenario: JSON format still works
- **GIVEN** LLM returns `{"replacements": [...]}` JSON
- **WHEN** `extractReplacement()` is called
- **THEN** it detects JSON format and returns `{format: 'json', replacements: [...]}`
- **AND** `applyReplacements()` applies using the existing JSON logic

#### Scenario: SEARCH/REPLACE takes precedence
- **GIVEN** response contains both SEARCH/REPLACE blocks and JSON
- **WHEN** `extractReplacement()` is called
- **THEN** SEARCH/REPLACE format is detected and used
- **AND** JSON is ignored

### R9: Block Content Preservation

The system SHALL preserve exact content within blocks.

#### Scenario: Special characters in code
- **GIVEN** SEARCH text contains quotes, backslashes, unicode
- **WHEN** parsed and applied
- **THEN** all special characters are preserved exactly

#### Scenario: Multi-line blocks
- **GIVEN** SEARCH text spans 20 lines
- **WHEN** parsed
- **THEN** all 20 lines are captured with original line endings

## API Specification

### extractSearchReplaceBlocks

**Signature**: `(response: string) => Array<{search: string, replace: string}> | null`

**Behavior**:
- Strips `\u003cdetails\u003e...\u003c/details\u003e` tags first
- Finds all `<<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE` patterns
- Returns array of `{search, replace}` objects
- Returns `null` if parsing fails entirely
- Returns empty array if no blocks found

### applySearchReplaceBlock

**Signature**: `(content: string, block: {search: string, replace: string}, focusLine?: number) => string`

**Parameters**:
- `content`: Original file content
- `block`: `{search, replace}` object
- `focusLine`: Optional expected line number for fallback search

**Returns**: Modified content with replacement applied

**Throws**:
- `"Could not find code to replace"` — search text not found
- `"Multiple matches found"` — ambiguous exact match
- `"Empty search block"` — search text is empty

**Matching Algorithm**:
1. Exact match: `content.indexOf(search)`
2. Whitespace-normalized: compare after stripping leading whitespace per line
3. Partial match: search within ±5 lines of `focusLine`

### applySearchReplaceBlocks

**Signature**: `(content: string, blocks: Array<{search: string, replace: string}>) => string`

**Behavior**:
- Applies blocks sequentially in array order
- Each block operates on the result of the previous block
- Aborts on first failure and throws error with block number

## Test Scenarios

### T1: Parse Single Block
```typescript
const response = `
Some explanation text.

<<<<<<< SEARCH
    def old():
        pass
=======
    def new():
        return 42
>>>>>>> REPLACE

More text.
`;

const blocks = extractSearchReplaceBlocks(response);
expect(blocks).toHaveLength(1);
expect(blocks[0].search).toBe("    def old():\n        pass");
expect(blocks[0].replace).toBe("    def new():\n        return 42");
```

### T2: Apply Exact Match
```typescript
const content = "line1\n    def old():\n        pass\nline4";
const block = {
  search: "    def old():\n        pass",
  replace: "    def new():\n        return 42"
};

const result = applySearchReplaceBlock(content, block);
expect(result).toBe("line1\n    def new():\n        return 42\nline4");
```

### T3: Apply Insertion (Anchor Pattern)
```typescript
const content = "line1\n    def existing():\n        pass\nline4";
const block = {
  search: "    def existing():\n        pass",
  replace: "    def existing():\n        pass\n\n    def inserted():\n        return 42"
};

const result = applySearchReplaceBlock(content, block);
expect(result).toBe("line1\n    def existing():\n        pass\n\n    def inserted():\n        return 42\nline4");
```

### T4: Apply Deletion
```typescript
const content = "line1\n    def remove_me():\n        pass\nline4";
const block = {
  search: "    def remove_me():\n        pass",
  replace: ""
};

const result = applySearchReplaceBlock(content, block);
expect(result).toBe("line1\nline4");
```

### T5: Fuzzy Match (Whitespace)
```typescript
const content = "line1\n  def old():\n    pass\nline4";  // 2-space indent
const block = {
  search: "    def old():\n        pass",  // 4-space indent in search
  replace: "    def new():\n        return 42"
};

const result = applySearchReplaceBlock(content, block);
expect(result).toContain("def new()");
```

### T6: Multiple Blocks
```typescript
const content = "func_a\nfunc_b\nfunc_c";
const blocks = [
  { search: "func_a", replace: "func_A" },
  { search: "func_c", replace: "func_C" }
];

const result = applySearchReplaceBlocks(content, blocks);
expect(result).toBe("func_A\nfunc_b\nfunc_C");
```

### T7: Not Found Error
```typescript
const content = "line1\nline2";
const block = { search: "nonexistent", replace: "new" };

expect(() => applySearchReplaceBlock(content, block))
  .toThrow("Could not find code to replace");
```

### T8: Backward Compatibility
```typescript
const response = JSON.stringify({
  replacements: [{
    file: "test.ts",
    replace_start_line: 2,
    replace_end_line: 2,
    replacement: "new"
  }]
});

const parsed = extractReplacement(response);
expect(parsed.format).toBe("json");
```

## UI/UX Considerations

- PatchBuffer diff view naturally handles SEARCH/REPLACE changes
- Error messages are shown in EditBuffer status area
- Multiple blocks produce a single diff in PatchBuffer (combined changes)

## Keyboard Shortcuts

No changes to keyboard shortcuts. Existing shortcuts remain:
- `Alt+Shift+E`: Toggle expert mode
- `Enter`: Show instruction input
- `Ctrl+Enter`: Send instruction
