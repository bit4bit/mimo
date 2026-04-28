# Proposal: Chat Threads with Shared Workspace

## Why

Users need multiple parallel conversations with different LLM behaviors while working on the same repository state. Today, a session maps to one chat context, which forces users to mix planning, implementation, and review prompts in one thread and one model/mode configuration.

This change adds first-class chat threads inside a session so users can run a second (or third) ACP agent against the same `agent-workspace`, `upstream`, and `repo.fossil` without duplicating repositories.

## What Changes

- Add `chat-thread` as the canonical term (UI, API, transport, and storage)
- Allow each session to contain multiple chat threads
- Spawn one ACP runtime per chat thread, all pointing to the same checkout path
- Route all user prompts and ACP stream events by `chatThreadId`
- Store thread-level model and mode (`model`, `mode`) independently
- Add API endpoints to create/list/update/delete chat threads programmatically
- Persist active thread selection per session
- Restore each thread runtime with its own model/mode on wake/reconnect

## Capabilities

### New Capabilities
- `chat-threads`: multi-thread chat orchestration inside a single session

### Modified Capabilities
- `agent-lifecycle`: ACP runtime management becomes thread-aware
- `chat-streaming-state`: reconnect and stream state become thread-aware
- `frame-buffers`: left-frame chat UI becomes dynamic tabs for chat threads
- `session-management`: new sessions initialize with a default chat thread

## Impact

- **mimo-platform**: thread CRUD APIs, websocket routing by `chatThreadId`, session page thread tabs
- **mimo-agent**: ACP runtime map keyed by `{sessionId, chatThreadId}`
- **Storage**: thread metadata and per-thread runtime/session identifiers persisted per session
- **Protocol**: messages and stream events include `chatThreadId`
- **Breaking Changes**: rename `chatBuffer` vocabulary to `chatThread` in new interfaces for consistency
