## Context

Agents in the mimo platform currently lack human-readable identifiers. The Agent schema stores `id` (UUID), `owner`, `token`, `status`, and session assignments - but no name. Users see agents in the UI as truncated UUIDs like "Agent: 550e8400..." which is indistinguishable from other agents.

Sessions already have a required `name` field (e.g., "Feature Branch", "Bug Fix Session") that serves as the primary identifier. Agents should follow this same pattern for consistency and usability.

The change affects three layers:
1. **Data Layer**: Agent repository stores name in agent.yaml
2. **Service Layer**: Agent creation requires name input
3. **UI Layer**: Forms, list views, and detail pages display names

## Goals / Non-Goals

**Goals:**
- Every agent has a human-readable name shown as primary identifier
- Agent creation requires name at form submission (validation)
- Names are 1-64 characters, alphanumeric with spaces/hyphens/underscores
- Existing agents get backfilled with generated names for continuity
- UI displays names prominently, IDs secondarily

**Non-Goals:**
- Editing agent names after creation (future enhancement)
- Uniqueness constraints (same user can have "Work Laptop" twice)
- Special character escaping beyond basic sanitization
- Search/filter by name (out of scope)

## Decisions

### Decision: Required at Creation (not optional)

**Options Considered:**
1. **Optional with auto-generated default** - Less friction, but leads to messy data like "Agent on hostname-12345"
2. **Optional with ID fallback** - Simpler migration, but inconsistent UX (some have names, some don't)
3. **Required at creation** - User must provide name, clean data from day one

**Chosen: Option 3 (Required)**

Rationale:
- Aligns with Session pattern (sessions require names)
- Forces thoughtful naming upfront
- No ambiguity in UI - every agent has a name
- Migration is one-time pain, clean data forever

### Decision: 64 Character Limit

**Options Considered:**
1. **No limit** - Risk of UI breakage with extremely long names
2. **255 characters** - Standard VARCHAR, but rarely needed
3. **64 characters** - Reasonable for most use cases, fits UI well

**Chosen: Option 3 (64 chars)**

Rationale:
- "MacBook Pro Dev" is 17 chars, "Work Laptop Personal Projects" is 31 chars
- 64 chars accommodates descriptive names without UI overflow
- Easy to validate client-side and server-side

### Decision: Backfill with "Agent {id.slice(0,8)}" Pattern

**Options Considered:**
1. **Leave name null, fallback in UI** - No migration, but inconsistent schema
2. **Require user to name existing agents on first view** - Interactive, but blocks usage
3. **Auto-generate from ID pattern** - Clean migration, users can edit later if needed

**Chosen: Option 3 (Auto-generate)**

Rationale:
- One-time migration script runs on startup
- Generated names are recognizable ("Agent 550e8400")
- Future "edit name" feature can let users rename
- Schema stays clean with no nulls

## Risks / Trade-offs

**[Risk] Breaking change for programmatic agent creation**
→ Mitigation: Update tests immediately; document in changelog that `createAgent()` now requires `name` parameter

**[Risk] UI layouts break with long names**
→ Mitigation: CSS `text-overflow: ellipsis` with max-width; 64 char limit prevents extreme cases

**[Risk] Migration failure on existing agents.yaml files**
→ Mitigation: Migration is additive only (adds missing field); does not modify existing names if present

**[Risk] Users create unhelpful names like "A" or "asdf"**
→ Mitigation: 1-char minimum enforces some effort; trust users to be descriptive; no AI validation needed

## Migration Plan

1. **Schema Update**: Add `name?: string` to AgentData interface (temporarily optional)
2. **Migration Script**: On app startup, iterate all agents:
   - If `name` missing, set to `Agent ${id.slice(0, 8)}`
3. **Code Update**: Make `name` required in CreateAgentInput
4. **Validation**: Add checks for empty/whitespace-only names (reject)
5. **Backfill Completion**: After migration, `name?:` becomes `name:` (required)

Rollback: Migration only adds field, never removes. Safe to rollback code; names remain in YAML files.
