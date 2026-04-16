// ═════════════════════════════════════════════════════════════════════════════
// CHAT THREADS - Multi-thread chat management for shared workspace sessions
//
// This module extends the chat.js functionality to support multiple threads
// per session with per-thread model/mode configuration.
// ═════════════════════════════════════════════════════════════════════════════

"use strict";

// Thread state
const ChatThreadsState = {
  sessionId: null,
  threads: [],
  activeThreadId: null,
  isLoading: false,
};

// ═════════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

async function fetchThreads() {
  if (!ChatThreadsState.sessionId) return;
  
  try {
    const response = await fetch(`/sessions/${ChatThreadsState.sessionId}/chat-threads`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    ChatThreadsState.threads = data.threads || [];
    ChatThreadsState.activeThreadId = data.activeChatThreadId;
    
    return data;
  } catch (error) {
    console.error("[chat-threads] Failed to fetch threads:", error);
    return null;
  }
}

async function createThread(name, model, mode) {
  if (!ChatThreadsState.sessionId) return null;
  
  try {
    const response = await fetch(`/sessions/${ChatThreadsState.sessionId}/chat-threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, model, mode }),
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const newThread = await response.json();
    ChatThreadsState.threads.push(newThread);
    
    return newThread;
  } catch (error) {
    console.error("[chat-threads] Failed to create thread:", error);
    alert(`Failed to create thread: ${error.message}`);
    return null;
  }
}

async function updateThread(threadId, updates) {
  if (!ChatThreadsState.sessionId) return null;
  
  try {
    const response = await fetch(
      `/sessions/${ChatThreadsState.sessionId}/chat-threads/${threadId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }
    );
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const updated = await response.json();
    
    // Update local state
    const idx = ChatThreadsState.threads.findIndex((t) => t.id === threadId);
    if (idx !== -1) {
      ChatThreadsState.threads[idx] = { ...ChatThreadsState.threads[idx], ...updated };
    }
    
    return updated;
  } catch (error) {
    console.error("[chat-threads] Failed to update thread:", error);
    return null;
  }
}

async function deleteThread(threadId) {
  if (!ChatThreadsState.sessionId) return false;
  
  try {
    const response = await fetch(
      `/sessions/${ChatThreadsState.sessionId}/chat-threads/${threadId}`,
      { method: "DELETE" }
    );
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    ChatThreadsState.threads = ChatThreadsState.threads.filter((t) => t.id !== threadId);
    
    return true;
  } catch (error) {
    console.error("[chat-threads] Failed to delete thread:", error);
    alert(`Failed to delete thread: ${error.message}`);
    return false;
  }
}

async function activateThread(threadId) {
  if (!ChatThreadsState.sessionId) return null;
  
  try {
    const response = await fetch(
      `/sessions/${ChatThreadsState.sessionId}/chat-threads/${threadId}/activate`,
      { method: "POST" }
    );
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    ChatThreadsState.activeThreadId = data.activeChatThreadId;
    
    return data.activeChatThreadId;
  } catch (error) {
    console.error("[chat-threads] Failed to activate thread:", error);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// UI FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

function getActiveThread() {
  return ChatThreadsState.threads.find((t) => t.id === ChatThreadsState.activeThreadId);
}

function switchToThread(threadId) {
  // Update UI immediately for responsiveness
  ChatThreadsState.activeThreadId = threadId;
  updateThreadTabsUI();
  updateThreadContextUI();
  
  // Persist to server
  activateThread(threadId).then((newActiveId) => {
    if (newActiveId) {
      if (
        window.MIMO_CHAT &&
        typeof window.MIMO_CHAT.prepareThreadSwitch === "function"
      ) {
        window.MIMO_CHAT.prepareThreadSwitch();
      }

      // Clear current chat and request history for new thread
      const container = document.querySelector("#chat-messages");
      if (container) {
        container.setAttribute("data-active-thread-id", threadId);
        // Clear existing messages (but don't show "No messages yet" until we get the response)
        container.innerHTML = '';
      }
      
      // Request thread-specific history/state via WebSocket
      if (window.MIMO_CHAT_SOCKET?.readyState === WebSocket.OPEN) {
        window.MIMO_CHAT_SOCKET.send(JSON.stringify({
          type: "request_replay",
          sessionId: ChatThreadsState.sessionId,
          chatThreadId: threadId,
        }));

        window.MIMO_CHAT_SOCKET.send(JSON.stringify({
          type: "request_state",
          sessionId: ChatThreadsState.sessionId,
          chatThreadId: threadId,
        }));
      }
      
      // Re-initialize editable bubble
      if (typeof removeEditableBubble === "function") {
        removeEditableBubble();
      }
    }
  });
}

function updateThreadTabsUI() {
  const tabsContainer = document.querySelector(".chat-threads-tabs");
  if (!tabsContainer) return;
  
  // Remove existing thread tabs (keep the create button)
  tabsContainer.querySelectorAll(".chat-thread-tab").forEach((tab) => tab.remove());
  
  // Insert thread tabs before the create button
  const createBtn = tabsContainer.querySelector("#create-thread-btn");
  
  ChatThreadsState.threads.forEach((thread) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `chat-thread-tab ${thread.id === ChatThreadsState.activeThreadId ? "active" : ""}`;
    tab.dataset.threadId = thread.id;
    tab.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-right: 1px solid #444;
      background: ${thread.id === ChatThreadsState.activeThreadId ? "#1a1a1a" : "transparent"};
      color: ${thread.id === ChatThreadsState.activeThreadId ? "#d4d4d4" : "#888"};
      cursor: pointer;
      font-family: monospace;
      font-size: 12px;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
    `;
    
    const statusColor = thread.state === "active" ? "#51cf66" : 
                       thread.state === "waking" ? "#ffd43b" : "#888";
    
    tab.innerHTML = `
      <span class="thread-status-indicator" style="
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: ${statusColor};
      "></span>
      ${escapeHtml(thread.name)}
    `;
    
    tab.addEventListener("click", () => switchToThread(thread.id));
    
    if (createBtn) {
      tabsContainer.insertBefore(tab, createBtn);
    } else {
      tabsContainer.appendChild(tab);
    }
  });
}

function updateThreadContextUI() {
  const container = document.querySelector(".chat-thread-context");
  if (!container) return;
  
  const activeThread = getActiveThread();
  if (!activeThread) {
    container.innerHTML = "<div style=\"color: #888; font-size: 12px;\">No active thread. Use + New Thread to get started.</div>";
    return;
  }
  
  // Re-render the context bar
  const models = window.MIMO_CHAT_MODELS || [];
  const modes = window.MIMO_CHAT_MODES || [];
  
  let html = `
    <div style="font-size: 12px; color: #888; white-space: nowrap;">
      Thread: <span style="color: #d4d4d4;">${escapeHtml(activeThread.name)}</span>
    </div>
  `;
  
  // Model Selector - always show
  html += `
    <div class="thread-model-selector" style="display: flex; align-items: center; gap: 6px; white-space: nowrap;">
      <label style="font-size: 11px; color: #888; text-transform: uppercase;">Model:</label>
      <select id="thread-model-select" data-thread-id="${activeThread.id}" style="
        background: #2d2d2d;
        border: 1px solid #444;
        color: #d4d4d4;
        padding: 4px 8px;
        font-family: monospace;
        font-size: 11px;
        border-radius: 3px;
        cursor: pointer;
        min-width: 120px;
      ">
        ${models.length > 0 ? models.map(m => `
          <option value="${escapeHtml(m.value)}" ${m.value === activeThread.model ? "selected" : ""}>
            ${escapeHtml(m.name)}
          </option>
        `).join("") : '<option value="">Loading...</option>'}
      </select>
    </div>
  `;
  
  // Mode Selector - always show
  html += `
    <div class="thread-mode-selector" style="display: flex; align-items: center; gap: 6px; white-space: nowrap;">
      <label style="font-size: 11px; color: #888; text-transform: uppercase;">Mode:</label>
      <select id="thread-mode-select" data-thread-id="${activeThread.id}" style="
        background: #2d2d2d;
        border: 1px solid #444;
        color: #d4d4d4;
        padding: 4px 8px;
        font-family: monospace;
        font-size: 11px;
        border-radius: 3px;
        cursor: pointer;
        min-width: 100px;
      ">
        ${modes.length > 0 ? modes.map(m => `
          <option value="${escapeHtml(m.value)}" ${m.value === activeThread.mode ? "selected" : ""}>
            ${escapeHtml(m.name)}
          </option>
        `).join("") : '<option value="">Loading...</option>'}
      </select>
    </div>
  `;
  
  // Spacer to push delete button to the right
  html += `<div style="flex: 1;"></div>`;

  html += `
    <button type="button" id="clear-thread-btn" data-thread-id="${activeThread.id}" style="
      padding: 4px 8px;
      background: transparent;
      border: 1px solid #555;
      color: #888;
      font-family: monospace;
      font-size: 10px;
      cursor: pointer;
      border-radius: 3px;
      white-space: nowrap;
    " title="Clear context for this thread only">Clear</button>
  `;
  
  html += `
    <button type="button" id="delete-thread-btn" data-thread-id="${activeThread.id}" style="
      padding: 4px 8px;
      background: transparent;
      border: 1px solid #555;
      color: #888;
      font-family: monospace;
      font-size: 10px;
      cursor: pointer;
      border-radius: 3px;
      white-space: nowrap;
    ">Delete</button>
  `;
  
  container.innerHTML = html;
  
  // Re-attach event listeners
  attachThreadContextListeners();
}

function attachThreadContextListeners() {
  // Model selector
  const modelSelect = document.querySelector("#thread-model-select");
  if (modelSelect) {
    modelSelect.addEventListener("change", async (e) => {
      const threadId = e.target.dataset.threadId;
      const modelId = e.target.value;
      await updateThread(threadId, { model: modelId });
      
      // Notify via WebSocket if connected
      if (window.MIMO_CHAT_SOCKET?.readyState === WebSocket.OPEN) {
        window.MIMO_CHAT_SOCKET.send(JSON.stringify({
          type: "set_model",
          chatThreadId: threadId,
          modelId: modelId,
        }));
      }
    });
  }
  
  // Mode selector
  const modeSelect = document.querySelector("#thread-mode-select");
  if (modeSelect) {
    modeSelect.addEventListener("change", async (e) => {
      const threadId = e.target.dataset.threadId;
      const modeId = e.target.value;
      await updateThread(threadId, { mode: modeId });
      
      // Notify via WebSocket if connected
      if (window.MIMO_CHAT_SOCKET?.readyState === WebSocket.OPEN) {
        window.MIMO_CHAT_SOCKET.send(JSON.stringify({
          type: "set_mode",
          chatThreadId: threadId,
          modeId: modeId,
        }));
      }
    });
  }
  
  // Delete button
  const clearBtn = document.querySelector("#clear-thread-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (window.MIMO_CHAT && typeof window.MIMO_CHAT.clearSession === "function") {
        window.MIMO_CHAT.clearSession();
      }
    });
  }

  // Delete button
  const deleteBtn = document.querySelector("#delete-thread-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const threadId = deleteBtn.dataset.threadId;
      if (!confirm("Delete this thread? This cannot be undone.")) return;
      
      const success = await deleteThread(threadId);
      if (success) {
        if (ChatThreadsState.threads.length > 0) {
          switchToThread(ChatThreadsState.threads[0].id);
        } else {
          ChatThreadsState.activeThreadId = null;
          updateThreadTabsUI();
          updateThreadContextUI();
        }
      }
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CREATE THREAD DIALOG
// ═════════════════════════════════════════════════════════════════════════════

function showCreateThreadDialog() {
  const models = window.MIMO_CHAT_MODELS || [];
  const modes = window.MIMO_CHAT_MODES || [];
  
  const dialog = document.createElement("div");
  dialog.id = "create-thread-dialog";
  dialog.className = "modal";
  dialog.style.cssText = `
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  dialog.innerHTML = `
    <div class="modal-content" style="
      background: #2d2d2d;
      border: 1px solid #444;
      padding: 20px;
      width: 90%;
      max-width: 400px;
      border-radius: 4px;
    ">
      <h3 style="margin: 0 0 15px 0; font-size: 16px;">Create New Thread</h3>
      
      <div style="margin-bottom: 15px;">
        <label style="display: block; font-size: 12px; color: #888; margin-bottom: 5px;">Name</label>
        <input type="text" id="new-thread-name" placeholder="e.g., Reviewer, Code Analysis" style="
          width: 100%;
          padding: 8px;
          background: #1a1a1a;
          border: 1px solid #444;
          color: #d4d4d4;
          font-family: monospace;
          font-size: 13px;
          border-radius: 3px;
          box-sizing: border-box;
        ">
      </div>
      
      <div style="margin-bottom: 15px;">
        <label style="display: block; font-size: 12px; color: #888; margin-bottom: 5px;">Model</label>
        <select id="new-thread-model" style="
          width: 100%;
          padding: 8px;
          background: #1a1a1a;
          border: 1px solid #444;
          color: #d4d4d4;
          font-family: monospace;
          font-size: 13px;
          border-radius: 3px;
          box-sizing: border-box;
        ">
          <option value="" disabled selected>Select a model</option>
          ${models.map(m => `<option value="${escapeHtml(m.value)}">${escapeHtml(m.name)}</option>`).join("")}
        </select>
      </div>
      
      <div style="margin-bottom: 20px;">
        <label style="display: block; font-size: 12px; color: #888; margin-bottom: 5px;">Mode</label>
        <select id="new-thread-mode" style="
          width: 100%;
          padding: 8px;
          background: #1a1a1a;
          border: 1px solid #444;
          color: #d4d4d4;
          font-family: monospace;
          font-size: 13px;
          border-radius: 3px;
          box-sizing: border-box;
        ">
          <option value="" disabled selected>Select a mode</option>
          ${modes.map(m => `<option value="${escapeHtml(m.value)}">${escapeHtml(m.name)}</option>`).join("")}
        </select>
      </div>
      
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button type="button" id="cancel-create-thread" class="btn-secondary" style="
          padding: 6px 12px;
          border: none;
          cursor: pointer;
          font-family: monospace;
          font-size: 12px;
          text-decoration: none;
          border-radius: 3px;
          background: #3d3d3d;
          color: #d4d4d4;
        ">Cancel</button>
        <button type="button" id="confirm-create-thread" class="btn-primary" style="
          padding: 6px 12px;
          border: none;
          cursor: pointer;
          font-family: monospace;
          font-size: 12px;
          text-decoration: none;
          border-radius: 3px;
          background: #74c0fc;
          color: #1a1a1a;
        ">Create</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  // Focus the name input
  setTimeout(() => document.querySelector("#new-thread-name")?.focus(), 0);
  
  // Event handlers
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      dialog.remove();
    }
  });
  
  document.querySelector("#cancel-create-thread")?.addEventListener("click", () => {
    dialog.remove();
  });
  
  document.querySelector("#confirm-create-thread")?.addEventListener("click", async () => {
    const nameInput = document.querySelector("#new-thread-name");
    const modelSelect = document.querySelector("#new-thread-model");
    const modeSelect = document.querySelector("#new-thread-mode");
    
    const name = nameInput?.value.trim();
    if (!name) {
      alert("Please enter a thread name");
      return;
    }
    
    if (models.length === 0 || modes.length === 0) {
      alert("Model and mode must be loaded before creating a thread");
      return;
    }

    const model = modelSelect?.value || "";
    const mode = modeSelect?.value || "";

    if (!model) {
      alert("Please select a model");
      return;
    }

    if (!mode) {
      alert("Please select a mode");
      return;
    }
    
    const newThread = await createThread(name, model, mode);
    if (newThread) {
      dialog.remove();
      
      // Add the new thread tab and switch to it
      updateThreadTabsUI();
      switchToThread(newThread.id);
    }
  });
  
  // Enter key to submit
  document.querySelector("#new-thread-name")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      document.querySelector("#confirm-create-thread")?.click();
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ═════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═════════════════════════════════════════════════════════════════════════════

async function initChatThreads(sessionId) {
  ChatThreadsState.sessionId = sessionId;
  
  // Fetch threads data
  await fetchThreads();
  
  // Setup event listeners
  const createBtn = document.querySelector("#create-thread-btn");
  if (createBtn) {
    createBtn.addEventListener("click", showCreateThreadDialog);
  }
  
  // Initial UI render
  updateThreadTabsUI();
  updateThreadContextUI();
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════

window.MIMO_CHAT_THREADS = {
  init: initChatThreads,
  getActiveThreadId: () => ChatThreadsState.activeThreadId,
  getActiveThread: getActiveThread,
  refresh: async () => {
    await fetchThreads();
    updateThreadTabsUI();
    updateThreadContextUI();
  },
};

// Auto-initialize if session ID is available
if (window.MIMO_SESSION_ID) {
  // Wait for DOM and chat.js to initialize
  setTimeout(() => initChatThreads(window.MIMO_SESSION_ID), 100);
}
