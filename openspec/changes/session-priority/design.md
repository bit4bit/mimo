## Context

Sessions are sorted by `createdAt` descending in all four list methods (`listByProject`, `listAll`, `findByAssignedAgentId`, `findByThreadAgentId`) and also in the UI components (`SessionList.tsx`, `SessionListPage.tsx`). The Session interface in `repository.ts` stores all persistent session fields in `session.yaml`.

The change touches three layers:
1. **Data layer**: Session interface + YAML persistence + backward-compat coercion on read
2. **API layer**: POST creation and PATCH config routes accept priority
3. **UI layer**: Creation form, settings page, list page

## Goals / Non-Goals

**Goals:**
- Every session has a priority (`high`, `medium`, or `low`)
- Priority is set at creation (optional, defaults to `medium`)
- Priority is editable via session settings after creation
- Session list sorts high → medium → low, then by `createdAt` desc within same priority
- Existing sessions without priority field silently coerce to `medium`

**Non-Goals:**
- Filtering sessions by priority
- Custom priority ordering beyond the three tiers
- Priority affecting agent scheduling or resource allocation
- Priority notifications or alerts

## Decisions

### Decision: Three tiers (not numeric)

**Options Considered:**
1. **Numeric priority (1-10)** - Flexible, but arbitrary values, hard to present in UI meaningfully
2. **Three named tiers** - Clear semantics, simple UI, easy to validate

**Chosen: Option 2 (three tiers)**

Rationale: Users think in terms of "this is urgent / normal / can wait", not in terms of numbers. Named tiers map directly to that mental model.

### Decision: Default to `medium`

Rationale: Most sessions are normal work. Requiring an explicit choice adds friction. Defaulting to `medium` means the list is unchanged for users who don't use the feature.

### Decision: Coerce missing field to `medium` on read (not migrate)

**Options Considered:**
1. **One-time migration script** - Writes `priority: medium` to all existing `session.yaml` files
2. **Coerce on read** - Missing field treated as `medium` in memory, written on next save

**Chosen: Option 2 (coerce on read)**

Rationale: Matches the existing pattern used for `mcpServerIds`, `acpStatus`, and `acpSessionId`. No migration script needed. Field gets persisted naturally the next time the session config is updated.

### Decision: Sort at repository level (not UI only)

Rationale: Repository is the authoritative source of ordering. UI components already re-sort client-side as a secondary measure, but the API response should already be correctly ordered.

## Sort Algorithm

Priority weight function (pure, injectable):
```
high   → 0
medium → 1
low    → 2
```

Comparator: `priorityWeight(a) - priorityWeight(b)` (ascending weight = high first), tiebreak `b.createdAt - a.createdAt` (newest first).

## Risks / Trade-offs

**[Risk] UI sort and repository sort diverge**
→ Mitigation: Extract shared `compareSessions()` comparator function used in both repository and UI component.

**[Risk] Invalid priority value stored in YAML**
→ Mitigation: API validation rejects values not in `{"high","medium","low"}`; coerce-on-read defaults unknown values to `"medium"`.
