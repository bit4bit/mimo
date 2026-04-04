# Design: Session Model and Mode Selector

## Context

The mimo platform currently uses opencode ACP server to provide AI assistance but doesn't expose the configuration capabilities available through the ACP protocol. When a session is created, the ACP server returns `configOptions` which includes available models and modes, but this data is discarded by mimo-agent.

The ACP protocol provides:
- `SessionConfigOption` with `category: "model"` or `category: "mode"`
- `setSessionConfigOption` method to change selections
- Config options contain `currentValue` and list of available `options`

Current architecture:
```
Mimo UI <--WebSocket--> Mimo Agent <--ACP--> Opencode ACP Server
    └─ No model/mode awareness
```

Desired architecture:
```
Mimo UI (dropdowns) <--WebSocket--> Mimo Agent <--ACP--> Opencode ACP Server
    └─ Receives configOptions          └─ Forwards configOptions
       and displays them                  and handles changes
```

## Goals / Non-Goals

**Goals:**
- Display model and mode selectors in session UI header
- Populate selectors from ACP configOptions (categories: "model", "mode")
- Default to first available option on session creation
- Allow users to change model/mode mid-session
- Keep model/mode state in-memory only (no persistence)

**Non-Goals:**
- Persist model/mode selection across session reloads
- Add new model providers (only use what ACP provides)
- Support grouped options initially (flat list only for MVP)
- Create custom modes beyond what ACP provides

## Decisions

### Decision: Use configOptions category instead of legacy fields
**Choice:** Parse `configOptions` array with `category: "model"` and `category: "mode"` instead of using the legacy `models` and `modes` fields in `NewSessionResponse`.

**Rationale:** The `configOptions` approach is the modern ACP pattern. The legacy `models`/`modes` fields are marked as unstable/experimental in the schema.

**Alternatives considered:**
- Legacy fields: Rejected due to instability
- Both: Adds complexity without benefit

### Decision: In-memory state only
**Choice:** Store model/mode state only in runtime memory, not in database.

**Rationale:** This is a UI convenience feature. Requiring database migrations adds unnecessary overhead. Users can reselect on page refresh.

**Trade-off:** State resets on server restart or page refresh. Acceptable for this feature.

### Decision: WebSocket protocol for state sync
**Choice:** Extend existing WebSocket between mimo-agent and mimo-platform.

**Rationale:** Already established channel, low latency, bidirectional. No need for new infrastructure.

**New message types:**
- `session_initialized`: Agent → Platform (carries configOptions)
- `model_state`: Platform → UI (broadcast)
- `mode_state`: Platform → UI (broadcast)
- `set_model`: UI → Platform → Agent (change request)
- `set_mode`: UI → Platform → Agent (change request)

### Decision: Use setSessionConfigOption for changes
**Choice:** Call `setSessionConfigOption({ sessionId, optionId, value })` when user changes selection.

**Rationale:** This is the standard ACP method for updating config options. The `unstable_setSessionModel` is deprecated.

**Note:** Need to map our UI concept ("model", "mode") to the actual `optionId` from configOptions (could be "model", "llm-model", etc.).

## Risks / Trade-offs

**[Risk]** Config option IDs vary by ACP server implementation
- **Mitigation:** Map by `category` field (standardized as "model", "mode") rather than hardcoding `optionId`

**[Risk]** ACP server may not provide configOptions
- **Mitigation:** Gracefully handle missing config - hide selectors if no options available

**[Risk]** Model/mode changes during active prompt could cause issues
- **Mitigation:** Allow change at any time (ACP supports this), but UI should show loading state

**[Risk]** State lost on page refresh
- **Mitigation:** Document behavior; consider future enhancement to persist in URL or localStorage

**[Risk]** Option names/descriptions may be long
- **Mitigation:** Truncate in UI with full text on hover/tooltip

## Data Flow

```
1. Session Creation:
   Mimo Agent creates ACP session
   → Receives NewSessionResponse with configOptions
   → Extracts model/mode options
   → Sends { type: "session_initialized", modelState, modeState } to Platform
   → Platform stores in memory and broadcasts to UI
   → UI populates dropdowns, selects currentValue

2. User Changes Selection:
   User selects new model from dropdown
   → UI sends { type: "set_model", modelId } to Platform
   → Platform forwards to Agent
   → Agent calls setSessionConfigOption on ACP
   → ACP may respond with updated configOptions
   → Agent forwards to Platform
   → Platform broadcasts to UI
```

## Component Changes

### Mimo Platform
- `SessionDetailPage.tsx`: Add header component with two dropdowns
- `chat.js`: Handle WebSocket messages for state sync
- Session state store: Add `modelState` and `modeState` fields

### Mimo Agent
- `src/index.ts`:
  - After `newSession()`: Extract and forward configOptions
  - Add handler for `set_model`/`set_mode` messages
  - Call `setSessionConfigOption` on ACP

## Open Questions

1. Should we show loading/confirmation when changing model mid-turn?
   - Recommendation: Yes, visual feedback but don't block

2. How to handle grouped options (if ACP returns them)?
   - Recommendation: Flatten for MVP, add grouping in v2

3. Should we show model description/tooltip?
   - Recommendation: Yes, use `description` field from config option

4. What if user changes model while agent is processing?
   - Recommendation: Allow it, ACP handles this gracefully
