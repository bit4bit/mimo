## MODIFIED Requirements

### Requirement: User can create an agent

The system SHALL allow users to create agents independently of sessions. Creating an agent requires a name and generates a JWT token that the user copies and uses to run mimo-agent locally.

#### Scenario: Create agent with name

- **WHEN** authenticated user submits agent creation form with name "MacBook Pro Dev"
- **THEN** system validates name is not empty and is 1-64 characters
- **AND** system generates JWT token with claims {agentId, owner, exp: 24h}
- **AND** system stores agent.yaml with {id, name, owner, token, status: "offline", startedAt}
- **AND** system displays agent creation confirmation with visible token
- **AND** system shows "Copy Token" button for easy copying

#### Scenario: Create agent with empty name rejected

- **WHEN** authenticated user submits agent creation form with empty name
- **THEN** system displays validation error "Name is required"
- **AND** system does not create agent record

#### Scenario: Create agent with whitespace-only name rejected

- **WHEN** authenticated user submits agent creation form with name " "
- **THEN** system displays validation error "Name is required"
- **AND** system does not create agent record

#### Scenario: Create agent with name too long rejected

- **WHEN** authenticated user submits agent creation form with name exceeding 64 characters
- **THEN** system displays validation error "Name must be 64 characters or less"
- **AND** system does not create agent record

#### Scenario: Token always visible

- **WHEN** user views agent detail page
- **THEN** system displays agent name in header
- **AND** system displays full token in plaintext
- **AND** system provides "Copy Token" functionality
- **AND** system does not allow token regeneration or revocation

#### Scenario: List agents for user shows names

- **WHEN** user navigates to agents page
- **THEN** system displays all agents owned by user
- **AND** system shows for each agent: name, status (online/offline), created timestamp
- **AND** system shows agent ID as secondary identifier
- **AND** status shows 🟢 for "online", 🔴 for "offline"

#### Scenario: View agent details shows name

- **WHEN** user clicks on agent from agents list
- **THEN** system displays agent detail modal/page
- **AND** system shows agent name as primary header
- **AND** system shows agent ID, status, created timestamp, last activity timestamp
- **AND** system shows full token with copy button
- **AND** system lists all sessions currently using this agent (via assignedAgentId)

#### Scenario: Click agent status badge from session shows name

- **WHEN** user clicks agent status badge in session detail page
- **THEN** system opens agent detail modal showing agent name and connection status
- **AND** user can copy token from the modal


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
