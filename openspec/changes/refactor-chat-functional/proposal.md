## Why

The chat.js file has grown to 1557 lines with scattered mutable state, mixed concerns, and entangled view logic. This makes the code hard to understand, test, and maintain. We need to reorganize it with clear boundaries between state, views, services, and controllers while keeping it in a single file for simplicity.

## What Changes

- **Reorganize chat.js into 8 clear sections** ordered by importance:
  1. Global State - single mutable state object
  2. Views - pure functions that render DOM elements
  3. Services - business logic and transformations
  4. Controller - WebSocket and event handling
  5. DOM Manipulation - view insertion and updates
  6. Setup & Event Listeners
  7. Public API
  8. Bootstrap

- **Establish naming conventions**:
  - `render*` - pure functions that create DOM elements
  - `insert*` - functions that add elements to the DOM
  - `update*` - functions that modify existing DOM
  - `handle*` - event handlers and WebSocket message handlers

- **No breaking changes** - all external APIs remain identical

## Capabilities

### New Capabilities
- None - this is a pure refactoring

### Modified Capabilities
- None - no spec-level behavior changes

## Impact

- File: `packages/mimo-platform/public/js/chat.js`
- No API changes
- No dependency changes
- No database changes
- Existing tests should continue to pass
