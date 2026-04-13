# Specification: Chat Buffer Markdown Rendering

## Overview
Agent messages in the chat buffer shall be rendered as formatted markdown after streaming completes, with the ability to toggle between rendered markdown and raw markdown source views.

## Requirements

### Functional Requirements

#### F1: Markdown Rendering
- **F1.1**: Agent messages shall be rendered as formatted markdown once streaming completes
- **F1.2**: Markdown shall support: headers, lists, code blocks, inline code, links, blockquotes, tables
- **F1.3**: Code blocks shall have distinct styling (dark background, monospace font)
- **F1.4**: During streaming, content shall display as plain text (current behavior)

#### F2: View Toggle
- **F2.1**: Each agent message shall have two toggle buttons: [Raw] and [Markdown]
- **F2.2**: Default view shall be rendered markdown
- **F2.3**: [Raw] button shall display the exact markdown source
- **F2.4**: [Markdown] button shall display the rendered HTML
- **F2.5**: Active button shall have visual indication (different background color)
- **F2.6**: Toggle state shall be per-message (not global)

#### F3: Raw Content Preservation
- **F3.1**: Raw markdown source shall be stored in `data-raw-content` attribute
- **F3.2**: Raw content shall be preserved when switching views
- **F3.3**: Copy button shall always copy raw markdown source

#### F4: User Messages
- **F4.1**: User messages shall remain as plain text (no markdown rendering)
- **F4.2**: User messages shall not have toggle buttons

### Non-Functional Requirements

#### N1: Performance
- **N1.1**: Markdown rendering shall complete within 100ms for messages up to 10KB
- **N1.2**: No noticeable lag when toggling between views

#### N2: Security
- **N2.1**: HTML in markdown shall be escaped (XSS prevention)
- **N2.2**: Markdown rendering library shall be configured for safe output

#### N3: Compatibility
- **N3.1**: Feature shall work with existing streaming infrastructure
- **N3.2**: Feature shall work with history loading (non-streaming messages)
- **N3.3**: Feature shall not affect thought section rendering

## User Interface

### Message Header Layout
```
┌─────────────────────────────────────────────────────────────┐
│ Agent                              [Raw] [Markdown] [📋]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  # Example Header                                           │
│                                                             │
│  This is rendered markdown with:                            │
│                                                             │
│  - Lists                                                    │
│  - Code blocks                                              │
│                                                             │
│  ```javascript                                              │
│  const x = 1;                                               │
│  ```                                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Toggle Button States
- **Inactive button**: Dark background (#3d3d3d), gray text (#888)
- **Active button**: Lighter background (#555), white text (#fff)
- **Hover**: Slightly lighter background (#4d4d4d)

### Markdown Styling
- **Headers**: Bold, larger font sizes, proper margins
- **Lists**: Proper indentation, bullet points
- **Code blocks**: Dark background (#1a1a1a), rounded corners, horizontal scroll
- **Inline code**: Dark background (#2d2d2d), rounded corners
- **Links**: Blue color (#58a6ff), underline on hover
- **Blockquotes**: Left border, muted text color
- **Tables**: Borders, alternating row colors optional

## Technical Specification

### Dependencies
- `marked` (v15.x or later) - Client-side markdown parser

### API

#### `renderMarkdown(content: string): string`
Renders markdown content to HTML using marked library.

**Parameters:**
- `content`: Raw markdown string

**Returns:**
- HTML string

**Configuration:**
```javascript
marked.parse(content, {
  gfm: true,
  breaks: true,
  headerIds: false,
})
```

#### `addViewToggleButtons(messageEl: HTMLElement, contentEl: HTMLElement): void`
Adds Raw/Markdown toggle buttons to a message.

**Parameters:**
- `messageEl`: The message container element
- `contentEl`: The content element (where markdown is rendered)

### Data Attributes
- `data-raw-content`: Stores the original markdown source

### CSS Classes
- `.markdown-rendered`: Applied to content element when showing rendered markdown
- `.message-view-toggle-container`: Container for toggle buttons
- `.view-toggle-btn`: Toggle button styling
- `.view-toggle-btn.active`: Active toggle button styling

## Acceptance Criteria

- [ ] AC1: Given an agent is streaming a message, when the stream completes, then the message is displayed as rendered markdown
- [ ] AC2: Given a rendered markdown message, when the user clicks [Raw], then the raw markdown source is displayed
- [ ] AC3: Given a raw view message, when the user clicks [Markdown], then the rendered markdown is displayed
- [ ] AC4: Given any agent message, when the user clicks the copy button, then the raw markdown is copied to clipboard
- [ ] AC5: Given a user message, when it is displayed, then no toggle buttons are present and content is plain text
- [ ] AC6: Given a message with code blocks, when rendered, then code blocks have distinct dark background styling
- [ ] AC7: Given a message with HTML tags in the markdown, when rendered, then the HTML is escaped and displayed as text
- [ ] AC8: Given the chat history is loaded, when messages are displayed, then existing agent messages have markdown rendering and toggle buttons
