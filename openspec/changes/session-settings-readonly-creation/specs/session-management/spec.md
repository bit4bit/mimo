## ADDED Requirements

### Requirement: Session settings page shows creation configuration as read-only
The system SHALL display creation-time session configuration values on the session settings page in a read-only section.

#### Scenario: Session with populated creation settings
- **WHEN** user opens settings for a session created with assigned agent, agent subpath, branch, and MCP server attachments
- **THEN** the page shows these fields in the Creation Settings section:
  - Session Name
  - Assigned Agent
  - Agent working directory
  - Branch
  - MCP Servers
  - Session Type
- **AND** each field shows the persisted creation-time value for that session
- **AND** the values are rendered as read-only text (no input/select/checkbox controls)

#### Scenario: Session with missing optional creation settings
- **WHEN** user opens settings for a session created without optional creation fields
- **THEN** the page shows these fallback labels:
  - Assigned Agent: `None`
  - Agent working directory: `Repository root`
  - Branch: `Not set`
  - MCP Servers: `None attached`
- **AND** no creation field is rendered as blank

#### Scenario: Runtime settings remain editable
- **WHEN** user opens the same session settings page
- **THEN** idle timeout remains editable through existing controls
- **AND** updating timeout behavior remains unchanged
