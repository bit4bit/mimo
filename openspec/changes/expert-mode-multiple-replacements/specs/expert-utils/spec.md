# Specification: Expert Mode Multiple Replacements

## Requirements

### R1: Parse Replacements Array

The system SHALL support parsing an LLM response containing a `replacements` array.

#### Scenario: Valid array format
- **GIVEN** the LLM returns `{"replacements": [{...}, {...}]}`
- **WHEN** `MIMO_EXPERT_UTILS.extractReplacement()` is called
- **THEN** it returns an array of `Replacement` objects

#### Scenario: Single-element array
- **GIVEN** the LLM returns `{"replacements": [{...}]}`
- **WHEN** `extractReplacement()` is called
- **THEN** it returns an array with one `Replacement` object

### R2: Backward Compatibility

The system SHALL continue to support the legacy single-object format.

#### Scenario: Legacy format still works
- **GIVEN** the LLM returns `{"file": "...", "replace_start_line": 1, "replace_end_line": 2, "replacement": "..."}`
- **WHEN** `extractReplacement()` is called
- **THEN** it returns an array containing the single `Replacement` object

### R3: Apply Multiple Replacements

The system SHALL apply all replacements in the array to produce the final patched content.

#### Scenario: Multiple non-overlapping replacements
- **GIVEN** original content with 50 lines
- **AND** replacements array with:
  - Replacement A: lines 5-7
  - Replacement B: lines 20-22
  - Replacement C: lines 40-42
- **WHEN** `applyReplacements()` is called
- **THEN** all three replacements are applied
- **AND** the final content reflects all changes

#### Scenario: Apply in correct order
- **GIVEN** replacements at lines 5-7 and lines 20-22
- **WHEN** `applyReplacements()` executes
- **THEN** the replacement at lines 20-22 is applied first (higher line numbers first)
- **AND** then the replacement at lines 5-7 is applied
- **AND** line numbers remain correct

### R4: Detect Overlapping Ranges

The system SHALL reject replacements with overlapping line ranges.

#### Scenario: Overlapping ranges detected
- **GIVEN** replacements array with:
  - Replacement A: lines 10-15
  - Replacement B: lines 12-18 (overlaps with A)
- **WHEN** `applyReplacements()` is called
- **THEN** it throws an error: "Replacements have overlapping line ranges"

#### Scenario: Adjacent ranges allowed
- **GIVEN** replacements array with:
  - Replacement A: lines 10-15
  - Replacement B: lines 16-20 (adjacent, not overlapping)
- **WHEN** `applyReplacements()` is called
- **THEN** both replacements are applied successfully
- **AND** no error is thrown

### R5: Validate Replacement Objects

Each replacement object SHALL have required fields.

#### Scenario: Missing required field
- **GIVEN** a replacement object missing `replace_start_line`
- **WHEN** `applyReplacements()` is called
- **THEN** it throws an error: "Invalid replacement: missing replace_start_line"

#### Scenario: Invalid line number
- **GIVEN** a replacement with `replace_start_line: 0` (must be >= 1)
- **WHEN** `applyReplacements()` is called
- **THEN** it throws an error: "Invalid replacement: replace_start_line must be >= 1"

### R6: Update Prompt Template

The expert mode prompt SHALL request the array format.

#### Scenario: Prompt includes array schema
- **WHEN** the user submits an expert instruction
- **THEN** the prompt sent to the LLM contains the output schema with `replacements` array
- **AND** the prompt explains that multiple non-overlapping replacements are allowed

### R7: Error Response Handling

The system SHALL handle error responses correctly.

#### Scenario: Out of scope error
- **GIVEN** the LLM returns `{"file": "...", "error": "OUT_OF_SCOPE_CHANGE_REQUIRED"}`
- **WHEN** `extractReplacement()` is called
- **THEN** it returns an object with `error` field set
- **AND** `handleExpertDiffReady()` displays the appropriate error message

#### Scenario: Empty replacements array
- **GIVEN** the LLM returns `{"replacements": []}`
- **WHEN** `extractReplacement()` is called
- **THEN** it throws an error: "No replacements provided"

## API Specification

### MIMO_EXPERT_UTILS.extractReplacement

**Signature**: `(response: string) => Replacement[] | {error: string} | null`

**Behavior**:
- Parses `{"replacements": [...]}` format
- Parses legacy single-object format and wraps in array
- Returns normalized array of replacements
- Returns `{error: string}` for error responses
- Returns `null` for unparseable responses

### MIMO_EXPERT_UTILS.applyReplacements (NEW)

**Signature**: `(content: string, replacements: Replacement[]) => string`

**Parameters**:
- `content`: Original file content
- `replacements`: Array of replacement objects

**Returns**: Modified content with all replacements applied

**Throws**:
- `"No replacements provided"` — if array is empty
- `"Invalid replacement: missing [field]"` — if required field missing
- `"Invalid replacement: [field] must be >= 1"` — if line number < 1
- `"Replacements have overlapping line ranges"` — if any ranges overlap

**Replacement Object Schema**:
```typescript
interface Replacement {
  file: string;              // File path (for validation)
  replace_start_line: number; // 1-based, inclusive
  replace_end_line: number;   // 1-based, inclusive
  replacement: string;         // New content (may contain newlines)
}
```

## Test Scenarios

### T1: Parse Array Format
```typescript
const response = JSON.stringify({
  replacements: [
    { file: "test.ts", replace_start_line: 5, replace_end_line: 7, replacement: "// A" },
    { file: "test.ts", replace_start_line: 20, replace_end_line: 22, replacement: "// B" }
  ]
});
const result = extractReplacement(response);
expect(result).toHaveLength(2);
expect(result[0].replace_start_line).toBe(5);
expect(result[1].replace_start_line).toBe(20);
```

### T2: Backward Compatibility
```typescript
const response = JSON.stringify({
  file: "test.ts",
  replace_start_line: 10,
  replace_end_line: 12,
  replacement: "// new"
});
const result = extractReplacement(response);
expect(result).toHaveLength(1);
expect(result[0].replace_start_line).toBe(10);
```

### T3: Apply Multiple Replacements
```typescript
const content = "line1\nline2\nline3\nline4\nline5";
const replacements = [
  { file: "test.ts", replace_start_line: 2, replace_end_line: 2, replacement: "new2" },
  { file: "test.ts", replace_start_line: 4, replace_end_line: 4, replacement: "new4" }
];
const result = applyReplacements(content, replacements);
expect(result).toBe("line1\nnew2\nline3\nnew4\nline5");
```

### T4: Detect Overlapping Ranges
```typescript
const content = "line1\nline2\nline3\nline4\nline5";
const replacements = [
  { file: "test.ts", replace_start_line: 2, replace_end_line: 3, replacement: "A" },
  { file: "test.ts", replace_start_line: 3, replace_end_line: 4, replacement: "B" }
];
expect(() => applyReplacements(content, replacements))
  .toThrow("Replacements have overlapping line ranges");
```

### T5: Adjacent Ranges Allowed
```typescript
const content = "line1\nline2\nline3\nline4\nline5";
const replacements = [
  { file: "test.ts", replace_start_line: 2, replace_end_line: 2, replacement: "A" },
  { file: "test.ts", replace_start_line: 3, replace_end_line: 3, replacement: "B" }
];
const result = applyReplacements(content, replacements);
expect(result).toBe("line1\nA\nB\nline4\nline5");
```

### T6: Empty Array Error
```typescript
const content = "line1\nline2";
const replacements = [];
expect(() => applyReplacements(content, replacements))
  .toThrow("No replacements provided");
```

### T7: Missing Required Field
```typescript
const content = "line1\nline2";
const replacements = [
  { file: "test.ts", replace_end_line: 2, replacement: "new" } // missing replace_start_line
];
expect(() => applyReplacements(content, replacements))
  .toThrow("Invalid replacement: missing replace_start_line");
```

### T8: Invalid Line Number
```typescript
const content = "line1\nline2";
const replacements = [
  { file: "test.ts", replace_start_line: 0, replace_end_line: 1, replacement: "new" }
];
expect(() => applyReplacements(content, replacements))
  .toThrow("Invalid replacement: replace_start_line must be >= 1");
```

## UI/UX Considerations

When multiple replacements are applied:
- PatchBuffer displays the combined diff showing all changes
- The user approves/declines the entire set of changes
- No per-replacement selection UI (out of scope)

## Keyboard Shortcuts

No changes to keyboard shortcuts. Existing shortcuts remain:
- `Alt+Shift+E`: Toggle expert mode
- `Enter`: Show instruction input
- `Ctrl+Enter`: Send instruction
