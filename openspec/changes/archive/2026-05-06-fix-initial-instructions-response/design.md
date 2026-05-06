## Context

The issue is in the message flow between the platform and mimo-agent when handling initial instructions:

### Current Flow (Broken)

1. **Platform** → **mimo-agent**: Sends `initial_prompt` with `sessionId`, `chatThreadId`, and `content` (no `promptId`)
2. **mimo-agent**: Calls `sendPrompt(acpClient, sessionId, chatThreadId, content)` - note: no `promptId` parameter passed
3. **mimo-agent** → **LLM**: Sends instructions via ACP
4. **LLM** → **mimo-agent**: Returns streaming response (thought chunks, message chunks)
5. **mimo-agent** → **Platform**: Sends `message_chunk`, `thought_chunk`, etc. (no `promptId` in these messages)
6. **Platform** (`AgentMessageRouter`): Calls `requirePromptId(data, "message_chunk")` which returns `null`
7. **Platform**: Silently drops the message chunk with warning log

### User Impact

User sees:
- ✅ System message: "Before performing any task, try to locate and read the file `AGENTS.md`..."
- ❌ No agent response

### Root Cause

The streaming pipeline in `AgentMessageRouter` was designed to require `promptId` for tracking, but `initial_prompt` was implemented as a fire-and-forget message without a tracking ID. This creates a mismatch where responses cannot flow back through the pipeline.

## Goals / Non-Goals

**Goals:**
- Ensure agent responses to initial instructions are displayed to users
- Maintain compatibility with existing streaming pipeline
- Keep changes minimal and focused

**Non-Goals:**
- Redesigning the streaming architecture
- Adding new message types
- Changing the ACP protocol

## Decisions

### Decision 1: Generate promptId in mimo-agent, not platform

**Rationale**: The platform already has a clear separation - it sends the prompt to the agent and the agent is responsible for managing the conversation with the LLM. The agent should generate the `promptId` just like it does for user messages.

**Alternative considered**: Have the platform generate the `promptId` and include it in `initial_prompt`. This would require changes in two places (platform and agent) and introduces a potential race condition if the LLM responds before the ID is acknowledged.

### Decision 2: Use the same promptId format as user messages

**Rationale**: Consistency. The `promptId` will be a UUID generated via `crypto.randomUUID()`, matching the format used for user messages.

### Decision 3: Don't persist promptId for initial prompts beyond the single response

**Rationale**: Unlike user messages which may have multiple exchanges (user asks, agent responds, user follows up), initial prompts are a one-time initialization. We only need the `promptId` for the duration of the initial response. The agent's internal `promptIdsByThread` map can track it temporarily.

## Risks / Trade-offs

**[Risk]** If initial prompt takes a long time, user might see "No messages yet" before response arrives  
**Mitigation**: This is existing behavior and acceptable. The streaming will work normally once it starts.

**[Risk]** Adding promptId to initial prompts might affect existing tests  
**Mitigation**: Tests are expected to pass as the change is additive. Integration tests may need minor updates to include promptId in assertions.

**[Risk]** Two initial prompts sent quickly might conflict  
**Mitigation**: Thread creation is a synchronous operation; only one initial prompt can be in-flight per thread at a time.

## Migration Plan

This is a bug fix with no migration needed:
1. Deploy mimo-agent changes
2. Deploy platform changes (order doesn't matter as the change is backward compatible)
3. Existing threads without responses will not be retroactively fixed (they're already created)
3. New threads created after deployment will show agent responses correctly
