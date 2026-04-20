## 1. Data Layer — `packages/mimo-platform/src/sessions/repository.ts`

- [ ] 1.1 Add `priority: "high" | "medium" | "low"` to `Session` interface
- [ ] 1.2 Add `priority?: "high" | "medium" | "low"` to `CreateSessionInput` interface
- [ ] 1.3 Add `priority?: "high" | "medium" | "low"` to `UpdateSessionConfigInput` interface
- [ ] 1.4 Coerce missing `priority` to `"medium"` in session read/parse (same pattern as `mcpServerIds`)
- [ ] 1.5 Store `priority` in `session.yaml` on create (default `"medium"` if not provided)
- [ ] 1.6 Update `updateConfig()` to persist `priority` when provided
- [ ] 1.7 Extract `compareSessions()` pure comparator: priority weight asc, then `createdAt` desc
- [ ] 1.8 Apply `compareSessions()` in `listByProject()`
- [ ] 1.9 Apply `compareSessions()` in `listAll()`
- [ ] 1.10 Apply `compareSessions()` in `findByAssignedAgentId()`
- [ ] 1.11 Apply `compareSessions()` in `findByThreadAgentId()`

## 2. API Layer — `packages/mimo-platform/src/sessions/routes.tsx`

- [ ] 2.1 Extract `priority` from POST body in session creation route; pass to `repository.create()`
- [ ] 2.2 Validate priority enum in POST (reject 400 if value not in `{"high","medium","low"}`)
- [ ] 2.3 Extract `priority` from PATCH body in session config route; pass to `repository.updateConfig()`
- [ ] 2.4 Validate priority enum in PATCH (reject 400 if value not in `{"high","medium","low"}`)

## 3. UI — Session Creation — `packages/mimo-platform/src/components/SessionCreatePage.tsx`

- [ ] 3.1 Add priority `<select>` field with options High / Medium / Low, default Medium
- [ ] 3.2 Submit priority value in form POST body

## 4. UI — Session Settings — `packages/mimo-platform/src/components/SessionSettingsPage.tsx`

- [ ] 4.1 Add priority `<select>` field in editable settings section
- [ ] 4.2 Submit priority value in PATCH config request
- [ ] 4.3 Display current priority value pre-selected

## 5. UI — Session List — `packages/mimo-platform/src/components/SessionListPage.tsx` + `SessionList.tsx`

- [ ] 5.1 Add "Priority" column to DataTable in `SessionListPage.tsx`
- [ ] 5.2 Apply `compareSessions()` in `SessionList.tsx` client-side sort (replace existing `createdAt` sort)

## 6. Tests — `packages/mimo-platform/test/`

- [ ] 6.1 Write failing test: create session with `priority: "high"` → stored and returned correctly
- [ ] 6.2 Write failing test: create session without priority → defaults to `"medium"`
- [ ] 6.3 Write failing test: POST with invalid priority → 400
- [ ] 6.4 Write failing test: PATCH config with `priority: "low"` → persisted
- [ ] 6.5 Write failing test: session.yaml missing priority → reads as `"medium"`
- [ ] 6.6 Write failing test: list returns high before medium before low regardless of creation order
- [ ] 6.7 Write failing test: within same priority, newer session appears first
- [ ] 6.8 Confirm all tests pass after implementation

## 7. Verification

- [ ] 7.1 Run `cd packages/mimo-platform && bun test` — all tests pass
- [ ] 7.2 Manual: create session with High priority, verify it sorts to top of list
- [ ] 7.3 Manual: change existing session to Low, verify it moves to bottom
- [ ] 7.4 Manual: existing session (no priority in YAML) displays as Medium
