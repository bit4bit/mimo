## ADDED Requirements

### Requirement: Trigger file finder from @ keypress in chat prompt

The system SHALL open the file finder dialog when the user presses `@` in the chat prompt contentEditable input.

#### Scenario: @ keypress opens file finder

- **WHEN** the user presses `@` in the chat prompt contentEditable
- **THEN** the file finder dialog opens in mention mode
- **AND** the `@` character is NOT inserted into the prompt text

#### Scenario: File finder dismissed without selection

- **WHEN** the file finder opens in mention mode
- **AND** the user presses Escape or clicks outside
- **THEN** the file finder closes
- **AND** no text is inserted into the prompt

### Requirement: Insert file path into prompt on selection

The system SHALL insert `@path/to/file` at the cursor position in the chat prompt when the user selects a file from the mention-mode file finder.

#### Scenario: File selected from mention-mode file finder

- **WHEN** the file finder is open in mention mode
- **AND** the user selects a file with path `src/app.ts`
- **THEN** `@src/app.ts` is inserted at the cursor position in the prompt
- **AND** the file finder dialog closes
- **AND** the cursor is positioned after the inserted text

#### Scenario: Multiple @ mentions in one prompt

- **WHEN** the user types `fix ` then presses `@` and selects `src/a.ts`
- **AND** then types ` and ` then presses `@` and selects `src/b.ts`
- **THEN** the prompt text reads `fix @src/a.ts and @src/b.ts`

### Requirement: Backend resolves @ file references to content

The system SHALL parse `@path` tokens from chat messages and prepend the referenced file contents to the prompt before forwarding to the agent.

#### Scenario: Single file reference resolved

- **WHEN** a message contains `fix the bug in @src/app.ts`
- **AND** `src/app.ts` exists in the workspace
- **THEN** the content of `src/app.ts` is prepended to the prompt in a structured file block
- **AND** the original message text is forwarded after the file block

#### Scenario: Non-existent file reference left as-is

- **WHEN** a message contains `@nonexistent.ts`
- **AND** `nonexistent.ts` does not exist in the workspace
- **THEN** the message is forwarded unchanged with `@nonexistent.ts` as plain text

#### Scenario: Multiple file references resolved

- **WHEN** a message contains `compare @src/a.ts and @src/b.ts`
- **AND** both files exist
- **THEN** both file contents are prepended as separate file blocks
