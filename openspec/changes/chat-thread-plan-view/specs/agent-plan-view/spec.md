## ADDED Requirements

### Requirement: Per-thread plan state from ACP plan updates

The system SHALL maintain an in-memory agent plan keyed by `chatThreadId`, derived from ACP `plan` session updates. Each `plan` update SHALL replace the owning thread's plan entries in their entirety (never append). The owning thread SHALL be resolved from the update's prompt using the existing prompt-to-thread routing, falling back to the session's active chat thread when no prompt mapping exists.

#### Scenario: Plan update stored for its thread

- **WHEN** an ACP `plan` update with entries arrives for a prompt belonging to chat thread T
- **THEN** the system stores those entries as thread T's current plan

#### Scenario: Subsequent plan update replaces the previous one entirely

- **WHEN** thread T already has a stored plan
- **AND** a new `plan` update arrives for thread T
- **THEN** the system discards the previous entries and stores the new entries as thread T's plan

#### Scenario: Plan update routed to the correct thread

- **WHEN** a session has multiple chat threads with in-flight prompts
- **AND** a `plan` update arrives for the prompt belonging to thread T
- **THEN** only thread T's plan is updated, leaving other threads' plans unchanged

#### Scenario: Unresolvable plan update is dropped, not misattributed

- **WHEN** a `plan` update arrives whose prompt cannot be resolved to a chat thread and the session has no active chat thread
- **THEN** the system drops the update rather than attributing it to an arbitrary thread

### Requirement: Plan is not persisted to chat history

The system SHALL keep the per-thread plan as in-memory state only. The plan SHALL NOT be written to the chat message transcript (JSONL) and SHALL NOT be included in the assembled assistant message content.

#### Scenario: Turn completion does not persist the plan

- **WHEN** a turn completes and the assistant message is saved to history
- **THEN** the saved message content contains no plan entries
- **AND** the plan remains available only as in-memory thread state

#### Scenario: Plan survives reload but not restart

- **WHEN** the client reloads or reconnects while the server process is running
- **THEN** the thread's current plan is still available
- **AND** **WHEN** the server process restarts, the plan is gone (no history replay)

### Requirement: Plan keep-last-snapshot lifecycle

The system SHALL retain a thread's plan across turns and thread switches until a newer `plan` update replaces it or the session is cleared. The plan SHALL NOT be auto-wiped at turn end. Clearing the session SHALL wipe the affected thread's plan.

#### Scenario: Plan persists after the turn ends

- **WHEN** a turn that produced a plan completes
- **THEN** the thread's plan remains stored and viewable

#### Scenario: Clear session wipes the plan

- **WHEN** the session (or chat thread) is cleared
- **THEN** the affected thread's stored plan is removed

#### Scenario: New plan overrides a stale one

- **WHEN** a thread shows a completed plan from a prior turn
- **AND** a new turn emits a fresh `plan` update
- **THEN** the stale plan is replaced by the new entries

### Requirement: Plan right-frame buffer

The system SHALL provide a "Plan" buffer in the right frame, registered as a sibling to the MCP tab. The buffer SHALL render the active chat thread's plan entries, each showing its status (`pending`, `in_progress`, `completed`) and priority (`high`, `medium`, `low`). When the active thread has no plan, the buffer SHALL show an empty state.

#### Scenario: Plan tab is available in the right frame

- **WHEN** the session detail page renders the right frame
- **THEN** a "Plan" tab appears alongside the existing right-frame tabs including MCP

#### Scenario: Plan entries render with status and priority

- **WHEN** the active thread has plan entries
- **AND** the Plan buffer is open
- **THEN** each entry is shown with its content, status indicator, and priority

#### Scenario: Empty state when no plan exists

- **WHEN** the active thread has no stored plan
- **AND** the Plan buffer is open
- **THEN** the buffer shows an empty / no-plan state

### Requirement: Plan snapshot on thread switch

The system SHALL deliver the newly active chat thread's current plan when the user switches threads or opens the Plan buffer, including when no turn is currently streaming.

#### Scenario: Switching to a thread shows that thread's plan

- **WHEN** the user switches from thread A to thread B
- **AND** thread B has a stored plan
- **THEN** the Plan buffer shows thread B's plan

#### Scenario: Switching to a thread without a plan shows empty

- **WHEN** the user switches to a thread that has no stored plan
- **THEN** the Plan buffer shows the empty state

#### Scenario: Plan is available while idle

- **WHEN** the Plan buffer opens for a thread whose last turn has already completed
- **THEN** the buffer shows the thread's last plan snapshot without requiring an active stream

### Requirement: Live plan updates during a turn

The system SHALL push `plan` updates to the open Plan buffer for the active chat thread while a turn is streaming, so the displayed plan reflects progress in near real time.

#### Scenario: Open buffer updates live

- **WHEN** the Plan buffer is open for the active thread
- **AND** a `plan` update arrives for that thread during a turn
- **THEN** the buffer re-renders with the updated entries

#### Scenario: Update for a non-active thread does not change the current view

- **WHEN** a `plan` update arrives for a thread that is not the active thread
- **THEN** the stored plan for that thread is updated
- **AND** the currently displayed plan view does not change
