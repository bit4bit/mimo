# Spec: ExpertMode Integration with PatchBuffer

## Requirement: LLM prompt requests array of replacements

The system SHALL send a prompt that instructs the LLM to return a JSON object with a `replacements` array, where each element targets a specific line range in the file.

### Scenario: Prompt schema in outgoing message
- **WHEN** the user submits an expert instruction
- **THEN** the prompt sent to the LLM contains the output schema:
  ```
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
  ```
- **AND** the error schema remains:
  ```
  { "file": "<FILE_PATH>", "error": "OUT_OF_SCOPE_CHANGE_REQUIRED" }
  ```

---

## Requirement: ExpertMode parses the replacements array from LLM response

The system SHALL extract a `Replacement[]` from the LLM response using the updated `MIMO_EXPERT_UTILS.extractReplacement` function.

### Scenario: Valid multi-replacement response
- **GIVEN** the LLM returns `{"replacements": [{...}, {...}]}`
- **WHEN** `MIMO_EXPERT_UTILS.extractReplacement` is called with the response string
- **THEN** it returns an array of two `Replacement` objects

### Scenario: Single-element array is accepted
- **GIVEN** the LLM returns `{"replacements": [{...}]}`
- **WHEN** `MIMO_EXPERT_UTILS.extractReplacement` is called
- **THEN** it returns an array with one `Replacement` object

### Scenario: Error response is detected
- **GIVEN** the LLM returns `{"file": "calc.py", "error": "OUT_OF_SCOPE_CHANGE_REQUIRED"}`
- **WHEN** `MIMO_EXPERT_UTILS.extractReplacement` is called
- **THEN** it returns `null` or an object with `error` set
- **AND** ExpertMode shows an appropriate error status message

---

## Requirement: ExpertMode hands off to PatchBuffer after LLM response

The system SHALL create a backend PatchBuffer record and navigate to the PatchBuffer tab instead of rendering the diff inline.

### Scenario: Successful handoff
- **GIVEN** the LLM response contains a valid `replacements` array for `calc.py`
- **WHEN** `handleExpertDiffReady` processes the response
- **THEN** ExpertMode fetches the current file content from the server
- **AND** calls `POST /sessions/:sid/patch-buffers` with `{filePath, originalContent, replacements}`
- **AND** the PatchBuffer tab for `calc.py` is opened and activated
- **AND** ExpertMode resets its own state to `idle` (no longer owns the diff)

### Scenario: Backend patch creation fails
- **WHEN** `POST /sessions/:sid/patch-buffers` returns an error
- **THEN** ExpertMode shows an error status message
- **AND** ExpertMode state returns to `idle`
- **AND** no patch tab is opened

---

## Requirement: ExpertMode no longer renders inline diff

The system SHALL NOT enter `diff_preview` state or render `#expert-diff-preview` after this change is applied.

### Scenario: Inline diff elements are hidden after handoff
- **WHEN** ExpertMode has successfully handed off to PatchBuffer
- **THEN** `state.state` is `"idle"` (not `"diff_preview"`)
- **AND** `#expert-diff-preview` is not visible
- **AND** `#expert-actions` (old Apply/Reject buttons) are not visible
