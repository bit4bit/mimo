## ADDED Requirements

### Requirement: Owner can share an agent with another user

The system SHALL allow an agent's owner to grant another existing user permission to use the agent. A grant is recorded in the agent's `sharedWith` list as `{ username, permission: "use" }`. Only the owner may create grants.

#### Scenario: Share agent with an existing user

- **WHEN** the owner of an agent submits a share request naming an existing user "bob"
- **THEN** the system adds `{ username: "bob", permission: "use" }` to the agent's `sharedWith`
- **AND** the system persists the grant in `agent.yaml`
- **AND** "bob" now appears in the agent's shared-with list on the detail page

#### Scenario: Sharing with self is rejected

- **WHEN** the owner submits a share request naming themselves
- **THEN** the system rejects the request with a validation error
- **AND** the agent's `sharedWith` list is unchanged

#### Scenario: Sharing with a non-existent user is rejected

- **WHEN** the owner submits a share request naming a username that does not exist
- **THEN** the system rejects the request with a validation error
- **AND** the agent's `sharedWith` list is unchanged

#### Scenario: Sharing with an already-shared user is rejected

- **WHEN** the owner submits a share request naming a user already in `sharedWith`
- **THEN** the system rejects the request (no duplicate grant is created)
- **AND** the agent's `sharedWith` list contains exactly one grant for that user

#### Scenario: Non-owner cannot share an agent

- **WHEN** a user who is not the owner (including a user the agent is shared with) attempts to share the agent
- **THEN** the system rejects the request as unauthorized
- **AND** the agent's `sharedWith` list is unchanged

### Requirement: Owner can view and revoke shared access

The system SHALL display, to the owner, the list of users an agent is shared with, and SHALL allow the owner to revoke any grant. Revoking removes the grant from `sharedWith`.

#### Scenario: View shared-with list

- **WHEN** the owner views the agent detail page
- **THEN** the system displays a Share section listing each user the agent is shared with
- **AND** each entry provides a revoke control

#### Scenario: Revoke a user's access

- **WHEN** the owner revokes the grant for "bob"
- **THEN** the system removes "bob" from the agent's `sharedWith`
- **AND** the system persists the change in `agent.yaml`
- **AND** "bob" no longer appears in the shared-with list

#### Scenario: Non-owner cannot revoke

- **WHEN** a non-owner attempts to revoke any grant on the agent
- **THEN** the system rejects the request as unauthorized
- **AND** the agent's `sharedWith` list is unchanged

### Requirement: Use authorization predicate

The system SHALL determine whether a user may use an agent with a single rule: the user is the agent's owner, OR the user appears in the agent's `sharedWith` with permission `"use"`. This rule SHALL govern agent listing, chat-thread agent assignment, and runtime prompt routing.

#### Scenario: Owner is authorized

- **WHEN** authorization is evaluated for the agent's owner
- **THEN** the user is authorized to use the agent

#### Scenario: Shared user is authorized

- **WHEN** authorization is evaluated for a user present in `sharedWith` with permission "use"
- **THEN** the user is authorized to use the agent

#### Scenario: Unrelated user is not authorized

- **WHEN** authorization is evaluated for a user who is neither the owner nor in `sharedWith`
- **THEN** the user is not authorized to use the agent

### Requirement: Recipient can use a shared agent in chat threads

The system SHALL let a user who has been granted use of an agent assign that agent to their chat threads and run prompts through it, exactly as with an agent they own. The recipient's browser SHALL never receive the agent token.

#### Scenario: Shared agent appears in the chat-thread agent picker

- **WHEN** a user opens the agent picker while creating or configuring a chat thread
- **THEN** the system offers agents the user owns and agents shared with the user
- **AND** the system does not offer agents the user neither owns nor is shared

#### Scenario: Assigning an authorized agent to a thread succeeds

- **WHEN** a user creates a chat thread with `assignedAgentId` referencing an agent shared with them
- **THEN** the system accepts the assignment and creates the thread

#### Scenario: Assigning an unauthorized agent to a thread is rejected

- **WHEN** a user creates a chat thread with `assignedAgentId` referencing an agent they neither own nor are shared
- **THEN** the system rejects the request
- **AND** no thread is created with that agent

#### Scenario: Running a prompt on a shared agent routes to the agent

- **WHEN** a user sends a prompt on a thread assigned to an agent shared with them
- **THEN** the system routes the prompt to the agent connection
- **AND** the agent token is not exposed to the user's browser at any point

#### Scenario: Shared user can read the agent's capabilities

- **WHEN** a user the agent is shared with requests the agent's capabilities (to pick a model and mode)
- **THEN** the system returns the agent's available models and modes
- **AND** a user who neither owns nor is shared the agent is denied (not found)

### Requirement: Hard revocation enforced on next prompt

The system SHALL enforce revocation at prompt time. When a user runs a prompt on a thread whose assigned agent the user is no longer authorized to use, the system SHALL decline the prompt and post a system message to that thread informing the user they no longer have access. The thread SHALL NOT be closed, and in-flight prompts SHALL NOT be cancelled.

#### Scenario: Revoked user's next prompt is declined with a system message

- **GIVEN** "bob" has a chat thread assigned to an agent owned by "alice" and shared with "bob"
- **AND** "alice" revokes "bob"'s access
- **WHEN** "bob" sends his next prompt on that thread
- **THEN** the system does not route the prompt to the agent
- **AND** the system posts a system message to the thread stating that "bob" no longer has access to the agent
- **AND** the thread remains open

#### Scenario: Owner is never declined by revocation

- **WHEN** the owner sends a prompt on a thread assigned to their own agent
- **THEN** the system routes the prompt normally regardless of any `sharedWith` changes

### Requirement: User search for sharing autocomplete

The system SHALL provide an endpoint that returns usernames matching a query, to back the owner's share autocomplete. Results SHALL exclude the requesting user and, when an agent is specified, users already granted access to that agent.

#### Scenario: Search returns matching usernames

- **WHEN** an authenticated user requests user search with query "bo"
- **THEN** the system returns usernames matching "bo"
- **AND** the system does not include the requesting user's own username

#### Scenario: Search excludes already-shared users for an agent

- **WHEN** the owner requests user search in the context of an agent already shared with "bob"
- **THEN** the returned usernames do not include "bob"
