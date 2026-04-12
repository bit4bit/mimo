# Specification: Frame-Based Buffer System

## Requirements

### R1: Frame Layout
The session page SHALL display two frames side-by-side:
- **Left Frame**: flex: 2 (takes 2/3 of available width)
- **Right Frame**: flex: 1 (takes 1/3 of available width)

### R2: Buffer Registration
Each buffer SHALL register with:
- `id`: Unique identifier (e.g., 'chat', 'impact', 'notes')
- `name`: Display name shown in tabs
- `frame`: 'left' or 'right' - which frame this buffer belongs to
- `component`: React component that renders the buffer content

### R3: Tab Bar
Each frame SHALL display a tab bar containing:
- One tab per buffer assigned to that frame
- Active tab visually distinguished
- Clicking a tab switches to that buffer

### R4: Buffer Switching
When a user clicks a tab:
1. The clicked buffer becomes visible
2. Previously active buffer is hidden (but NOT destroyed)
3. Frame state is updated via API call
4. New buffer receives `isActive=true` prop
5. Previous buffer receives `isActive=false` prop

### R5: Frame State Persistence
Frame state SHALL be persisted per session:
- `leftFrame.activeBufferId`: ID of active buffer in left frame
- `rightFrame.activeBufferId`: ID of active buffer in right frame
- Stored alongside session data
- Loaded on page initialization
- Updated on tab switch

### R6: Default State
New sessions SHALL have default frame state:
- Left frame: 'chat' active
- Right frame: 'impact' active

Buffer assignment SHALL default to:
- Left frame: Chat
- Right frame: Impact, Notes

### R7: Buffer Components
Buffer components SHALL accept BufferProps:
```typescript
interface BufferProps {
  sessionId: string;
  isActive: boolean;
}
```

### R8: Chat Buffer
The Chat buffer SHALL:
- Display chat messages from chat history
- Include editable bubble for new messages
- Support streaming message display
- Continue to work with chat.js

### R9: Impact Buffer
The Impact buffer SHALL:
- Display impact metrics (files, LOC, complexity)
- Include refresh button
- Show stale/calculating badges
- Display SCC warnings if needed

### R10: Notes Buffer
The Notes buffer SHALL:
- Provide multi-line text input
- Auto-save content every 2 seconds of inactivity
- Load persisted content on initialization
- Store content per session
- Clear content when session is deleted

## API Specification

### GET /sessions/:id/frame-state
**Response:**
```json
{
  "leftFrame": {
    "activeBufferId": "chat"
  },
  "rightFrame": {
    "activeBufferId": "impact"
  }
}
```

### POST /sessions/:id/frame-state
**Request:**
```json
{
  "frame": "right",
  "activeBufferId": "notes"
}
```

**Response:** 200 OK

## UI Specification

### Tab Bar Styling
- Background: #2d2d2d
- Border bottom: 1px solid #444
- Active tab: background #1a1a1a, border-bottom 2px solid #74c0fc
- Inactive tab: background transparent, color #888
- Hover: background #353535

### Tab Structure
```html
<div class="frame-tab-bar">
  <button class="frame-tab active">Impact</button>
  <button class="frame-tab">Notes</button>
</div>
```

### Frame Container
- Display: flex column
- Height: 100% of available space
- Overflow: hidden

## Data Storage

### Session YAML Addition
```yaml
frame_state:
  left_frame:
    active_buffer_id: chat
  right_frame:
    active_buffer_id: impact
```

### Notes Content Storage
- Path: `<sessionDir>/notes.txt`
- Plain text format
- Created on first save
- Deleted when session is deleted
