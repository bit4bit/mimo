## Context

After `extract-chat-streaming-pipeline`, `handleAgentMessage` still handles: capability storage (`agent_capabilities`), session bootstrapping (`agent_ready`), state persistence (`session_initialized`, `model_state`, `mode_state`), permission routing (`permission_request`, `permission_response`), session lifecycle (`acp_thread_created`, `acp_thread_cleared`, `clear_session_error`, `session_ended`), file sync (`file_changed`), auto-sync triggering (`thought_end`, `usage_update`), and expert mode (`expert_temp_content`). These are all distinct concerns mixed in one function. The remaining module-level state used by agent messages: `pendingPermissions`, `autoSyncInFlight`, `pendingActivityTouches`, `calculatingSessions`.

## Goals / Non-Goals

**Goals:**

- `AgentMessageRouter` owns all agent-message-related state and dependencies
- `index.tsx` `handleAgentMessage` becomes `return agentRouter.handle(ws.data.agentId, data)`
- Each message type maps to a private typed method (reveals intention)
- Full integration test coverage via injected fakes

**Non-Goals:**

- Changing any message handling behavior
- Extracting `handleChatMessage` (a separate future concern)
- Changing the WebSocket upgrade/auth flow in `index.tsx`

## Decisions

### Constructor injection of all dependencies

```ts
interface AgentMessageRouterDeps {
  pipeline: ChatStreamingPipeline;
  sessionRepository: SessionRepository;
  agentRepository: AgentRepository;
  agentService: AgentService;
  chatSessions: Map<string, Set<SessionWsClient>>;
  broadcast: BroadcastFn;
  triggerAutoSync: (sessionId: string, reason: AutoSyncReason) => Promise<void>;
  sessionStateService: SessionStateService;
  chat: ChatService;
  sharedFossilServer: SharedFossilServer;
  mimoContext: MimoContext;
  platformUrl: string;
}

class AgentMessageRouter {
  private pendingPermissions = new Map<string, (r: any) => void>();
  private autoSyncInFlight = new Set<string>();
  private pendingActivityTouches = new Map<string, NodeJS.Timeout>();
  private calculatingSessions = new Set<string>();

  constructor(private deps: AgentMessageRouterDeps) {}

  async handle(agentId: string, ws: any, data: any): Promise<void>;
  private async handleAgentReady(agentId, ws, data): Promise<void>;
  private handleAgentCapabilities(agentId, data): Promise<void>;
  private handleSessionInitialized(data): Promise<void>;
  private handleModelState(data): Promise<void>;
  private handleModeState(data): Promise<void>;
  private handleAcpThreadCreated(data): Promise<void>;
  private handleAcpThreadCleared(data): Promise<void>;
  private handleFileChanged(data): Promise<void>;
  private handlePermissionRequest(ws, data): void;
  // ... etc
}
```

**Alternative considered**: Pass `ws` as a field on the router. Rejected — `ws` is per-call (the agent WebSocket for the current message); passing it per `handle()` call makes this explicit.

### `triggerAutoSync` stays as an injected function, not inlined

`triggerAutoSync` currently references `autoSyncInFlight`, `syncSessionViaAssignedAgent`, and the `chatSessions` broadcast. Moving it inside the router would entangle it. Instead: keep it as an injectable function (or move `autoSyncInFlight` into the router and pass a simpler `sync` callback). The router calls `this.deps.triggerAutoSync(sessionId, reason)`.

**Refinement**: Move `autoSyncInFlight` guard into the router, expose `sync` as a simple async callback that does the actual sync work. This keeps the guard (de-duplication) inside the router where it belongs.

### `handleAgentReady` receives session bootstrap logic

Currently `agent_ready` in `handleAgentMessage` is the longest case (~100 lines) — it finds sessions, resolves MCP servers, builds thread bootstrap, and sends `session_ready`. This moves into `handleAgentReady` on the router. The router has `sessionRepository`, `agentService`, `sharedFossilServer` for this.

### `chatSessions` Map passed by reference

The router needs `chatSessions` to broadcast to UI clients. It receives the Map by reference from `index.tsx`. The Map is still constructed in `index.tsx` (it is also used by `handleChatMessage`), but the router holds a reference.

## Risks / Trade-offs

- **Large constructor** → `AgentMessageRouterDeps` has many fields. Acceptable: this is the boundary object pattern — all deps explicit, no hidden globals.
- **`handleAgentReady` touches `sharedFossilServer` and MCP logic** → These are infrastructure deps; the router needs them. Alternatively, extract a `SessionBootstrap` service. Deferred: out of scope for this change.
- **Depends on `extract-chat-streaming-pipeline`** → Must ship after that change. `ChatStreamingPipeline` is a required dep.

## Migration Plan

1. Create `packages/mimo-platform/src/agents/message-router.ts` with full test suite
2. Construct `AgentMessageRouter` in `index.tsx` at the top
3. Replace `handleAgentMessage` body with `return agentRouter.handle(ws.data.agentId, ws, data)`
4. Delete remaining module-level Maps used by agent messages (`pendingPermissions`, `autoSyncInFlight`, `pendingActivityTouches`, `calculatingSessions`)
5. Confirm all tests pass
