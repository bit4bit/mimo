## Context

The current chat.js is a 1557-line IIFE with:
- 31 mutable state variables scattered throughout
- Mixed concerns: DOM manipulation, WebSocket handling, business logic entangled
- No clear boundaries between views, services, and controllers
- Functions ranging from 5 lines to 150+ lines
- Inconsistent naming patterns

The file handles WebSocket communication, message rendering, streaming UI, thought sections, permission cards, model/mode selectors, session clearing, and more - all in one tangled mass.

## Goals / Non-Goals

**Goals:**
- Organize code into clear sections with single responsibilities
- Establish a global state object as the single source of truth
- Separate pure view functions from DOM manipulation
- Separate business logic (services) from side effects (controller)
- Maintain consistent naming conventions
- Keep everything in one file for simplicity
- Preserve all existing behavior

**Non-Goals:**
- No pure functional programming (allow mutable state)
- No Redux/Flux architecture (too heavy)
- No module splitting (keep single file)
- No framework migration
- No new features or behavior changes

## Decisions

### 1. Single Global State Object
**Decision:** Use a single `ChatState` object at the top of the file.

**Rationale:**
- All mutable state lives in one place, easy to find and track
- Functions receive state they need, no hidden dependencies
- Simpler than immutable updates for this refactoring scope

**Alternative considered:** Immutable state with reducer pattern - rejected as overkill for this codebase.

### 2. Views are Pure Functions
**Decision:** View functions (`render*`) take data, return DOM elements, do nothing else.

**Rationale:**
- Can be tested in isolation
- No hidden DOM queries or state mutations
- Clear input/output contract

### 3. Services are Pure Functions
**Decision:** Service functions transform data, parse content, calculate values - no side effects.

**Rationale:**
- Business logic is testable without DOM
- Reusable across different contexts
- Clear separation from rendering

### 4. Controller Coordinates
**Decision:** Controller functions handle events, call services, call views, update state.

**Rationale:**
- Single place where side effects happen
- Easy to trace execution flow
- WebSocket handlers live here

### 5. DOM Section for Mutations
**Decision:** All actual DOM mutations (insert, update, remove) live in their own section.

**Rationale:**
- View functions create elements, DOM functions put them in the document
- Clear boundary between "what to render" and "where to put it"
- Makes debugging easier

### 6. Naming Conventions
**Decision:** Establish clear prefixes:
- `render*` - pure view functions
- `insert*` - add elements to DOM
- `update*` - modify existing DOM
- `handle*` - event/message handlers
- `parse*` - data transformation services
- `calculate*` - computed values

**Rationale:**
- Function name tells you what it does and where it belongs
- Easier to navigate the file
- Self-documenting code

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Keep all public APIs identical; no behavior changes |
| Merge conflicts with other work | Complete refactoring in one PR; coordinate with team |
| Test coverage gaps | Manual testing of all chat features; existing tests should pass |
| Performance regression | Views are still recreated on each call; no virtualization added |
| State access confusion | All state mutations happen via setters for potential interception |

**Trade-offs:**
- Slightly more indirection (functions calling functions)
- More lines of code due to separation
- But: Much easier to understand and modify

## Migration Plan

1. Create refactored version in new file
2. Run existing tests to ensure compatibility
3. Manual testing of all chat features:
   - Send/receive messages
   - Streaming/thoughts
   - Cancel streaming
   - Clear session
   - Permission cards
   - Model/mode switching
   - Reconnection handling
4. Replace old file with new
5. Deploy and monitor

**Rollback:** Simply restore the original chat.js from git history.

## Open Questions

None - design is complete and ready for implementation.
