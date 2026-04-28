## Context

The mimo system allows running multiple agents, each connecting to the platform via WebSocket. Each agent spawns an ACP (Agent Communication Protocol) provider process - either `opencode` or `claude`. 

Currently:
- Agents are created without a designated provider
- The `--provider` flag on mimo-agent defaults to "opencode"
- There's no validation that the running provider matches what was intended
- This allows a single agent token to be used with different providers on different runs

The goal is to make the platform the authority: when an agent is created, it's created FOR a specific provider, and the agent must honor that or fail to start.

## Goals / Non-Goals

**Goals:**
- Platform decides provider at agent creation time
- Agent token embeds the expected provider
- Agent validates its declared provider matches token on startup
- Clear error message when provider mismatch is detected
- Support multiple agents with different providers on same machine

**Non-Goals:**
- Runtime provider switching (out of scope)
- Provider capability negotiation
- Migration of existing agents (they'll need recreation)
- Changing provider for existing agents

## Decisions

### Decision: Include provider in JWT token payload

**Rationale**: JWT is already the trust boundary between platform and agent. Embedding provider there means:
- Agent can validate locally without network call
- Tampering is cryptographically prevented
- Simple implementation

**Alternative considered**: Platform-side validation via WebSocket message exchange
- Rejected: Requires network round-trip before rejection, adds complexity

### Decision: Make `--provider` required on mimo-agent

**Rationale**: Forces explicit intent at startup. The agent MUST declare what it thinks it's running.

### Decision: Validate BEFORE WebSocket connection

**Rationale**: Fail fast. No point connecting if we're going to reject anyway.

### Decision: Exit code 1 on mismatch

**Rationale**: Standard Unix error code, signals failure to any calling scripts/process managers.

## Risks / Trade-offs

**Risk**: Existing agent tokens don't have provider claim → Mitigation: Treat missing claim as "opencode" for backward compatibility during transition, but new agents MUST have explicit provider

**Risk**: JWT token size increases slightly → Mitigation: Negligible impact (one short string field)

**Risk**: Agent creation UI needs provider selection → Mitigation: This is desired behavior, forces explicit choice

## Migration Plan

1. Update mimo-platform to include provider in JWT (backward compatible - old agents still work)
2. Update mimo-agent to accept and validate required --provider flag
3. Update agent creation UI to require provider selection
4. Existing agents: will continue to work with "opencode" default until recreated

## Open Questions

None - design is complete.
