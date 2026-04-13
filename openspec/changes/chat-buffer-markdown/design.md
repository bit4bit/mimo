# Design: Chat Buffer Markdown Rendering

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MESSAGE LIFECYCLE                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  STREAMING PHASE                    FINALIZED PHASE                      │
│  ┌─────────────────┐               ┌─────────────────────────────┐       │
│  │ textContent     │               │ innerHTML (rendered)        │       │
│  │ ├─ Character    │  ─────────►   │ ├─ Headers, lists           │       │
│  │ ├─ By character │    stream     │ ├─ Code blocks              │       │
│  │ └─ Plain text   │    ends       │ ├─ Links                    │       │
│  │                 │               │ └─ Tables                   │       │
│  │ No markdown     │               │                             │       │
│  │ rendering       │               │ Toggle: [Raw] [Markdown]    │       │
│  │                 │               │                             │       │
│  └─────────────────┘               │ data-raw-content stores     │       │
│                                    │ original markdown           │       │
│                                    └─────────────────────────────┘       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## File Changes

### 1. packages/mimo-platform/package.json
Add `marked` dependency for client-side markdown rendering.

### 2. packages/mimo-platform/public/js/chat.js

#### New Function: `renderMarkdown(content)`
```javascript
// Render markdown to HTML using marked
function renderMarkdown(content) {
  return marked.parse(content, {
    gfm: true,
    breaks: true,
    headerIds: false,
  });
}
```

#### Modified: `finalizeMessageStream()`
```javascript
function finalizeMessageStream() {
  // ... existing code ...
  
  const contentEl = ChatState.streaming.messageElement.querySelector('.message-content');
  const rawContent = ChatState.streaming.content;
  
  // Store raw content
  contentEl.dataset.rawContent = rawContent;
  
  // Render markdown
  contentEl.innerHTML = renderMarkdown(rawContent);
  contentEl.classList.add('markdown-rendered');
  
  // Add toggle buttons
  addViewToggleButtons(ChatState.streaming.messageElement, contentEl);
  
  // ... rest of existing code ...
}
```

#### New Function: `addViewToggleButtons(messageEl, contentEl)`
```javascript
function addViewToggleButtons(messageEl, contentEl) {
  const header = messageEl.querySelector('.message-header');
  
  const toggleContainer = document.createElement('span');
  toggleContainer.className = 'message-view-toggle-container';
  toggleContainer.style.marginLeft = 'auto';
  toggleContainer.style.display = 'flex';
  toggleContainer.style.gap = '4px';
  
  const rawBtn = document.createElement('button');
  rawBtn.className = 'view-toggle-btn';
  rawBtn.textContent = 'Raw';
  rawBtn.dataset.view = 'raw';
  
  const mdBtn = document.createElement('button');
  mdBtn.className = 'view-toggle-btn active';
  mdBtn.textContent = 'Markdown';
  mdBtn.dataset.view = 'markdown';
  
  toggleContainer.appendChild(rawBtn);
  toggleContainer.appendChild(mdBtn);
  
  // Insert before copy button
  const copyBtn = header.querySelector('.copy-btn');
  header.insertBefore(toggleContainer, copyBtn);
  
  // Event handlers
  rawBtn.addEventListener('click', () => {
    contentEl.textContent = contentEl.dataset.rawContent;
    contentEl.classList.remove('markdown-rendered');
    rawBtn.classList.add('active');
    mdBtn.classList.remove('active');
  });
  
  mdBtn.addEventListener('click', () => {
    contentEl.innerHTML = renderMarkdown(contentEl.dataset.rawContent);
    contentEl.classList.add('markdown-rendered');
    mdBtn.classList.add('active');
    rawBtn.classList.remove('active');
  });
}
```

#### Modified: `renderMessage()` 
For non-streaming messages (history load), also add toggle buttons:
```javascript
function renderMessage(message) {
  // ... existing code ...
  
  // After creating message element
  if (message.role === 'assistant') {
    const contentEl = div.querySelector('.message-content');
    const rawContent = message.content;
    
    contentEl.dataset.rawContent = rawContent;
    contentEl.innerHTML = renderMarkdown(rawContent);
    contentEl.classList.add('markdown-rendered');
    
    // Defer toggle button addition to allow DOM insertion
    setTimeout(() => addViewToggleButtons(div, contentEl), 0);
  }
  
  return div;
}
```

### 3. packages/mimo-platform/src/components/SessionDetailPage.tsx

#### CSS Styles to Add
```css
/* Markdown rendered content */
.message-content.markdown-rendered {
  line-height: 1.6;
}

.message-content.markdown-rendered h1,
.message-content.markdown-rendered h2,
.message-content.markdown-rendered h3,
.message-content.markdown-rendered h4 {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
}

.message-content.markdown-rendered h1 { font-size: 1.5em; }
.message-content.markdown-rendered h2 { font-size: 1.3em; }
.message-content.markdown-rendered h3 { font-size: 1.1em; }

.message-content.markdown-rendered p {
  margin-bottom: 12px;
}

.message-content.markdown-rendered ul,
.message-content.markdown-rendered ol {
  margin-bottom: 12px;
  padding-left: 24px;
}

.message-content.markdown-rendered li {
  margin-bottom: 4px;
}

.message-content.markdown-rendered code {
  background: #2d2d2d;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.9em;
}

.message-content.markdown-rendered pre {
  background: #1a1a1a;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin-bottom: 12px;
}

.message-content.markdown-rendered pre code {
  background: transparent;
  padding: 0;
}

.message-content.markdown-rendered blockquote {
  border-left: 3px solid #555;
  padding-left: 12px;
  margin-left: 0;
  color: #aaa;
}

.message-content.markdown-rendered a {
  color: #58a6ff;
  text-decoration: none;
}

.message-content.markdown-rendered a:hover {
  text-decoration: underline;
}

.message-content.markdown-rendered table {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 12px;
}

.message-content.markdown-rendered th,
.message-content.markdown-rendered td {
  border: 1px solid #444;
  padding: 6px 12px;
  text-align: left;
}

.message-content.markdown-rendered th {
  background: #2d2d2d;
  font-weight: 600;
}

/* Toggle buttons */
.message-view-toggle-container {
  display: flex;
  gap: 4px;
}

.view-toggle-btn {
  background: #3d3d3d;
  border: 1px solid #555;
  color: #888;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-family: monospace;
}

.view-toggle-btn:hover {
  background: #4d4d4d;
  color: #ccc;
}

.view-toggle-btn.active {
  background: #555;
  color: #fff;
  border-color: #777;
}
```

## Data Flow

1. **Message chunks arrive** → `updateMessageContent()` appends via `textContent`
2. **Stream ends** → `finalizeMessageStream()` called
3. **finalizeMessageStream**:
   - Stores raw content: `contentEl.dataset.rawContent = rawContent`
   - Renders markdown: `contentEl.innerHTML = renderMarkdown(rawContent)`
   - Adds toggle buttons via `addViewToggleButtons()`
4. **User clicks [Raw]**:
   - Sets `contentEl.textContent = dataset.rawContent`
   - Updates button active states
5. **User clicks [Markdown]**:
   - Sets `contentEl.innerHTML = renderMarkdown(dataset.rawContent)`
   - Updates button active states

## Edge Cases

1. **Empty messages**: Render nothing, no toggle needed
2. **Non-markdown content**: Rendered as plain text (marked handles this gracefully)
3. **HTML in markdown**: `marked` escapes HTML by default (safe)
4. **Very long messages**: Scroll within message container, markdown rendering doesn't affect this
5. **Copy button**: Should copy raw markdown always (already uses `textContent` which gets raw content)

## Security Considerations

- `marked` escapes HTML by default, preventing XSS
- Content comes from trusted agent, not user input
- `innerHTML` usage is safe given the above
