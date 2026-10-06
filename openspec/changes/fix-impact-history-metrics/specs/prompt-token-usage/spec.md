## ADDED Requirements

### Requirement: Agent reports per-turn token usage

mimo-agent SHALL include the ACP prompt response `usage` on the `prompt_completed` message when the provider reports it.

#### Scenario: Provider returns usage

- **WHEN** an ACP prompt turn resolves with `usage` (inputTokens, outputTokens, totalTokens, and optional thought/cache tokens)
- **THEN** the `prompt_completed` message sent to the platform SHALL include that `usage`

#### Scenario: Provider returns no usage

- **WHEN** an ACP prompt turn resolves without `usage`
- **THEN** the `prompt_completed` message SHALL be sent without a `usage` field

### Requirement: Platform accumulates session token usage

The platform SHALL add the token usage of each completed prompt turn into the session's pending token usage until the next commit.

#### Scenario: Usage accumulates across turns

- **WHEN** two `prompt_completed` messages with usage arrive for the same session
- **THEN** the session's pending token usage SHALL equal the sum of both turns

#### Scenario: Missing token fields count as zero

- **WHEN** a turn's usage omits optional fields such as thoughtTokens or cachedReadTokens
- **THEN** those fields SHALL be added as 0
