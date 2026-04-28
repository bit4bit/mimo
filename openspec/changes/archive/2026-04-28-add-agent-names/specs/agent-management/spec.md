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
- **WHEN** authenticated user submits agent creation form with name "   "
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
