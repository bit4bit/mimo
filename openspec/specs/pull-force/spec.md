# Specification: PullForce

## Purpose

Destructive pull-and-reset of the platform upstream mirror and the agent workspace to remote HEAD, discarding all local commits and uncommitted changes, with confirmation and multi-repository fan-out.

## Requirements

### Requirement: Pull Force button discards local state and aligns to remote

The system SHALL provide a "Pull Force" button inside the Commit buffer that, when invoked, pulls the latest changes from the remote branch and hard-resets both the platform upstream mirror and the agent workspace to the remote HEAD, discarding all local commits, uncommitted modifications, and untracked files for the targeted repository or repositories.

#### Scenario: Pull Force on a selected repository

- **GIVEN** the repository selector is set to a specific repository `repo-A`
- **WHEN** the user clicks Pull Force
- **THEN** a confirmation dialog is shown naming `repo-A` as the affected repository
- **AND** the dialog states that all local commits and changes will be discarded

#### Scenario: Pull Force with All repositories selected

- **GIVEN** the repository selector is set to "All repositories" and the session has repositories `repo-A`, `repo-B`, and `repo-C`
- **WHEN** the user clicks Pull Force
- **THEN** a confirmation dialog is shown listing `repo-A`, `repo-B`, and `repo-C` as the affected repositories
- **AND** the dialog states that all local commits and changes will be discarded in each repository

#### Scenario: Confirmation cancelled

- **GIVEN** the user clicked Pull Force and the confirmation dialog is open
- **WHEN** the user cancels the confirmation
- **THEN** no request is issued
- **AND** no repository is modified

#### Scenario: Confirmation accepted issues the request

- **GIVEN** the user clicked Pull Force and the confirmation dialog is open
- **WHEN** the user accepts the confirmation
- **THEN** a `POST /commits/:sessionId/pull-force` request is issued
- **AND** the request body includes the selected `repoId` when a specific repository is selected, or omits it when "All repositories" is selected

#### Scenario: Pull Force resets platform mirror and agent workspace

- **GIVEN** the user accepted the confirmation for a git repository
- **WHEN** the pull force executes
- **THEN** the platform upstream mirror for the targeted repository is reset to the remote HEAD
- **AND** the agent workspace for the targeted repository is reset to the remote HEAD
- **AND** untracked files in both paths are removed

#### Scenario: Pull Force updates the baseline to remote HEAD

- **GIVEN** a successful pull force on a repository
- **WHEN** the operation completes
- **THEN** the per-repo baseline is updated to the new remote HEAD
- **AND** a subsequent commit preview reflects the reset state rather than reporting every file as changed

#### Scenario: Fossil repository is unsupported

- **GIVEN** a targeted repository uses Fossil as its VCS type
- **WHEN** pull force is attempted for that repository
- **THEN** the repository is skipped
- **AND** a per-repo result with status `failed` and an explicit "not supported" error is returned
- **AND** other git repositories in the same fan-out are still processed

### Requirement: Pull Force result feedback

The system SHALL display the outcome of a Pull Force operation in the Commit buffer, including per-repository results when "All repositories" is targeted.

#### Scenario: Success feedback

- **GIVEN** a Pull Force request succeeded for one or more repositories
- **WHEN** the response is received
- **THEN** `#commit-status` shows a success message
- **AND** per-repository results are rendered in `#commit-repo-results` showing each repository's status

#### Scenario: Partial failure across repositories

- **GIVEN** a Pull Force request was issued for "All repositories" and some repositories succeeded while others failed
- **WHEN** the response is received
- **THEN** per-repository results are rendered in `#commit-repo-results` showing which repositories succeeded and which failed
- **AND** `#commit-status` indicates that some repositories failed

#### Scenario: Network or server error

- **GIVEN** a Pull Force request failed due to a network or server error
- **WHEN** the error is caught
- **THEN** `#commit-status` shows a failure message in an error color
- **AND** the Pull Force button is re-enabled

### Requirement: Pull Force button state during operation

The system SHALL disable the Pull Force button while a pull force operation is in progress and re-enable it after the operation completes.

#### Scenario: Button disabled during operation

- **WHEN** a Pull Force request is in flight
- **THEN** the Pull Force button is disabled
- **AND** the button text reflects the in-progress state

#### Scenario: Button re-enabled after completion

- **WHEN** the Pull Force request completes, whether it succeeded or failed
- **THEN** the Pull Force button is re-enabled and its label is restored