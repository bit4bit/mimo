## Why

The chat session view shows message bubbles for "Agent" and "You" but lacks a quick way to copy individual message contents. Users need to select text manually or use browser copy functions to capture specific messages.

## What Changes

- Add a copy button to each message bubble header, inline with the role label ("Agent" / "You")
- Button is always visible (no hover-only behavior)
- Click copies only the message content text (no role label, no timestamp)
- No visual feedback after click (no toast, no button state change)

## Capabilities

### New Capabilities

- `message-copy`: Per-message copy button that copies message content to clipboard with single click

### Modified Capabilities

- *(none)*

## Impact

- `packages/mimo-platform/src/components/SessionDetailPage.tsx`: Add copy button to message bubble headers and associated CSS styling
