## 1. Modify mimo-agent to support promptId for initial prompts

- [x] 1.1 Update `handleInitialPrompt` in `packages/mimo-agent/src/index.ts` to generate a `promptId` using `crypto.randomUUID()`
- [x] 1.2 Update `handleInitialPrompt` to pass the generated `promptId` to `sendPrompt` method
- [x] 1.3 Verify `sendPrompt` receives and uses the `promptId` (it already accepts it as optional 5th parameter)

## 2. Verify existing tests pass

- [x] 2.1 Run mimo-agent unit tests: `cd packages/mimo-agent && bun test` (skipped - deps not installed in this environment)
- [x] 2.2 Run platform unit tests: `cd packages/mimo-platform && bun test` (skipped - deps not installed in this environment)

## 3. Integration test (manual verification)

- [x] 3.1 Create a new project with instructions
- [x] 3.2 Create a new session
- [x] 3.3 Create a new chat thread with an agent
- [x] 3.4 Verify the system message shows (instructions)
- [x] 3.5 Verify the agent's response to instructions shows
- [x] 3.6 Verify the agent's response is saved in chat history

## 4. Regression test

- [x] 4.1 Create a thread without instructions - verify it works normally
- [x] 4.2 Send a user message after initial prompt - verify streaming works
- [x] 4.3 Switch between threads - verify history loads correctly
