# Spec: Reload Keybinding

## Responsibility
Add Alt+Shift+R keybinding to reload the currently active file when it's outdated.

## Keybinding Configuration

### Default Keybindings (session-keybindings.js)

Add to DEFAULT_KEYBINDINGS object:

```javascript
const DEFAULT_KEYBINDINGS = {
  // ... existing keybindings ...
  reloadFile: "Alt+Shift+R",
};
```

### Configuration Loading

Extend getConfiguredKeybindings() to include reloadFile:

```javascript
function getConfiguredKeybindings() {
  const configured = Object.assign({}, DEFAULT_KEYBINDINGS);
  const raw = window.MIMO_SESSION_KEYBINDINGS;
  if (!raw || typeof raw !== "object") {
    return configured;
  }
  
  // Load all existing keybindings...
  
  // NEW: Load reloadFile keybinding
  if (typeof raw.reloadFile === "string" && raw.reloadFile.trim().length > 0) {
    configured.reloadFile = raw.reloadFile.trim();
  }
  
  return configured;
}
```

## Event Handler

### Keydown Handler Addition

In onKeyDown function, add after closeFile handling:

```javascript
function onKeyDown(event) {
  // ... existing escape/modal handling ...
  
  let handled = false;
  
  // ... existing edit buffer keybindings ...
  
  // NEW: Reload file keybinding
  if (bindingMatches(event, keybindings.reloadFile)) {
    if (window.EditBuffer) {
      handled = window.EditBuffer.reloadCurrentFile();
    }
  }
  
  // ... rest of keybindings ...
}
```

## Exposed Function

### EditBuffer API Extension

Add to window.EditBuffer object:

```javascript
window.EditBuffer = {
  // ... existing methods ...
  reloadCurrentFile: reloadCurrentFile,
};
```

### reloadCurrentFile Implementation

```javascript
function reloadCurrentFile() {
  const active = EditBufferState.getActive();
  
  // Only reload if there's an active file and it's outdated
  if (!active || !active.isOutdated) {
    return false;
  }
  
  const sessionId = getSessionId();
  if (!sessionId) return false;
  
  // Save scroll position before reload
  const contentEl = document.getElementById("edit-buffer-content");
  if (contentEl && active) {
    EditBufferState.setScrollPosition(active.path, contentEl.scrollTop);
  }
  
  // Perform reload
  EditBufferState.reloadFile(active.path, sessionId, function() {
    renderEditBuffer();
  });
  
  return true;
}
```

## Return Value Semantics

The reloadCurrentFile function returns:
- `true` - Reload was initiated (file was outdated)
- `false` - No reload occurred (no active file, or file not outdated)

This allows the keybinding handler to properly handle the event (prevent default when handled).

## Shortcut Help Integration

If there's a shortcuts help display, add:
- Reload file: Alt+Shift+R

## Conflict Resolution

The reloadFile keybinding (Alt+Shift+R) should not conflict with existing bindings:
- openFileFinder: Mod+Shift+F
- closeFile: Alt+Shift+W
- nextFile: Mod+Alt+ArrowRight
- previousFile: Mod+Alt+ArrowLeft
- nextLeftBuffer: Alt+Shift+PageDown
- previousLeftBuffer: Alt+Shift+PageUp

Alt+Shift+R is available and follows the pattern of Alt+Shift+W for close.
