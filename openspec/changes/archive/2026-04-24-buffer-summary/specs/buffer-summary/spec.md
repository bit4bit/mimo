## ADDED Requirements

### Requirement: Summary buffer exists in right frame
The system SHALL provide a `Summary` buffer registered in the right frame with id `summary` and display name `Summary`.

#### Scenario: Summary buffer appears as tab
- **WHEN** a session page is loaded
- **THEN** a `Summary` tab SHALL appear in the right frame tab bar

---

### Requirement: Thread selectors
The Summary buffer SHALL display two thread selectors:
- **Analyze**: the chat thread whose history will be summarized
- **Summarize via**: the chat thread whose agent performs the summarization

Both selectors SHALL list all available chat threads for the session, each showing its current state indicator (🟢 active, 🔴 disconnected, ⏳ waking).

#### Scenario: Selectors populated on load
- **WHEN** the Summary buffer becomes active
- **THEN** both selectors SHALL be populated with all session threads

#### Scenario: State indicator shown
- **WHEN** a thread is listed in either selector
- **THEN** its state indicator SHALL be displayed alongside its name

---

### Requirement: Refresh button triggers async summarization
The Summary buffer SHALL include a Refresh button. When pressed, the system SHALL:
1. Load the full history of the selected analyze thread in chronological order
2. Build a summarization prompt using the configured `summary.prompt` (or the default if not set)
3. Send the prompt + history to the agent of the selected summarize-via thread via ACP
4. Stream the response back to the client
5. Render the response in the buffer content area

#### Scenario: Successful summarization
- **WHEN** valid analyze and summarize-via threads are selected and Refresh is pressed
- **THEN** the buffer SHALL show an async progress indicator during processing
- **THEN** the buffer SHALL render the summary text when the response completes

#### Scenario: Summarize-via thread agent not active
- **WHEN** Refresh is pressed and the summarize-via thread has no active agent
- **THEN** the server SHALL return an error
- **THEN** the buffer SHALL display the error message inline (no summary rendered)

#### Scenario: Summary request appears in summarize-via thread
- **WHEN** a summarization is triggered
- **THEN** the full prompt and history SHALL appear as a message in the summarize-via thread's chat history (this is intentional)

---

### Requirement: Ephemeral summary output
The summary output SHALL be held in client JS memory only.

#### Scenario: Summary cleared on reload
- **WHEN** the session page is reloaded
- **THEN** the Summary buffer content area SHALL be empty (no previous summary persisted)

---

### Requirement: Configurable summarization prompt
The summarization prompt SHALL be configurable via `summary.prompt` in the global YAML config. If not set, the system SHALL use a built-in default prompt.

#### Scenario: Custom prompt used when configured
- **WHEN** `summary.prompt` is set in config.yaml
- **THEN** that prompt SHALL be used as the system instruction for summarization

#### Scenario: Default prompt used when not configured
- **WHEN** `summary.prompt` is not set in config.yaml
- **THEN** the system SHALL use the built-in default prompt:
  `Analyze the following conversation history in chronological order. Produce a concise structured summary covering: main topics discussed, decisions made, current state, and any open questions.`
