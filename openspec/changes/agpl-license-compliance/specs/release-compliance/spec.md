## ADDED Requirements

### Requirement: Release artifacts include license notices

All GitHub Releases SHALL include the AGPL-3.0 license text and a reference to the corresponding source code.

#### Scenario: Release workflow executes

- **WHEN** the release workflow is triggered by a `v*` tag
- **THEN** the draft release MUST include the `LICENSE` file as an attached artifact
- **AND** the release notes MUST contain a link to the source code repository

#### Scenario: Binary artifact downloaded

- **WHEN** a user downloads a compiled binary from a GitHub Release
- **THEN** the LICENSE file MUST be available in the same release
