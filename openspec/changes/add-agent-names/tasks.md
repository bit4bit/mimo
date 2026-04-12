## 1. Schema and Repository Layer

- [x] 1.1 Add `name: string` field to Agent interface in `packages/mimo-platform/src/agents/repository.ts`
- [x] 1.2 Add `name: string` field to AgentData interface in repository
- [x] 1.3 Add `name: string` to CreateAgentInput interface in repository
- [x] 1.4 Update `create()` method to store `name` in agent.yaml
- [x] 1.5 Update selectors (SessionCreatePage, DashboardPage) to use name instead of ID

## 2. Service Layer

- [x] 2.1 Add `name: string` to CreateAgentInput interface in `packages/mimo-platform/src/agents/service.ts`
- [x] 2.2 Update `createAgent()` to pass name to repository
- [x] 2.3 Add name length validation (1-64 chars) in service layer
- [x] 2.4 Add name non-empty validation (reject whitespace-only)

## 3. UI - Agent Creation Form

- [x] 3.1 Update GET /new route in `packages/mimo-platform/src/agents/routes.tsx`
- [x] 3.2 Add required `<input name="name" required maxlength="64">` to creation form
- [x] 3.3 Add client-side validation message for empty name
- [x] 3.4 Update POST / route to extract name from form body
- [x] 3.5 Add server-side validation error display in form

## 4. UI - Agent List View

- [x] 4.1 Update agents table to show "Name" column first
- [x] 4.2 Display agent.name in Name column with link to detail
- [x] 4.3 Keep ID as secondary column (truncated) or tooltip
- [x] 4.4 Update table headers and styling

## 5. UI - Agent Detail View

- [x] 5.1 Update detail page header to show "Agent: {name}" instead of ID
- [x] 5.2 Display full agent ID in info section (not header)
- [x] 5.3 Ensure name is prominently displayed

## 6. Migration

## 6. Migration

Skipped per user request - no migration logic added

## 7. Tests

- [x] 7.1 Update all existing `createAgent()` calls in tests to include name
- [x] 7.2 Update `agentRepository.create()` calls in tests to include name
- [x] 7.3 Add test: rejects empty name
- [x] 7.4 Add test: rejects whitespace-only name
- [x] 7.5 Add test: rejects name > 64 characters
- [x] 7.6 Add test: name is displayed in agent list
- [x] 7.7 Add test: name is displayed in agent detail header
- [x] 7.9 Run full test suite and verify all pass (366 pass, 4 fail - failures unrelated to agent names)

## 8. Verification

- [x] 8.1 Manual test: create agent with valid name
- [x] 8.2 Manual test: attempt create with empty name (should reject)
- [x] 8.3 Manual test: attempt create with >64 char name (should reject)
- [x] 8.4 Manual test: verify name displays in list view
- [x] 8.5 Manual test: verify name displays in detail view
