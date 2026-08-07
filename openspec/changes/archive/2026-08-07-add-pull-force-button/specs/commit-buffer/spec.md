## MODIFIED Requirements

### Requirement: Sync Now and Force Push live inside the buffer

The system SHALL provide Sync Now, Pull Force, and Force Push buttons inside the Commit buffer footer. Sync Now posts to its existing REST route. Pull Force and Force Push are destructive operations that respect the repository selector: when a specific repository is selected only that repository is affected, and when "All repositories" is selected the operation fans out across every repository in the session, returning per-repository results.

#### Scenario: Sync Now

- **WHEN** the user clicks Sync Now inside the Commit buffer
- **THEN** a `POST /sessions/:sessionId/sync` request is issued
- **AND** the result is shown in `#commit-status`

#### Scenario: Pull Force button placement

- **WHEN** the session detail page renders
- **THEN** a `#pull-force-btn` button exists inside the Commit buffer footer, positioned to the left of `#force-push-btn`

#### Scenario: Pull Force with a specific repository selected

- **GIVEN** the repository selector is set to a specific repository `repo-A`
- **WHEN** the user clicks Pull Force
- **THEN** a confirmation dialog is shown naming `repo-A`
- **AND** upon confirmation a `POST /commits/:sessionId/pull-force` request is issued with `repoId` set to `repo-A`
- **AND** the result is shown in `#commit-status` and `#commit-repo-results`

#### Scenario: Pull Force with All repositories selected

- **GIVEN** the repository selector is set to "All repositories"
- **WHEN** the user clicks Pull Force
- **THEN** a confirmation dialog lists every repository in the session
- **AND** upon confirmation a `POST /commits/:sessionId/pull-force` request is issued without a `repoId`
- **AND** per-repository results are rendered in `#commit-repo-results`

#### Scenario: Pull Force cancelled

- **WHEN** the user cancels the confirmation dialog for Pull Force
- **THEN** no request is issued
- **AND** no repository is modified

#### Scenario: Force Push

- **WHEN** the user clicks Force Push inside the Commit buffer
- **THEN** a `POST /commits/:sessionId/push-force` request is issued
- **AND** the result is shown in `#commit-status`

#### Scenario: Force Push with a specific repository selected

- **GIVEN** the repository selector is set to a specific repository `repo-A`
- **WHEN** the user clicks Force Push
- **THEN** a `POST /commits/:sessionId/push-force` request is issued with `repoId` set to `repo-A`
- **AND** the result is shown in `#commit-status` and `#commit-repo-results`

#### Scenario: Force Push with All repositories selected

- **GIVEN** the repository selector is set to "All repositories" and the session has repositories `repo-A` and `repo-B`
- **WHEN** the user clicks Force Push
- **THEN** a `POST /commits/:sessionId/push-force` request is issued without a `repoId`
- **AND** the server force-pushes every repository in the session
- **AND** per-repository results are rendered in `#commit-repo-results`

#### Scenario: Force Push with All repositories renders per-repo results

- **GIVEN** a Force Push request was issued for "All repositories"
- **WHEN** the response is received
- **THEN** per-repository results are rendered in `#commit-repo-results` showing each repository's status