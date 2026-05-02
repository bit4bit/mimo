## Why

Users need a way to provide behavior instructions (system prompts) to the LLM on a per-project, per-session, or per-thread basis. Currently, there is no mechanism to configure instructions at any level. This limits the ability to guide the agent's behavior for specific contexts (e.g., "You are a Python expert" for a project, "Focus on Django ORM" for a session, or "Refactor this view" for a thread).

## What Changes

- Add `instructions` field to Project, Session, and ChatThread entities
- Implement override hierarchy: Thread > Session > Project
- Automatically inject resolved instructions as a system message into chat history when a thread is created
- Expose instructions through REST API for CRUD operations
- Display instructions in the web UI

## Capabilities

### New Capabilities
- `chat-thread-instructions`: Configurable behavior instructions with project/session/thread override hierarchy, automatic injection into chat history on thread creation

### Modified Capabilities
- `chat-threads`: Thread creation and updates now accept an optional `instructions` field; threads expose `instructions` in responses
- `session-management`: Sessions now support an `instructions` field via create and update APIs
- `projects`: Projects now support an `instructions` field via create and update APIs

## Impact

- **Data model**: Project, Session, and ChatThread YAML schemas gain optional `instructions` field
- **REST API**: `POST/PUT /projects`, `POST/PUT /sessions`, `POST/PUT /sessions/:id/chat-threads` accept `instructions`
- **Chat history**: New threads automatically get a `role: "system"` message with resolved instructions
- **UI**: New form fields for instructions on project, session, and thread creation/editing pages
- **Agent**: May receive `initial_prompt` message type for synthetic first turn (future enhancement)
