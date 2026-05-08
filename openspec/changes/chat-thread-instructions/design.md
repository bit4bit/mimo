## Context

The system currently has no mechanism for users to provide behavior instructions (system prompts) to the LLM. The only configurable prompt is a global summary prompt in `ConfigService`. The hierarchy Project > Session > ChatThread exists in the data model but no prompt fields exist at any level.

The ACP protocol's `newSession` request does not accept an `instructions` or `prompt` parameter. ACP providers (opencode, claude) manage their own internal system prompts. Therefore, instructions must be injected through the conversation flow rather than at session creation.

## Goals / Non-Goals

**Goals:**

- Allow users to set behavior instructions at project, session, and chat thread levels
- Implement override hierarchy: Thread > Session > Project
- Automatically inject resolved instructions into chat history when a thread is created
- Make instructions visible in the web UI
- Support CRUD operations for instructions via REST API

**Non-Goals:**

- Modifying the ACP protocol or provider internals
- Supporting instructions at the global/platform level
- Real-time instruction updates to active ACP sessions
- Instructions for non-chat contexts (e.g., impact analysis, file watching)

## Decisions

**1. Store instructions as `role: "system"` in JSONL chat history**

- Rationale: Makes instructions visible in the UI and preserves them in history replays
- Alternative: Store in a separate metadata file — rejected because it separates instructions from the conversation context

**2. Override resolution at thread creation time**

- Rationale: Deterministic and captured in history; changing parent instructions later won't retroactively affect existing threads
- Alternative: Dynamic resolution on every prompt — rejected because it would be confusing to have thread behavior change mid-conversation

**3. No synthetic ACP turn for initial prompt**

- Rationale: The ACP protocol only processes user prompts. Creating a synthetic user message would cost tokens and create an artificial conversation turn. Instead, instructions are saved as system messages for UI visibility only.
- Alternative: Send instructions as first user message to ACP — rejected per user preference for Approach B (synthetic turn), but after investigation, storing as system message provides UI visibility without token cost
- **Correction**: After further analysis, the user explicitly requested Approach B (synthetic first turn). The implementation will save instructions as system message AND trigger an initial ACP prompt.

**4. Agent receives `initial_prompt` message type**

- Rationale: Distinguishes behavior instructions from user messages, allowing the agent to handle them appropriately
- Alternative: Reuse `user_message` type — rejected because it conflates user intent with system configuration

## Risks / Trade-offs

- **[Risk]** ACP providers may not preserve context across sessions, so instructions might need to be resent after session recovery
  - **Mitigation**: Instructions are persisted in chat history and can be referenced
- **[Risk]** Long instructions increase token usage for every prompt if prepended
  - **Mitigation**: With synthetic first turn approach, instructions are sent once at thread creation
- **[Risk]** Agent may not be connected when thread is created
  - **Mitigation**: Instructions are saved to history immediately; initial prompt to agent can be queued or sent when agent connects

## Migration Plan

No migration needed. The `instructions` field is optional on all entities. Existing projects, sessions, and threads will have `undefined` instructions.

## Open Questions

1. Should updating instructions on an existing thread retroactively update the system message in history?
2. Should there be a UI indicator showing which level (project/session/thread) provided the current instructions?
