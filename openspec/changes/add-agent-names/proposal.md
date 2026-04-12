## Why

Agents currently display only UUIDs like "550e8400..." which are not human-friendly. Users cannot distinguish between their "Work Laptop" and "Personal MacBook" agents without memorizing UUIDs. This makes agent management confusing, especially when running multiple agents.

## What Changes

- Add `name` field to Agent schema (required string, 1-64 characters)
- **BREAKING**: Agent creation now requires a name - form rejects empty/missing names
- Update agent creation form to include required "Name" input field
- Display agent name in list view as primary identifier (showing UUID as secondary)
- Display agent name in detail view header instead of truncated UUID
- Update all existing tests to provide names in agent creation calls
- Add validation tests for name constraints (empty, too long, etc.)
- Backfill migration: existing agents without names get default "Agent {id.slice(0,8)}"

## Capabilities

### New Capabilities
<!-- No new capabilities - this extends existing agent-management -->

### Modified Capabilities
- `agent-management`: Agent creation now requires a name field. All agents must have human-readable names for identification.

## Impact

- **Agent schema**: Add `name: string` (required) to Agent interface
- **AgentRepository**: `CreateAgentInput` now requires `name`; `create()` stores name in agent.yaml
- **AgentService**: `CreateAgentInput` interface includes `name`
- **UI: Agent creation form**: Add required `<input name="name" required>` with validation
- **UI: Agent list page**: Replace "ID" column with "Name" column; show ID as secondary
- **UI: Agent detail page**: Show name in header: "Agent: {name}"
- **Tests**: Update all `createAgent()` calls to include name; add validation tests
- **Migration**: One-time backfill for existing agents to get default names
- **Dependencies**: None
- **Auth**: No changes
