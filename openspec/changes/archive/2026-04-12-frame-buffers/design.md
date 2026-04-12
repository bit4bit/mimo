# Design: Frame-Based Buffer System

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SESSION DETAIL PAGE                            │
├─────────────────────────────────────────────────────────────────┤
│  Header (session info, model/mode selectors)                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┬───────────────────────────┐ │
│  │      LEFT FRAME (flex: 2)    │    RIGHT FRAME (flex: 1)  │ │
│  │  ┌────────────────────────┐  │  ┌─────────────────────┐  │ │
│  │  │ [Chat]                 │  │  │ [Impact] [Notes]    │  │ │
│  │  │                        │  │  │                     │  │ │
│  │  │ ChatBuffer (active)    │  │  │ ImpactBuffer        │  │ │
│  │  │                        │  │  │                     │  │ │
│  │  └────────────────────────┘  │  └─────────────────────┘  │ │
│  └──────────────────────────────┴───────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│  Footer (Commit, Clear, Settings, Delete)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Frame Component

```typescript
// components/Frame.tsx
interface FrameProps {
  frameId: 'left' | 'right';
  sessionId: string;
  buffers: BufferConfig[];  // Buffers in this frame
  activeBufferId: string; // Currently visible buffer
  onBufferSwitch: (bufferId: string) => void;
}

// Renders:
// - Tab bar with buffer tabs
// - Active buffer content
// - Handles tab click events
```

**Responsibilities:**
- Render tab bar based on registered buffers for this frame
- Display active buffer component
- Handle tab switching (calls onBufferSwitch)
- Pass sessionId to all buffers

### 2. Buffer Registry

```typescript
// buffers/registry.ts
interface BufferConfig {
  id: string;                    // 'chat', 'impact', 'notes'
  name: string;                  // Display name
  icon?: string;                 // Optional icon
  frame: 'left' | 'right';      // Which frame this buffer belongs to
  component: FC<BufferProps>;   // The component to render
}

interface BufferProps {
  sessionId: string;
  isActive: boolean;            // Whether this buffer is currently visible
}

// Registry functions
export function registerBuffer(config: BufferConfig): void;
export function getBuffersForFrame(frameId: 'left' | 'right'): BufferConfig[];
export function getBufferById(id: string): BufferConfig | undefined;
```

**Responsibilities:**
- Maintain static registry of available buffers
- Group buffers by frame assignment
- Provide lookup by ID
- Registration happens at module load time

### 3. Frame State (Per-Session)

```typescript
// sessions/frame-state.ts
interface FrameState {
  leftFrame: {
    activeBufferId: string;     // 'chat' | etc
  };
  rightFrame: {
    activeBufferId: string;     // 'impact' | 'notes' | etc
  };
}

// Persisted per session
// Default: { leftFrame: { activeBufferId: 'chat' }, rightFrame: { activeBufferId: 'impact' } }
```

**Storage:**
- Persisted in session storage (file-based, alongside session.yaml)
- Loaded on page render
- Updated via API endpoint when switching

### 4. Buffer Components

**ChatBuffer** (migrated from inline JSX + chat.js)
```typescript
// buffers/ChatBuffer.tsx
interface ChatBufferProps extends BufferProps {
  // chat.js will continue to manage its own DOM
  // we just provide the container
}

// Wraps the existing chat system
// chat.js attaches to #chat-messages within this component
```

**ImpactBuffer** (already exists, wrap it)
```typescript
// ImpactBuffer stays mostly the same
// Just needs to accept BufferProps
```

**NotesBuffer** (new)
```typescript
// buffers/NotesBuffer.tsx
interface NotesBufferProps extends BufferProps {
  // Simple text area that persists to session storage
  // Auto-save on typing (debounced)
  // Content stored per session
}
```

## Data Flow

### Initial Load
```
SessionDetailPage.tsx
  ├── Load frame state from session repository
  ├── Query buffer registry for left/right frame buffers
  ├── Render LeftFrame with buffers + activeBufferId
  └── Render RightFrame with buffers + activeBufferId

Frame component
  ├── Render tab bar (all buffer tabs)
  ├── Find active buffer from registry
  └── Render active buffer component

Buffer component
  └── Initialize with sessionId, isActive=true
```

### Tab Switch
```
User clicks tab
  └── Frame.onBufferSwitch(bufferId)
      ├── POST /sessions/:id/frame-state
      │     { frame: 'right', activeBufferId: bufferId }
      └── Frame re-renders with new activeBufferId
          ├── Old buffer: isActive=false
          └── New buffer: isActive=true
```

## API Changes

### New Endpoints

```typescript
// GET /sessions/:id/frame-state
// Returns current frame state for session
{
  "leftFrame": { "activeBufferId": "chat" },
  "rightFrame": { "activeBufferId": "impact" }
}

// POST /sessions/:id/frame-state
// Update frame state
{
  "frame": "right",
  "activeBufferId": "notes"
}
```

### Session Repository

```typescript
// Add to Session repository
interface Session {
  // ... existing fields
  frameState: FrameState;
}

// Session YAML structure (addition)
frame_state:
  left_frame:
    active_buffer_id: chat
  right_frame:
    active_buffer_id: impact
```

## File Structure

```
packages/mimo-platform/src/
├── components/
│   ├── Frame.tsx              # New: Frame container with tabs
│   ├── SessionDetailPage.tsx  # Modified: Use Frame components
│   └── ImpactBuffer.tsx       # Modified: Accept BufferProps
├── buffers/
│   ├── registry.ts            # New: Buffer registration/lookup
│   ├── types.ts               # New: Buffer interfaces
│   ├── ChatBuffer.tsx         # New: Wrapper for chat.js
│   ├── NotesBuffer.tsx        # New: Notes/scratch buffer
│   └── index.ts               # New: Export all buffers + register
├── sessions/
│   ├── frame-state.ts         # New: Frame state types & persistence
│   └── repository.ts          # Modified: Add frame_state field
└── routes.ts                  # Modified: Add frame-state endpoints
```

## Migration Strategy

### Phase 1: Create Frame Infrastructure
1. Create buffer registry with types
2. Create Frame component
3. Add frame state to session model

### Phase 2: Migrate Existing Buffers
1. Wrap Chat in ChatBuffer component
2. Update ImpactBuffer to accept BufferProps
3. Register both with registry

### Phase 3: Add New Buffer
1. Create NotesBuffer component
2. Register with right frame
3. Test tab switching

### Phase 4: Update SessionDetailPage
1. Replace inline buffer JSX with Frame components
2. Add frame state loading
3. Wire up tab switching API

## Key Decisions

### Why tabs instead of other switching mechanisms?
- **Familiar**: Browser-like mental model
- **Visible**: Users can see available buffers
- **Simple**: Click to switch, no hidden state

### Why static frame assignment?
- **Predictable**: Chat always in left; Impact and Notes in right
- **Simple**: No complex layout management
- **Sufficient**: Covers current and planned use cases

### Why per-session frame state?
- **Contextual**: Different sessions may prefer different layouts
- **Persistent**: User's preference survives reload
- **Isolated**: One session's layout doesn't affect others

### Why isActive prop on buffers?
- **Performance**: Buffers can pause expensive operations when hidden
- **Lifecycle**: Buffers can initialize/finalize based on visibility
- **Flexibility**: Buffers can choose to keep state or cleanup

## Edge Cases

### What if active buffer is unregistered?
- Fallback to first buffer in frame
- Log warning

### What if frame has no buffers?
- Render empty state: "No buffers configured"

### What happens to chat.js when Chat buffer is hidden?
- chat.js continues running (WebSocket stays connected)
- Messages accumulate but don't render
- When shown again, chat.js catches up

### What happens to Notes when hidden?
- Auto-save triggers regardless of visibility
- Content persists
