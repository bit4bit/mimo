# Tasks: Frame-Based Buffer System

## Phase 1: Frame Infrastructure

- [x] **Task 1: Create buffer types and registry**
  - Create `src/buffers/types.ts` with BufferConfig and BufferProps interfaces
  - Create `src/buffers/registry.ts` with registerBuffer and getBuffersForFrame functions
  - Create `src/buffers/index.ts` to export all buffer modules

- [x] **Task 2: Add frame state to sessions**
  - Create `src/sessions/frame-state.ts` with FrameState interface and persistence functions
  - Update Session interface in repository to include frameState
  - Add migration for existing sessions (default frame state)
  - Add frameState field to session storage

- [x] **Task 3: Create Frame component**
  - Create `src/components/Frame.tsx` with tab bar and buffer container
  - Props: frameId, sessionId, buffers, activeBufferId, onBufferSwitch
  - Render tabs for each buffer
  - Render active buffer with isActive=true

## Phase 2: Migrate Existing Buffers

- [x] **Task 4: Create ChatBuffer wrapper**
  - Create `src/buffers/ChatBuffer.tsx` wrapper component
  - Accept BufferProps
  - chat.js will continue managing its own DOM
  - Register in buffer registry as left frame buffer

- [x] **Task 5: Update ImpactBuffer**
  - Modify `src/components/ImpactBuffer.tsx` to accept BufferProps
  - Update registry to register as right frame buffer

## Phase 3: Add New Buffer

- [x] **Task 6: Create NotesBuffer**
  - Create `src/buffers/NotesBuffer.tsx`
  - Simple textarea with auto-save
  - Persist content per session
  - Register as right frame buffer

## Phase 4: Integration

- [x] **Task 7: Add frame state API endpoints**
  - Add GET /sessions/:id/frame-state endpoint
  - Add POST /sessions/:id/frame-state endpoint
  - Add route handlers in sessions/routes.tsx

- [x] **Task 8: Update SessionDetailPage**
  - Replace inline buffer JSX with Frame components
  - Load frame state from API
  - Handle buffer switching via API
  - Pass correct props to each frame

## Phase 5: Testing

- [x] **Task 9: Write integration tests**
  - Test buffer registry functions
  - Test frame state persistence
  - Test tab switching
  - Test NotesBuffer auto-save

## Definition of Done

- [x] Left frame shows Chat tab
- [x] Right frame shows Impact and Notes tabs
- [x] Clicking tabs switches buffers in frame
- [x] Frame state persists across page reload
- [x] Chat continues to stream messages correctly
- [x] Impact refresh button still works
- [x] Notes content auto-saves and persists
- [ ] All existing tests pass
