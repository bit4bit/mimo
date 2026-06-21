## MODIFIED Requirements

### Requirement: List agents for user

The system SHALL display, on the agents page, every agent the user owns **and** every agent shared with the user. Shared agents SHALL be visually distinguished from owned agents and SHALL not offer owner-only actions.

#### Scenario: List shows owned and shared agents

- **WHEN** a user navigates to the agents page
- **THEN** the system displays all agents owned by the user
- **AND** the system displays all agents shared with the user
- **AND** each agent shows name and status (online/offline)

#### Scenario: Shared agents are marked and read-only in the list

- **WHEN** the agents list includes an agent shared with the user (not owned)
- **THEN** the system marks the agent as shared (indicating the owner)
- **AND** the system does not offer delete or other owner-only actions for that agent

#### Scenario: A user's own agents remain unaffected

- **WHEN** a user with no shared agents views the agents page
- **THEN** the system displays only the agents they own

### Requirement: View agent details

The system SHALL show an agent detail page to the owner and to users the agent is shared with. Owner-only sections — the token, refresh-capabilities, delete, and sharing management — SHALL be visible only to the owner. A shared (non-owner) viewer SHALL see identity, status, provider, capabilities, and sessions, and SHALL NOT see the token or any owner-only action.

#### Scenario: Owner sees full detail including token and sharing

- **WHEN** the owner views the agent detail page
- **THEN** the system displays name, id, status, provider, timestamps, and capabilities
- **AND** the system displays the token with a copy control
- **AND** the system displays the Share section (add/list/revoke)
- **AND** the system displays refresh and delete actions

#### Scenario: Shared user sees a read-only detail page without the token

- **WHEN** a user the agent is shared with views the agent detail page
- **THEN** the system displays name, id, status, provider, timestamps, and capabilities
- **AND** the system does not display the token
- **AND** the system does not display the Share section
- **AND** the system does not display refresh or delete actions

#### Scenario: Unrelated user cannot view the agent

- **WHEN** a user who neither owns nor is shared the agent requests the detail page
- **THEN** the system does not reveal the agent (returns not found)
