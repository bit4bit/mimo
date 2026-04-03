// MIMO Emacs-style Keybinding System
// This file is injected into the HTML and runs on the client side

(function() {
  'use strict';

  // Keybinding state
  let prefixKey = null;
  let prefixTimeout = null;
  const PREFIX_TIMEOUT_MS = 2000;

  // Current buffer focus
  let currentBuffer = 'center';

  // Key sequence buffer for multi-key chords
  let keyBuffer = [];

  // Keybindings configuration (will be injected from server)
  const keybindings = window.MIMO_KEYBINDINGS || {
    cancel_request: "C-c C-c",
    commit: "C-x c",
    find_file: "C-x C-f",
    switch_project: "C-x p",
    switch_session: "C-x s",
    focus_left: "C-x h",
    focus_center: "C-x j",
    focus_right: "C-x l",
  };

  // Parse keybinding string to key sequence
  function parseKeybinding(binding) {
    return binding.split(' ').map(key => {
      const parts = [];
      if (key.includes('C-')) parts.push('ctrl');
      if (key.includes('M-')) parts.push('alt');
      if (key.includes('S-')) parts.push('shift');
      
      // Extract the actual key
      let actualKey = key.replace(/C-|M-|S-/g, '');
      if (actualKey === 'RET') actualKey = 'Enter';
      if (actualKey === 'SPC') actualKey = ' ';
      
      return { modifiers: parts, key: actualKey };
    });
  }

  // Check if current key sequence matches a binding
  function matchesBinding(sequence, binding) {
    const parsed = parseKeybinding(binding);
    
    if (sequence.length !== parsed.length) return false;
    
    for (let i = 0; i < sequence.length; i++) {
      const seqKey = sequence[i];
      const bindKey = parsed[i];
      
      // Check key
      if (seqKey.key !== bindKey.key && 
          seqKey.key.toLowerCase() !== bindKey.key.toLowerCase()) {
        return false;
      }
      
      // Check modifiers
      const hasCtrl = seqKey.ctrl === bindKey.modifiers.includes('ctrl');
      const hasAlt = seqKey.alt === bindKey.modifiers.includes('alt');
      const hasShift = seqKey.shift === bindKey.modifiers.includes('shift');
      
      if (!hasCtrl || !hasAlt || !hasShift) return false;
    }
    
    return true;
  }

  // Execute command based on keybinding
  async function executeCommand(command) {
    console.log('Executing command:', command);
    
    switch (command) {
      case 'cancel_request':
        await cancelCurrentRequest();
        break;
      case 'commit':
        await showCommitDialog();
        break;
      case 'find_file':
        showFileFinder();
        break;
      case 'switch_project':
        showProjectSwitcher();
        break;
      case 'switch_session':
        showSessionSwitcher();
        break;
      case 'focus_left':
        focusBuffer('left');
        break;
      case 'focus_center':
        focusBuffer('center');
        break;
      case 'focus_right':
        focusBuffer('right');
        break;
      default:
        console.log('Unknown command:', command);
    }
  }

  // Command implementations
  async function cancelCurrentRequest() {
    const sessionId = getSessionId();
    if (!sessionId) {
      showStatus('No active session');
      return;
    }
    
    try {
      const res = await fetch(`/sessions/${sessionId}/cancel`, {
        method: 'POST',
      });
      const data = await res.json();
      
      if (data.success) {
        showStatus('Request cancelled');
      } else {
        showStatus('No active request to cancel');
      }
    } catch (error) {
      showStatus('Failed to cancel request');
    }
  }

  async function showCommitDialog() {
    const message = prompt('Commit message:');
    if (!message) return;
    
    showStatus('Committing...');
    // TODO: Implement commit
    showStatus('Committed: ' + message);
  }

  function showFileFinder() {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'mimo-modal';
    modal.innerHTML = `
      <div class="mimo-modal-content">
        <div class="mimo-modal-header">Find File</div>
        <input type="text" class="mimo-modal-input" placeholder="Type to search..." autofocus>
        <div class="mimo-modal-results"></div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const input = modal.querySelector('.mimo-modal-input');
    const results = modal.querySelector('.mimo-modal-results');
    
    // Focus input
    input.focus();
    
    // Close on Escape
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        modal.remove();
      }
    });
    
    // Close on click outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  function showProjectSwitcher() {
    window.location.href = '/projects';
  }

  function showSessionSwitcher() {
    const sessionId = getSessionId();
    if (!sessionId) return;
    
    // Extract project ID from current URL
    const match = window.location.pathname.match(/\/projects\/([^\/]+)/);
    if (match) {
      window.location.href = `/projects/${match[1]}/sessions`;
    }
  }

  function focusBuffer(buffer) {
    currentBuffer = buffer;
    
    // Remove focus from all buffers
    document.querySelectorAll('.buffer').forEach(b => {
      b.classList.remove('buffer-focused');
    });
    
    // Add focus to selected buffer
    const target = document.querySelector(`.buffer-${buffer}`);
    if (target) {
      target.classList.add('buffer-focused');
      target.focus();
    }
    
    showStatus(`Focus: ${buffer}`);
  }

  // Helper functions
  function getSessionId() {
    const match = window.location.pathname.match(/\/sessions\/([^\/]+)/);
    return match ? match[1] : null;
  }

  function showStatus(message) {
    const statusLine = document.querySelector('.status-line-message');
    if (statusLine) {
      statusLine.textContent = message;
      setTimeout(() => {
        statusLine.textContent = '';
      }, 3000);
    }
  }

  // Event key to our key format
  function eventToKey(e) {
    return {
      key: e.key,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    };
  }

  // Check if we're in an input field
  function isInputActive() {
    const active = document.activeElement;
    return active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      active.contentEditable === 'true'
    );
  }

  // Main keyboard event handler
  document.addEventListener('keydown', (e) => {
    // Don't intercept when typing in inputs (unless it's Escape)
    if (isInputActive() && e.key !== 'Escape') {
      return;
    }
    
    // Don't intercept if modifier is held with printable key (let typing work)
    if (!e.ctrlKey && !e.altKey && e.key.length === 1) {
      return;
    }
    
    const key = eventToKey(e);
    
    // Add to buffer
    keyBuffer.push(key);
    
    // Clear timeout
    if (prefixTimeout) {
      clearTimeout(prefixTimeout);
    }
    
    // Set new timeout to clear buffer
    prefixTimeout = setTimeout(() => {
      keyBuffer = [];
    }, PREFIX_TIMEOUT_MS);
    
    // Check all keybindings
    for (const [command, binding] of Object.entries(keybindings)) {
      if (matchesBinding(keyBuffer, binding)) {
        e.preventDefault();
        e.stopPropagation();
        executeCommand(command);
        keyBuffer = [];
        clearTimeout(prefixTimeout);
        return;
      }
    }
    
    // If we're building a prefix but haven't matched yet, prevent default
    // for certain keys to avoid browser actions
    if (keyBuffer.length > 0 && key.ctrlKey) {
      e.preventDefault();
    }
  });

  // Initialize
  console.log('MIMO keybindings loaded:', keybindings);
  
  // Set initial focus
  focusBuffer('center');
})();
