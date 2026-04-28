## Context

The chat session page (`SessionDetailPage.tsx`) renders messages in `#chat-messages` div. Each message has a header with role label ("Agent" or "You") and a content div. The change adds a copy button to each message header.

## Goals / Non-Goals

**Goals:**
- Copy button inline with role label, right-aligned
- Always visible
- Copies only message content text (no role, no timestamp)
- No feedback after click

**Non-Goals:**
- Keyboard shortcut
- Visual feedback or state change
- Copy with role label or timestamp

## Decisions

### D1: Button placement — inline in header, right-aligned

**Decision**: The copy button is placed inside `.message-header` flex container, right after the role label.

**Alternatives considered**:
- Inside the bubble at bottom-right — adds complexity, visually heavier
- Hover-only visibility — explicitly rejected per requirements

**Rationale**: Matches the natural layout flow; button is immediately adjacent to the content it copies.

### D2: Copy implementation — inline onclick

**Decision**: Use `onclick` handler directly on the button element: `navigator.clipboard.writeText(this.closest('.message').querySelector('.message-content').textContent)`

**Alternative**: Separate named function — unnecessary for this simple operation.

**Rationale**: Inline handler is concise and sufficient for single-purpose button.

### D3: Button styling

**Decision**: Use a subtle icon style matching the existing UI (monospace, small, muted colors that brighten on hover).

**Rationale**: Consistent with `editable-send-btn` styling already in the codebase.

## Risks / Trade-offs

- **Clipboard API fallback**: `navigator.clipboard` requires HTTPS or localhost. → Use try/catch; silent failure is acceptable (user can still select-text-copy).
