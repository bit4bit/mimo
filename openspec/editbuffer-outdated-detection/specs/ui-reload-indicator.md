# Spec: UI Reload Indicator

## Responsibility
Add visual indicator and reload button to EditBuffer context bar when file is outdated.

## Context Bar Changes

### Current Context Bar (EditBuffer.tsx lines 43-68)
```jsx
<div id="edit-buffer-context" style="display: none; ...">
  <span id="edit-buffer-filepath"></span>
  <span id="edit-buffer-linecount"></span>
  <span id="edit-buffer-language"></span>
  <div style="flex: 1;"></div>
  <button id="close-file-btn">✕ Close</button>
</div>
```

### New Context Bar Structure
```jsx
<div id="edit-buffer-context" style="display: none; ...">
  <span id="edit-buffer-filepath"></span>
  <span id="edit-buffer-linecount"></span>
  <span id="edit-buffer-language"></span>
  
  <!-- NEW: Outdated indicator (hidden by default) -->
  <span 
    id="edit-buffer-outdated-indicator" 
    style="display: none; color: #ff9800; font-size: 11px; margin-left: 12px;"
  >
    ● Outdated
  </span>
  
  <!-- NEW: Reload button (hidden by default) -->
  <button
    type="button"
    id="reload-file-btn"
    style="display: none; margin-left: 8px; padding: 4px 8px; ..."
    title="Reload file (Alt+Shift+R)"
  >
    ↻ Reload
  </button>
  
  <div style="flex: 1;"></div>
  <button id="close-file-btn">✕ Close</button>
</div>
```

## Styling

```css
/* Add to SessionDetailPage or inline styles */

#edit-buffer-outdated-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #ff9800;
  font-size: 11px;
  font-weight: 500;
}

#edit-buffer-outdated-indicator::before {
  content: "●";
  color: #ff9800;
}

#reload-file-btn {
  padding: 4px 10px;
  background: #3d3d3d;
  border: 1px solid #555;
  color: #ccc;
  font-family: monospace;
  font-size: 11px;
  cursor: pointer;
  border-radius: 3px;
  margin-left: 8px;
}

#reload-file-btn:hover {
  background: #4a4a4a;
  border-color: #777;
}
```

## Render Logic (edit-buffer.js)

```javascript
function renderContextBar() {
  const ctx = document.getElementById("edit-buffer-context");
  if (!ctx) return;
  
  const active = EditBufferState.getActive();
  if (!active) {
    ctx.style.display = "none";
    return;
  }
  
  ctx.style.display = "flex";
  
  // Existing elements
  const pathEl = document.getElementById("edit-buffer-filepath");
  const linesEl = document.getElementById("edit-buffer-linecount");
  const langEl = document.getElementById("edit-buffer-language");
  
  if (pathEl) pathEl.textContent = active.path;
  if (linesEl) linesEl.textContent = "Lines: " + active.lineCount;
  if (langEl) langEl.textContent = active.language;
  
  // NEW: Show/hide outdated indicator and reload button
  const outdatedEl = document.getElementById("edit-buffer-outdated-indicator");
  const reloadBtn = document.getElementById("reload-file-btn");
  
  if (outdatedEl) {
    outdatedEl.style.display = active.isOutdated ? "flex" : "none";
  }
  
  if (reloadBtn) {
    reloadBtn.style.display = active.isOutdated ? "block" : "none";
  }
}
```

## Event Wiring (edit-buffer.js init())

```javascript
function init() {
  // ... existing wiring ...
  
  // Wire reload button
  const reloadBtn = document.getElementById("reload-file-btn");
  if (reloadBtn) {
    reloadBtn.addEventListener("click", reloadCurrentFile);
  }
  
  // ... rest of init ...
}

function reloadCurrentFile() {
  const active = EditBufferState.getActive();
  if (!active || !active.isOutdated) return;
  
  const sessionId = getSessionId();
  if (!sessionId) return;
  
  EditBufferState.reloadFile(active.path, sessionId, function() {
    renderEditBuffer();
  });
}
```

## Accessibility
- Button has clear label "Reload"
- Tooltip shows keyboard shortcut
- Visual indicator uses color + text (not just color)
