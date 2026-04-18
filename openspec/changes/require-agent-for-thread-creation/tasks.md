## 1. Backend Validation

- [x] 1.1 Add failing test for `POST /sessions/:id/chat-threads` without `assignedAgentId` returning 400
- [x] 1.2 Update route validation in `packages/mimo-platform/src/sessions/routes.tsx` to require non-empty `assignedAgentId`
- [x] 1.3 Update existing thread creation tests to match required-agent behavior

## 2. Create-Thread UI Enforcement

- [x] 2.1 Remove optional agent flow (`None` option and optional label) from `packages/mimo-platform/public/js/chat-threads.js`
- [x] 2.2 Block submit when no agent is selected and show explicit validation alert
- [x] 2.3 Keep model/mode population behavior aligned with selected agent capabilities

## 3. Verification

- [x] 3.1 Run `bun test` in `packages/mimo-platform` and fix any regressions
