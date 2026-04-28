## 1. Data model

- [x] 1.1 Add `agentSubpath?: string` to the `Session` interface in `packages/mimo-platform/src/sessions/repository.ts`
- [x] 1.2 Persist `agentSubpath` to `session.yaml` in `sessionRepository.create()` (write the field when it's defined)
- [x] 1.3 Read `agentSubpath` from `session.yaml` in `sessionRepository.findById()` and `findByAssignedAgentId()`

## 2. Session creation route

- [x] 2.1 Read `agentSubpath` from the form body in `packages/mimo-platform/src/sessions/routes.tsx` and pass it to `sessionRepository.create()`

## 3. Session creation UI

- [x] 3.1 Add an optional "Agent working directory" text input to `packages/mimo-platform/src/components/SessionCreatePage.tsx` with placeholder `packages/backend` and a short hint that this is relative to the repository root

## 4. Platform → Agent message

- [x] 4.1 Include `agentSubpath` in the `sessionsReady` entry built in `handleAgentMessage` (`case "agent_ready"`) in `packages/mimo-platform/src/index.tsx` (alongside `acpSessionId`, `localDevMirrorPath`, etc.)

## 5. Agent ACP initialization

- [x] 5.1 Read `agentSubpath` from the session data received in `handleSessionReady` in `packages/mimo-agent/src/index.ts`
- [x] 5.2 Compute `acpCwd = agentSubpath ? join(checkoutPath, agentSubpath) : checkoutPath` and pass it to `acpClient.initialize()` instead of `sessionInfo.checkoutPath`
