// ═════════════════════════════════════════════════════════════════════════════
// MIMO CHAT SYSTEM - Functional Architecture
//
// Organization: Top-down by importance
// 1. STATE        - Global mutable state (single source of truth)
// 2. VIEWS        - Pure functions that render DOM elements
// 3. SERVICES     - Business logic, calculations, transformations
// 4. CONTROLLER   - Event handlers and WebSocket management
// 5. DOM MANIPULATION - View insertion and updates
// 6. SETUP        - Event listeners
// 7. PUBLIC API   - Exposed functions
// 8. BOOTSTRAP    - Entry point
// ═════════════════════════════════════════════════════════════════════════════

"use strict";

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1: GLOBAL STATE
// Single mutable state object. All state lives here. Functions receive it,
// modify via setters, never create parallel state.
// ═════════════════════════════════════════════════════════════════════════════

const ChatState = {
  // Identity
  sessionId: null,

  // Connection
  socket: null,
  connectionStatus: "disconnected", // 'connected' | 'disconnected' | 'error'

  // Agent Status
  agentStatus: "offline", // 'online' | 'offline'
  acpStatus: "active", // 'active' | 'parked' | 'waking'

  // Streaming
  streaming: {
    active: false,
    messageElement: null,
    thoughtElement: null,
    content: "",
    thoughtContent: "",
    timeout: null,
    lastActivity: null,
    reconstructed: false,
    startTime: null,
  },

  // Duration tracking
  totalDurationMs: 0,

  // Input
  editableBubble: null,
  pendingMessages: new Set(),

  // Config
  modelState: null,
  modeState: null,

  // Impact
  impact: {
    stale: false,
    calculating: false,
    metrics: null,
    trends: null,
  },

  frames: {
    left: "chat",
    right: "impact",
  },

  // Constants
  STREAMING_TIMEOUT_MS:
    (typeof window !== "undefined" && window.MIMO_STREAMING_TIMEOUT_MS) ||
    600000,
};

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2: VIEWS (Pure Functions)
// These functions create and return DOM elements. They don't touch state,
// don't attach event listeners, don't make side effects. They just build UI.
// ═════════════════════════════════════════════════════════════════════════════

// View: Connection status indicator
function renderConnectionStatus(status) {
  const el = document.createElement("span");
  el.className = `connection-status ${status}`;
  el.textContent = status === "connected" ? "●" : "○";
  el.style.color = status === "connected" ? "#51cf66" : "#888";
  el.title = `Connection: ${status}`;
  return el;
}

// View: Message bubble (user/agent/system)
function renderMessage(message) {
  const div = document.createElement("div");
  // Add 'cancelled' class if message was cancelled
  const isCancelled = message.metadata?.cancelled === true;
  div.className = `message message-${message.role}${isCancelled ? " cancelled" : ""}`;
  div.dataset.messageId = message.id || Date.now().toString();

  const header = document.createElement("div");
  header.className = "message-header";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const label = document.createElement("span");
  label.textContent =
    message.role === "user"
      ? "You"
      : message.role === "assistant"
        ? "Agent"
        : "System";

  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.textContent = "📋";

  header.appendChild(label);

  // Show cancelled indicator for cancelled messages
  if (isCancelled) {
    const cancelledIndicator = document.createElement("span");
    cancelledIndicator.className = "cancelled-indicator";
    cancelledIndicator.style.cssText =
      "font-size: 0.75em; color: #ff6b6b; margin-left: 8px; font-style: italic;";
    cancelledIndicator.textContent = "(cancelled)";
    header.appendChild(cancelledIndicator);
  }

  if (message.role === "assistant" && message.metadata?.duration) {
    const meta = document.createElement("span");
    meta.className = "message-meta";
    meta.style.cssText = "font-size: 0.75em; color: #888; margin-left: 8px;";
    meta.textContent = `${message.metadata.duration} · ${new Date(message.timestamp).toLocaleString()}`;
    header.appendChild(meta);
  }

  header.appendChild(copyBtn);

  const content = document.createElement("div");
  content.className = "message-content";
  if (message.role === "assistant") {
    renderTextAsLines(message.content, content);
  } else {
    content.textContent = message.content;
  }

  div.appendChild(header);
  div.appendChild(content);

  return div;
}

// View: Thought section (collapsible)
function renderThoughtSection(content) {
  const div = document.createElement("div");
  div.className = "message-thought thought-collapsed";
  div.style.marginBottom = "10px";
  div.style.background = "#2d2d2d";
  div.style.borderRadius = "4px";

  const header = document.createElement("div");
  header.className = "message-header";
  header.style.background = "#3d3d3d";
  header.innerHTML = '<span class="thought-toggle">▶</span> Thought Process';
  header.style.cursor = "pointer";
  header.style.fontSize = "0.9em";
  header.style.padding = "4px 8px";
  header.style.justifyContent = "flex-start";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.style.display = "none";
  contentDiv.style.padding = "8px";
  contentDiv.style.fontSize = "0.9em";
  contentDiv.style.color = "#d4d4d4";
  contentDiv.style.background = "#2d2d2d";
  contentDiv.textContent = content;

  div.appendChild(header);
  div.appendChild(contentDiv);

  return div;
}

// View: Editable input bubble
function renderEditableBubble() {
  const bubble = document.createElement("div");
  bubble.className = "message message-user editable-bubble";

  const header = document.createElement("div");
  header.className = "message-header editable-bubble-header";

  const label = document.createElement("span");
  label.textContent = "You";

  const status = renderConnectionStatus(ChatState.connectionStatus);
  status.className = "editable-bubble-status";
  status.title = "Connection status";

  const spacer = document.createElement("span");
  spacer.style.flex = "1";

  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.className = "editable-send-btn";
  sendBtn.textContent = "⌃↵ Send";

  header.appendChild(label);
  header.appendChild(status);
  header.appendChild(spacer);
  header.appendChild(sendBtn);

  const content = document.createElement("div");
  content.className = "message-content";
  content.contentEditable = "true";
  content.setAttribute("data-placeholder", "Type a message...");

  bubble.appendChild(header);
  bubble.appendChild(content);

  return bubble;
}

// View: Streaming message (with cancel button)
function renderStreamingMessage() {
  const div = document.createElement("div");
  div.className = "message message-assistant streaming";

  const header = document.createElement("div");
  header.className = "message-header";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const agentLabel = document.createElement("span");
  agentLabel.textContent = "Agent";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "cancel-streaming-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.marginLeft = "auto";
  cancelBtn.style.fontFamily = "monospace";
  cancelBtn.style.fontSize = "11px";
  cancelBtn.style.padding = "1px 8px";
  cancelBtn.style.background = "none";
  cancelBtn.style.color = "#aaa";
  cancelBtn.style.border = "1px solid #777";
  cancelBtn.style.borderRadius = "3px";
  cancelBtn.style.cursor = "pointer";

  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.textContent = "📋";
  copyBtn.style.marginLeft = "5px";

  header.appendChild(agentLabel);
  header.appendChild(cancelBtn);
  header.appendChild(copyBtn);

  const content = document.createElement("div");
  content.className = "message-content";

  const indicator = document.createElement("span");
  indicator.className = "streaming-indicator";
  indicator.style.animation = "blink 1s infinite";
  indicator.textContent = "● Received, processing...";

  div.appendChild(header);
  div.appendChild(content);
  div.appendChild(indicator);

  return div;
}

// View: Agent status indicator
function renderAgentStatus(agentStatus, acpStatus) {
  const div = document.createElement("div");
  div.id = "agent-status-indicator";
  div.className = "agent-status-combined";

  let statusText, statusTitle, statusClass;

  if (!agentStatus || agentStatus === "offline") {
    statusText = "🔴 Agent offline";
    statusTitle = "Agent is disconnected";
    statusClass = "agent-status--offline";
  } else if (acpStatus === "active") {
    statusText = "🟢 Agent ready";
    statusTitle = "Agent is active and ready";
    statusClass = "agent-status--active";
  } else if (acpStatus === "parked") {
    statusText = "💤 Agent sleeping";
    statusTitle = "ACP is parked. Will wake on next message.";
    statusClass = "agent-status--parked";
  } else if (acpStatus === "waking") {
    statusText = "⏳ Waking up...";
    statusTitle = "ACP is starting up";
    statusClass = "agent-status--waking";
  } else {
    statusText = "🟢 Agent ready";
    statusTitle = "Agent is active and ready";
    statusClass = "agent-status--active";
  }

  div.classList.add(statusClass);
  div.textContent = statusText;
  div.title = statusTitle;

  return div;
}

// View: Notification banner
function renderNotification(message, type = "info") {
  const div = document.createElement("div");
  div.className = `message message-system notification notification--${type}`;
  div.textContent = message;
  div.style.cssText = `
    padding: 8px 12px;
    margin: 8px 0;
    border-radius: 4px;
    background: ${type === "info" ? "#e3f2fd" : type === "warning" ? "#fff3e0" : "#ffebee"};
    color: ${type === "info" ? "#1976d2" : type === "warning" ? "#f57c00" : "#d32f2f"};
    font-size: 0.9em;
    text-align: center;
  `;

  return div;
}

// View: Render text as per-line block elements (preserves newlines in clipboard)
// Each line becomes a <div>; empty lines become <div><br></div> to hold height.
function renderTextAsLines(text, container) {
  container.textContent = "";
  const lines = text.split("\n");
  for (const line of lines) {
    const div = document.createElement("div");
    if (line === "") {
      div.appendChild(document.createElement("br"));
    } else {
      div.textContent = line;
    }
    container.appendChild(div);
  }
}

// View: Permission card
function renderPermissionCard(requestId, toolCall, options) {
  const card = document.createElement("div");
  card.className = "permission-card";
  card.dataset.requestId = requestId;

  const kindLabel = toolCall?.kind
    ? `<span class="permission-kind">${toolCall.kind}</span>`
    : "";
  const title = toolCall?.title || "Tool action";
  const locations = (toolCall?.locations || [])
    .map(
      (loc) =>
        `<li>${loc.path}${loc.startLine != null ? `:${loc.startLine}` : ""}</li>`,
    )
    .join("");
  const locationsList = locations
    ? `<ul class="permission-locations">${locations}</ul>`
    : "";

  const buttons = (options || [])
    .map(
      (opt) =>
        `<button class="permission-btn permission-btn--${opt.kind}" data-option-id="${opt.optionId}">${opt.name}</button>`,
    )
    .join("");

  card.innerHTML = `
    <div class="permission-card__header">
      <span class="permission-card__title">${title}</span>
      ${kindLabel}
    </div>
    ${locationsList}
    <div class="permission-card__actions">${buttons}</div>
  `;

  return card;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3: SERVICES (Business Logic)
// Pure functions that transform data, parse content, make decisions.
// No DOM access, no state mutations, no side effects.
// ═════════════════════════════════════════════════════════════════════════════

// Service: Parse thought/message from content
function parseMessageContent(content) {
  const detailsMatch = content.match(
    /\u003cdetails\u003e\s*\u003csummary\u003e(.+?)\u003c\/summary\u003e\s*([\s\S]*?)\u003c\/details\u003e/,
  );
  if (detailsMatch) {
    return {
      hasThought: true,
      thought: detailsMatch[2].trim(),
      message: content
        .replace(/\u003cdetails\u003e[\s\S]*?\u003c\/details\u003e/, "")
        .replace(/^\s*\n+/, ""),
    };
  }
  return { hasThought: false, thought: null, message: content };
}

// Service: Parse history message for streaming chunks
function parseHistoryMessage(msg) {
  if (msg.role !== "assistant" || !msg.content) {
    return { type: "regular", data: msg };
  }

  // Cancelled messages should be treated as regular messages, not streaming chunks
  if (msg.metadata?.cancelled === true) {
    return { type: "cancelled", data: msg };
  }

  try {
    const parsed = JSON.parse(msg.content);
    if (parsed.update) {
      const updateType = parsed.update.sessionUpdate;
      const text = parsed.update.content?.text || "";

      if (updateType === "agent_thought_chunk") {
        return { type: "thought_chunk", content: text };
      }
      if (updateType === "agent_message_chunk") {
        return { type: "message_chunk", content: text };
      }
      if (updateType === "usage_update") {
        return { type: "usage", cost: parsed.update.cost };
      }
    }
  } catch (e) {
    // Not JSON, return as regular
  }

  return { type: "regular", data: msg };
}

// Service: Extract plain text from a rendered message element
// Joins per-line <div> children with \n, excluding the thought section.
function extractMessageText(el) {
  const responseEl = el.querySelector(".message-response");
  if (responseEl) {
    return Array.from(responseEl.children)
      .map((div) => div.textContent)
      .join("\n");
  }
  const contentEl = el.querySelector(".message-content");
  if (!contentEl) return "";
  return Array.from(contentEl.children)
    .filter((child) => !child.classList.contains("message-thought"))
    .map((div) => div.textContent)
    .join("\n");
}

// Service: Build WebSocket URL
function buildWebSocketUrl(sessionId) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/chat/${sessionId}`;
}

// Service: Calculate combined status
function calculateCombinedStatus(agentStatus, acpStatus) {
  if (!agentStatus || agentStatus === "offline") {
    return { canSend: false, placeholder: "Agent offline..." };
  }
  if (acpStatus === "waking") {
    return { canSend: false, placeholder: "Waking agent..." };
  }
  return { canSend: true, placeholder: "Type your message..." };
}

// Service: Format milliseconds as Nm Ns
function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m${seconds}s`;
}

// Service: Format usage for display
function formatUsage(usage) {
  const parts = [];
  if (usage.cost?.amount !== undefined) {
    parts.push(`Cost: $${(usage.cost.amount / 100).toFixed(4)}`);
  }
  if (usage.used !== undefined) {
    parts.push(`Tokens: ${usage.used.toLocaleString()}`);
  }
  if (usage.size !== undefined) {
    parts.push(`Context: ${usage.size.toLocaleString()}`);
  }
  return parts.join(" | ");
}

function applyFrameState(frameId, activeBufferId) {
  const frame = document.querySelector(`.frame[data-frame-id="${frameId}"]`);
  if (!frame) return;

  frame.querySelectorAll(".frame-tab").forEach((tab) => {
    const isActive = tab.dataset.bufferId === activeBufferId;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  frame.querySelectorAll(".frame-buffer-panel").forEach((panel) => {
    const isActive = panel.dataset.bufferPanel === activeBufferId;
    panel.style.display = isActive ? "flex" : "none";
    panel.classList.toggle("active", isActive);
    panel.classList.toggle("hidden", !isActive);
  });

  ChatState.frames[frameId] = activeBufferId;
}

async function switchFrameBuffer(frameId, bufferId) {
  applyFrameState(frameId, bufferId);

  try {
    await fetch(`/sessions/${ChatState.sessionId}/frame-state`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ frame: frameId, activeBufferId: bufferId }),
    });
  } catch (error) {
    console.error("[frame] Failed to persist frame state:", error);
  }
}

// Notes handling moved to notes.js (handles both project and session notes)

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4: CONTROLLER (Side Effects & Events)
// These functions bridge services/views with the outside world.
// They read state, call services, call views, update state, attach listeners.
// ═════════════════════════════════════════════════════════════════════════════

// Controller: Initialize chat for session
function initChat(sessionId) {
  ChatState.sessionId = sessionId;
  connectWebSocket(sessionId);
  insertEditableBubble();
  updateImpactUiState();
}

// Controller: Connect WebSocket
function connectWebSocket(sessionId) {
  const url = buildWebSocketUrl(sessionId);
  ChatState.socket = new WebSocket(url);

  // Store socket globally for thread management
  if (typeof window !== "undefined") {
    window.MIMO_CHAT_SOCKET = ChatState.socket;
  }

  ChatState.socket.onopen = () => {
    console.log("Chat WebSocket connected");
    ChatState.connectionStatus = "connected";
    updateConnectionStatusUI();

    ChatState.socket.send(
      JSON.stringify({
        type: "request_state",
        sessionId: ChatState.sessionId,
      }),
    );

    ChatState.socket.send(
      JSON.stringify({
        type: "request_impact_stale",
        sessionId: ChatState.sessionId,
      }),
    );

    loadInitialImpact();
  };

  ChatState.socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWebSocketMessage(data);
  };

  ChatState.socket.onclose = () => {
    console.log("Chat WebSocket disconnected");
    ChatState.connectionStatus = "disconnected";
    ChatState.agentStatus = "offline";
    updateConnectionStatusUI();
    updateAgentStatusUI();

    setTimeout(() => {
      if (ChatState.sessionId) connectWebSocket(ChatState.sessionId);
    }, 3000);
  };

  ChatState.socket.onerror = (error) => {
    console.error("Chat WebSocket error:", error);
    ChatState.connectionStatus = "error";
    ChatState.agentStatus = "offline";
    updateConnectionStatusUI();
    updateAgentStatusUI();
  };
}

// Controller: Handle incoming WebSocket messages
function handleWebSocketMessage(data) {
  console.log("[CHAT] Received:", data.type, data);

  const activeThreadId =
    typeof ChatThreadsState !== "undefined" && ChatThreadsState
      ? ChatThreadsState.activeThreadId
      : null;

  switch (data.type) {
    case "prompt_received":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      handlePromptReceived();
      break;
    case "thought_start":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      handleThoughtStart();
      break;
    case "thought_chunk":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      handleThoughtChunk(data.content);
      break;
    case "thought_end":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      handleThoughtEnd();
      break;
    case "message_chunk":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      handleMessageChunk(data.content);
      break;
    case "usage_update":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      handleUsageUpdate(data.usage, data.duration, data.durationMs);
      break;
    case "message":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      handleMessage(data);
      break;
    case "error":
      handleErrorMessage(data.message);
      break;
    case "history":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      loadChatHistory(data.messages);
      break;
    case "session_initialized":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      handleSessionInitialized(data);
      break;
    case "model_state":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      updateModelSelector(data.modelState);
      if (typeof window !== "undefined" && data.modelState?.availableModels) {
        window.MIMO_CHAT_MODELS = data.modelState.availableModels;
      }
      break;
    case "mode_state":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      updateModeSelector(data.modeState);
      if (typeof window !== "undefined" && data.modeState?.availableModes) {
        window.MIMO_CHAT_MODES = data.modeState.availableModes;
      }
      break;
    case "streaming_state":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      handleStreamingState(data);
      break;
    case "permission_request":
      showPermissionCard(data);
      break;
    case "permission_resolved":
      removePermissionCard(data.requestId);
      break;
    case "session_cleared":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      handleSessionCleared(data);
      break;
    case "clear_session_error":
      if (
        activeThreadId &&
        data.chatThreadId &&
        data.chatThreadId !== activeThreadId
      ) {
        return;
      }
      handleClearSessionError(data);
      break;
    case "acp_status":
      handleAcpStatus(data);
      break;
    case "impact_stale":
      handleImpactStale(data);
      break;
    case "impact_calculating":
      handleImpactCalculating();
      break;
    case "impact_updated":
      handleImpactUpdated(data);
      break;
    case "impact_error":
      handleImpactError(data);
      break;
  }
}

// Controller: Handle prompt received (agent is responding)
function handlePromptReceived() {
  removeEditableBubble();
  insertStreamingMessage();
  startStreamingTimeout();
  ChatState.streaming.startTime = Date.now();
}

// Controller: Handle thought start
function handleThoughtStart() {
  startStreamingTimeout();
  if (!ChatState.streaming.messageElement) {
    removeEditableBubble();
    insertStreamingMessage();
  }
  if (ChatState.streaming.startTime === null) {
    ChatState.streaming.startTime = Date.now();
  }
  insertThoughtSection();
}

// Controller: Handle thought chunk
function handleThoughtChunk(content) {
  startStreamingTimeout();
  if (!ChatState.streaming.thoughtElement) {
    insertThoughtSection();
  }
  ChatState.streaming.thoughtContent += content;
  updateThoughtContent(content);
}

// Controller: Handle thought end
function handleThoughtEnd() {
  finalizeThoughtSection();
}

// Controller: Handle message chunk
function handleMessageChunk(content) {
  startStreamingTimeout();
  if (!ChatState.streaming.messageElement) {
    removeEditableBubble();
    insertStreamingMessage();
  }
  ChatState.streaming.content += content;
  updateMessageContent(content);
}

// Controller: Handle usage update (stream end)
function handleUsageUpdate(usage, duration, durationMs) {
  clearStreamingTimeout();
  if (typeof durationMs === "number" && durationMs > 0) {
    ChatState.totalDurationMs += durationMs;
  }
  updateUsageDisplay(usage);
  finalizeMessageStream(duration);
  insertEditableBubble();
}

// Controller: Handle regular message
function handleMessage(message) {
  // Skip if already added locally
  if (
    message.role === "user" &&
    ChatState.pendingMessages.has(message.content)
  ) {
    ChatState.pendingMessages.delete(message.content);
    return;
  }
  insertMessage(message);
}

// Controller: Handle error message
function handleErrorMessage(message) {
  clearStreamingTimeout();
  removeStreamingMessage();
  insertError(message);
  insertEditableBubble();
}

// Controller: Handle ACP status
function handleAcpStatus(data) {
  const { status, wasReset, message } = data;
  console.log("[CHAT] ACP status update:", { status, wasReset });

  ChatState.acpStatus = status;
  updateAgentStatusUI();

  if (wasReset && message) {
    showNotification(message, "info");
  }
}

// Controller: Handle session initialized
function handleSessionInitialized(data) {
  console.log("[INIT] session_initialized received:", data);
  ChatState.agentStatus = "online";
  updateAgentStatusUI();

  if (data.modelState) {
    updateModelSelector(data.modelState);
    if (typeof window !== "undefined" && data.modelState?.availableModels) {
      window.MIMO_CHAT_MODELS = data.modelState.availableModels;
    }
  }

  if (data.modeState) {
    updateModeSelector(data.modeState);
    if (typeof window !== "undefined" && data.modeState?.availableModes) {
      window.MIMO_CHAT_MODES = data.modeState.availableModes;
    }
  }

  if (
    window.MIMO_CHAT_THREADS &&
    typeof window.MIMO_CHAT_THREADS.refresh === "function"
  ) {
    window.MIMO_CHAT_THREADS.refresh();
  }
}

// Controller: Send message
function sendMessage(content) {
  ChatState.pendingMessages.add(content);

  // Get active thread ID from the thread management system
  const activeThreadId =
    typeof ChatThreadsState !== "undefined" && ChatThreadsState
      ? ChatThreadsState.activeThreadId
      : null;

  if (!activeThreadId) {
    showNotification("Create a chat thread first", "warning");
    ChatState.pendingMessages.delete(content);
    return;
  }

  if (ChatState.socket?.readyState === WebSocket.OPEN) {
    const payload = {
      type: "send_message",
      content: content,
    };
    // Include chatThreadId if available
    if (activeThreadId) {
      payload.chatThreadId = activeThreadId;
    }
    ChatState.socket.send(JSON.stringify(payload));
  } else {
    sendMessageHttp(content);
  }
}

// Controller: Send via HTTP fallback
async function sendMessageHttp(content) {
  try {
    const res = await fetch(`/sessions/${ChatState.sessionId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ message: content }).toString(),
    });

    if (!res.ok) {
      handleErrorMessage("Failed to send message");
    }
  } catch (error) {
    handleErrorMessage(`Failed to send message: ${error.message}`);
  }
}

// Controller: Cancel streaming
function cancelStreaming() {
  console.log("[CHAT] User cancelled streaming");
  clearStreamingTimeout();

  // Get the partial content before finalizing
  const partialContent = ChatState.streaming.content || "";
  const thoughtContent = ChatState.streaming.thoughtContent || "";
  const activeThreadId =
    typeof ChatThreadsState !== "undefined" && ChatThreadsState
      ? ChatThreadsState.activeThreadId
      : null;

  if (!activeThreadId) {
    showNotification("Create a chat thread first", "warning");
    return;
  }

  if (ChatState.socket?.readyState === WebSocket.OPEN) {
    const payload = {
      type: "cancel_request",
      sessionId: ChatState.sessionId,
    };
    if (activeThreadId) {
      payload.chatThreadId = activeThreadId;
    }
    ChatState.socket.send(JSON.stringify(payload));

    // Build full content including thoughts (same format as normal save)
    let fullContent = partialContent;
    if (thoughtContent) {
      fullContent = `<details><summary>Thought Process</summary>${thoughtContent}</details>\n\n${partialContent}`;
    }

    // Send the cancelled message to be saved to history
    const cancelledPayload = {
      type: "cancelled_message",
      sessionId: ChatState.sessionId,
      content: fullContent,
      timestamp: new Date().toISOString(),
    };
    if (activeThreadId) {
      cancelledPayload.chatThreadId = activeThreadId;
    }
    ChatState.socket.send(JSON.stringify(cancelledPayload));
  }

  // Convert streaming message to a static message showing partial content
  finalizeStreamingAsCancelled();
  insertEditableBubble();
}

function prepareThreadSwitch() {
  clearStreamingTimeout();
  removeStreamingMessage();
  ChatState.streaming.reconstructed = false;
  ChatState.streaming.lastActivity = null;
}

// Controller: Clear session
function clearSession() {
  const activeThreadId =
    typeof ChatThreadsState !== "undefined" && ChatThreadsState
      ? ChatThreadsState.activeThreadId
      : null;

  if (!activeThreadId) {
    showNotification("Create a chat thread first", "warning");
    return;
  }

  console.log(
    `[CHAT] User requested thread clear for ${ChatState.sessionId}/${activeThreadId}`,
  );

  if (ChatState.socket?.readyState === WebSocket.OPEN) {
    const payload = {
      type: "clear_session",
      sessionId: ChatState.sessionId,
    };
    if (activeThreadId) {
      payload.chatThreadId = activeThreadId;
    }
    ChatState.socket.send(JSON.stringify(payload));
  }

  insertPendingClearMessage();
}

// Controller: Start streaming timeout
function startStreamingTimeout() {
  clearStreamingTimeout();
  ChatState.streaming.lastActivity = Date.now();
  ChatState.streaming.timeout = setTimeout(() => {
    handleStreamingTimeout();
  }, ChatState.STREAMING_TIMEOUT_MS);
}

// Controller: Clear streaming timeout
function clearStreamingTimeout() {
  if (ChatState.streaming.timeout) {
    clearTimeout(ChatState.streaming.timeout);
    ChatState.streaming.timeout = null;
  }
  ChatState.streaming.lastActivity = Date.now();
}

// Controller: Handle streaming timeout
function handleStreamingTimeout() {
  console.log(
    `[CHAT] Streaming timeout - agent did not respond within ${ChatState.STREAMING_TIMEOUT_MS / 1000} seconds`,
  );

  if (ChatState.streaming.messageElement) {
    ChatState.streaming.messageElement.remove();
    ChatState.streaming.messageElement = null;
    ChatState.streaming.thoughtElement = null;
    ChatState.streaming.content = "";
    ChatState.streaming.thoughtContent = "";
    ChatState.streaming.active = false;
  }

  insertTimeoutWarning();
  insertEditableBubble();
}

// Controller: Handle streaming state (reconnection)
function handleStreamingState(data) {
  const { thoughtContent, messageContent } = data;

  ChatState.streaming.reconstructed = true;
  ChatState.streaming.lastActivity = Date.now();

  removeEditableBubble();

  if (thoughtContent) {
    insertStreamingMessage();
    insertThoughtSection();
    ChatState.streaming.thoughtContent += thoughtContent;
    updateThoughtContent(thoughtContent);
    finalizeThoughtSection();
  }

  if (messageContent) {
    if (!ChatState.streaming.messageElement) {
      insertStreamingMessage();
    }
    ChatState.streaming.content += messageContent;
    updateMessageContent(messageContent);
  }

  // Fallback: restore input if stale
  setTimeout(() => {
    if (
      ChatState.streaming.reconstructed &&
      !ChatState.editableBubble &&
      !ChatState.streaming.messageElement
    ) {
      const timeSinceActivity = Date.now() - ChatState.streaming.lastActivity;
      if (timeSinceActivity >= 10000) {
        console.log(
          "[CHAT] Fallback: restoring input after stale reconstructed streaming",
        );
        ChatState.streaming.reconstructed = false;
        insertEditableBubble();
      }
    }
  }, 10000);
}

// Controller: Handle session cleared
function handleSessionCleared(data) {
  console.log("[CHAT] Session cleared:", data);

  const pending = document.querySelector("#clear-session-pending");
  if (pending) pending.remove();

  insertMessage({
    role: "system",
    content: "Thread context cleared",
    timestamp: new Date().toISOString(),
  });
}

// Controller: Handle clear session error
function handleClearSessionError(data) {
  console.error("[CHAT] Clear session error:", data);

  const pending = document.querySelector("#clear-session-pending");
  if (pending) pending.remove();

  insertError(data.error || "Failed to clear session");
}

function refreshImpact() {
  if (
    ChatState.socket?.readyState !== WebSocket.OPEN ||
    ChatState.impact.calculating
  ) {
    return;
  }

  ChatState.socket.send(
    JSON.stringify({
      type: "refresh_impact",
      sessionId: ChatState.sessionId,
    }),
  );
}

async function loadInitialImpact() {
  try {
    const response = await fetch(`/sessions/${ChatState.sessionId}/impact`);
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const metrics = data.metrics || data;
    if (!metrics?.files) {
      return;
    }

    ChatState.impact.metrics = metrics;
    ChatState.impact.trends = data.trends || null;
    renderImpactMetrics(metrics, ChatState.impact.trends);
    updateImpactUiState();
  } catch (error) {
    console.error("[impact] Initial load failed:", error);
  }
}

function handleImpactStale(data) {
  ChatState.impact.stale = !!data.stale;
  updateImpactUiState();
}

function handleImpactCalculating() {
  ChatState.impact.calculating = true;
  updateImpactUiState();
}

function handleImpactUpdated(data) {
  ChatState.impact.calculating = false;
  ChatState.impact.stale = false;
  ChatState.impact.metrics = data.metrics || null;
  ChatState.impact.trends = data.trends || null;

  if (ChatState.impact.metrics) {
    renderImpactMetrics(ChatState.impact.metrics, ChatState.impact.trends);
  }
  updateImpactUiState();
}

function handleImpactError(data) {
  ChatState.impact.calculating = false;
  updateImpactUiState();
  insertError(data.error || "Impact calculation failed");
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5: DOM MANIPULATION (View Insertion/Updates)
// These functions insert rendered views into the DOM and update existing ones.
// They bridge the gap between pure views and the live DOM.
// ═════════════════════════════════════════════════════════════════════════════

// DOM: Insert message into chat container
function insertMessage(message) {
  const container = document.querySelector("#chat-messages");
  if (!container) return;

  const parsed = parseMessageContent(message.content);
  const el = renderMessage({
    ...message,
    content: parsed.hasThought ? parsed.message : message.content,
  });

  // Add thought section if present
  if (parsed.hasThought) {
    const thoughtEl = renderThoughtSection(parsed.thought);
    const contentEl = el.querySelector(".message-content");
    const header = thoughtEl.querySelector(".message-header");
    const thoughtContentDiv = thoughtEl.querySelector(".message-content");

    header.addEventListener("click", () => {
      const isVisible = thoughtContentDiv.style.display !== "none";
      thoughtContentDiv.style.display = isVisible ? "none" : "block";
      thoughtEl.classList.toggle("thought-collapsed", isVisible);
      thoughtEl.classList.toggle("thought-expanded", !isVisible);
      header.querySelector(".thought-toggle").textContent = isVisible
        ? "▶"
        : "▼";
    });

    contentEl.prepend(thoughtEl);
  }

  // Attach copy handler
  const copyBtn = el.querySelector(".copy-btn");
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(extractMessageText(el));
  });

  // Remove "no messages" placeholder if exists
  const placeholder = container.querySelector(".no-messages");
  if (placeholder) placeholder.remove();

  container.appendChild(el);
  scrollToBottom();
}

// DOM: Insert editable bubble
function insertEditableBubble() {
  const container = document.querySelector("#chat-messages");
  if (!container || ChatState.editableBubble) return;

  const bubble = renderEditableBubble();
  const content = bubble.querySelector(".message-content");
  const sendBtn = bubble.querySelector(".editable-send-btn");

  // Event handlers
  sendBtn.addEventListener("click", submitEditableBubble);
  content.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      submitEditableBubble();
    }
  });
  content.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  container.appendChild(bubble);
  content.focus();
  ChatState.editableBubble = bubble;
  scrollToBottom();
}

// DOM: Remove editable bubble
function removeEditableBubble() {
  if (ChatState.editableBubble) {
    ChatState.editableBubble.remove();
    ChatState.editableBubble = null;
  }
}

// DOM: Submit editable bubble
function submitEditableBubble() {
  if (!ChatState.editableBubble) return;

  const content = ChatState.editableBubble.querySelector(".message-content");
  const message = content.innerText.trim();
  if (!message) return;

  // Convert to static message
  const header = ChatState.editableBubble.querySelector(
    ".editable-bubble-header",
  );
  if (header) header.remove();
  content.removeAttribute("contenteditable");
  ChatState.editableBubble.classList.remove("editable-bubble");

  const staticHeader = document.createElement("div");
  staticHeader.className = "message-header";
  staticHeader.textContent = "You";
  ChatState.editableBubble.insertBefore(staticHeader, content);

  ChatState.editableBubble = null;

  sendMessage(message);
}

// DOM: Insert streaming message
function insertStreamingMessage() {
  const container = document.querySelector("#chat-messages");
  if (!container || ChatState.streaming.messageElement) return;

  const el = renderStreamingMessage();

  // Attach cancel handler
  const cancelBtn = el.querySelector(".cancel-streaming-btn");
  cancelBtn.addEventListener("click", cancelStreaming);

  // Attach copy handler
  const copyBtn = el.querySelector(".copy-btn");
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(extractMessageText(el));
  });

  container.appendChild(el);
  ChatState.streaming.messageElement = el;
  ChatState.streaming.content = "";
  ChatState.streaming.active = true;
  scrollToBottom();
}

// DOM: Remove streaming message
function removeStreamingMessage() {
  if (ChatState.streaming.messageElement) {
    ChatState.streaming.messageElement.remove();
    ChatState.streaming.messageElement = null;
    ChatState.streaming.thoughtElement = null;
    ChatState.streaming.content = "";
    ChatState.streaming.thoughtContent = "";
    ChatState.streaming.active = false;
    ChatState.streaming.startTime = null;
  }
}

// DOM: Finalize streaming message as cancelled (keep partial content)
function finalizeStreamingAsCancelled() {
  if (!ChatState.streaming.messageElement) return;

  const messageEl = ChatState.streaming.messageElement;

  // Remove streaming indicator
  const indicator = messageEl.querySelector(".streaming-indicator");
  if (indicator) indicator.remove();

  // Remove cancel button from header
  const cancelBtn = messageEl.querySelector(".cancel-streaming-btn");
  if (cancelBtn) cancelBtn.remove();

  // Render the accumulated content
  const responseContent = messageEl.querySelector(".message-response");
  if (responseContent) {
    const cursor = responseContent.querySelector(".typing-cursor");
    if (cursor) cursor.remove();
    const accumulated = responseContent.textContent;
    renderTextAsLines(accumulated, responseContent);
  }

  // Add cancelled indicator to header
  const header = messageEl.querySelector(".message-header");
  if (header) {
    const cancelledIndicator = document.createElement("span");
    cancelledIndicator.className = "cancelled-indicator";
    cancelledIndicator.style.cssText =
      "font-size: 0.75em; color: #ff6b6b; margin-left: 8px; font-style: italic;";
    cancelledIndicator.textContent = "(cancelled)";
    header.appendChild(cancelledIndicator);
  }

  // Remove streaming class
  messageEl.classList.remove("streaming");
  messageEl.classList.add("cancelled");

  // Clear streaming state but keep the message element
  ChatState.streaming.messageElement = null;
  ChatState.streaming.thoughtElement = null;
  ChatState.streaming.content = "";
  ChatState.streaming.thoughtContent = "";
  ChatState.streaming.active = false;
  ChatState.streaming.startTime = null;
}

// DOM: Finalize message stream (remove indicators)
function finalizeMessageStream(duration) {
  if (!ChatState.streaming.messageElement) return;

  const indicator = ChatState.streaming.messageElement.querySelector(
    ".streaming-indicator",
  );
  if (indicator) indicator.remove();

  const responseContent =
    ChatState.streaming.messageElement.querySelector(".message-response");
  if (responseContent) {
    const cursor = responseContent.querySelector(".typing-cursor");
    if (cursor) cursor.remove();
    const accumulated = responseContent.textContent;
    renderTextAsLines(accumulated, responseContent);
  }

  const cancelBtn = ChatState.streaming.messageElement.querySelector(
    ".cancel-streaming-btn",
  );
  if (cancelBtn) cancelBtn.remove();

  if (duration) {
    const header =
      ChatState.streaming.messageElement.querySelector(".message-header");
    if (header) {
      const agentLabel = header.querySelector("span");
      const meta = document.createElement("span");
      meta.className = "message-meta";
      meta.style.cssText = "font-size: 0.75em; color: #888; margin-left: 8px;";
      meta.textContent = `${duration} · ${new Date().toLocaleString()}`;
      if (agentLabel) {
        agentLabel.after(meta);
      } else {
        header.appendChild(meta);
      }
    }
  }

  ChatState.streaming.messageElement.classList.remove("streaming");
  ChatState.streaming.messageElement = null;
  ChatState.streaming.thoughtElement = null;
  ChatState.streaming.content = "";
  ChatState.streaming.thoughtContent = "";
  ChatState.streaming.reconstructed = false;
  ChatState.streaming.active = false;
  ChatState.streaming.startTime = null;
}

// DOM: Insert thought section
function insertThoughtSection() {
  if (!ChatState.streaming.messageElement || ChatState.streaming.thoughtElement)
    return;

  const contentEl =
    ChatState.streaming.messageElement.querySelector(".message-content");
  const thoughtEl = renderThoughtSection("");
  const header = thoughtEl.querySelector(".message-header");
  const thoughtContentDiv = thoughtEl.querySelector(".message-content");

  header.addEventListener("click", () => {
    const isVisible = thoughtContentDiv.style.display !== "none";
    thoughtContentDiv.style.display = isVisible ? "none" : "block";
    header.querySelector(".thought-toggle").textContent = isVisible ? "▶" : "▼";
    thoughtEl.classList.toggle("thought-collapsed", isVisible);
    thoughtEl.classList.toggle("thought-expanded", !isVisible);
  });

  header.innerHTML =
    '<span class="thought-toggle" style="animation: blink 1s infinite; display: inline-block;">●</span> Thinking...';
  contentEl.insertBefore(thoughtEl, contentEl.firstChild);
  ChatState.streaming.thoughtElement = thoughtEl;
}

// DOM: Update thought content
function updateThoughtContent(text) {
  if (!ChatState.streaming.thoughtElement) return;
  const shouldAutoFollow = isNearBottom(document.querySelector("#chat-messages"));
  const contentDiv =
    ChatState.streaming.thoughtElement.querySelector(".message-content");
  contentDiv.textContent += text;
  scrollToBottom({ force: false, wasNearBottom: shouldAutoFollow });
}

// DOM: Finalize thought section
function finalizeThoughtSection() {
  if (!ChatState.streaming.thoughtElement) return;
  const header =
    ChatState.streaming.thoughtElement.querySelector(".message-header");
  header.innerHTML = '<span class="thought-toggle">▶</span> Thought Process';
}

// DOM: Update message content
function updateMessageContent(text) {
  if (!ChatState.streaming.messageElement) return;
  const shouldAutoFollow = isNearBottom(document.querySelector("#chat-messages"));

  let responseEl =
    ChatState.streaming.messageElement.querySelector(".message-response");
  if (!responseEl) {
    responseEl = document.createElement("div");
    responseEl.className = "message-response";
    ChatState.streaming.messageElement
      .querySelector(".message-content")
      ?.appendChild(responseEl);
  }

  const cursor = responseEl.querySelector(".typing-cursor");
  if (cursor) cursor.remove();

  responseEl.textContent += text;

  const newCursor = document.createElement("span");
  newCursor.className = "typing-cursor";
  newCursor.textContent = "▋";
  newCursor.style.color = "#51cf66";
  newCursor.style.animation = "blink 1s infinite";
  responseEl.appendChild(newCursor);

  scrollToBottom({ force: false, wasNearBottom: shouldAutoFollow });
}

// DOM: Update usage display
function updateUsageDisplay(usage) {
  const container = document.querySelector("#chat-usage");
  if (!container) return;

  if (!usage && ChatState.totalDurationMs === 0) {
    container.textContent = "";
    container.style.display = "none";
    return;
  }

  const parts = [];
  if (ChatState.totalDurationMs > 0) {
    parts.push(`Duration: ${formatDuration(ChatState.totalDurationMs)}`);
  }
  if (usage) {
    parts.push(formatUsage(usage));
  }
  container.textContent = parts.join(" | ");
  container.style.display = "block";
}

// DOM: Update connection status UI
function updateConnectionStatusUI() {
  const statusEl = ChatState.editableBubble?.querySelector(
    ".editable-bubble-status",
  );
  if (!statusEl) return;

  const connected = ChatState.connectionStatus === "connected";
  statusEl.textContent = connected ? "●" : "○";
  statusEl.style.color = connected ? "#51cf66" : "#888";
  statusEl.className = `editable-bubble-status ${ChatState.connectionStatus}`;
}

// DOM: Update agent status UI
function updateAgentStatusUI() {
  const chatInput = document.querySelector("#chat-input");
  const sendButton = document.querySelector("#send-button");

  // Update subtitle ACP status text
  const subtitleStatus = document.querySelector("#subtitle-acp-status");
  if (subtitleStatus) {
    let statusText = "";
    let statusClass = "";

    if (ChatState.acpStatus === "active") {
      statusText = "🟢 Agent ready";
      statusClass = "acp-status--active";
    } else if (ChatState.acpStatus === "parked") {
      statusText = "💤 Agent sleeping";
      statusClass = "acp-status--parked";
    } else if (ChatState.acpStatus === "waking") {
      statusText = "⏳ Waking agent...";
      statusClass = "acp-status--waking";
    }

    subtitleStatus.textContent = statusText;
    subtitleStatus.className = `acp-status ${statusClass}`;
  }

  const { canSend, placeholder } = calculateCombinedStatus(
    ChatState.agentStatus,
    ChatState.acpStatus,
  );

  if (chatInput) {
    chatInput.disabled = !canSend;
    chatInput.placeholder = placeholder;
  }

  if (sendButton) {
    sendButton.disabled = !canSend;
  }
}

function updateImpactUiState() {
  const staleBadge = document.querySelector("#impact-stale-badge");
  const calculatingBadge = document.querySelector("#impact-calculating-badge");
  const refreshBtn = document.querySelector("#impact-refresh-btn");

  if (staleBadge) {
    staleBadge.style.display = ChatState.impact.stale ? "inline" : "none";
  }
  if (calculatingBadge) {
    calculatingBadge.style.display = ChatState.impact.calculating
      ? "inline"
      : "none";
  }
  if (refreshBtn) {
    refreshBtn.disabled = ChatState.impact.calculating;
    refreshBtn.textContent = ChatState.impact.calculating
      ? "Analyzing..."
      : "Refresh";
  }
}

function renderImpactMetrics(metrics, trends) {
  const content = document.querySelector("#impact-content");
  if (!content || !metrics?.files) {
    return;
  }

  const filesTrend = trends?.files || { new: "→", changed: "→", deleted: "→" };
  const locTrend = trends?.linesOfCode || {
    added: "→",
    removed: "→",
    net: "→",
  };
  const complexityTrend = trends?.complexity || {
    cyclomatic: "→",
    cognitive: "→",
  };
  const netClass = metrics.linesOfCode.net >= 0 ? "positive" : "negative";
  const netValue =
    metrics.linesOfCode.net >= 0
      ? `+${metrics.linesOfCode.net}`
      : `${metrics.linesOfCode.net}`;

  let duplicationHtml = "";
  if (metrics.duplication !== undefined) {
    const dup = metrics.duplication;
    const isHigh = dup.percentage >= 30;
    const sectionClass = isHigh
      ? "impact-section duplication-warning"
      : "impact-section";

    if (dup.clones.length === 0) {
      duplicationHtml = `
        <div class="${sectionClass}">
          <div class="impact-section-title">Code Duplication</div>
          <div class="impact-no-data">No duplication detected</div>
        </div>`;
    } else {
      const valueClass = isHigh
        ? "impact-metric-value negative"
        : "impact-metric-value";

      const crossClones = dup.clones.filter((c) => c.type === "cross");
      const intraClones = dup.clones.filter((c) => c.type === "intra");

      const shortPath = (p) => {
        const parts = p.split("/");
        return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : p;
      };

      const crossHtml =
        crossClones.length > 0
          ? `
        <div class="impact-duplication-group">
          <div class="impact-duplication-group-title">Cross-File</div>
          ${crossClones
            .map(
              (c) => `
            <div class="impact-clone">
              <span class="impact-clone-file">${shortPath(c.firstFile.path)}</span>
              <span class="impact-clone-sep"> ↔ </span>
              <span class="impact-clone-file">${shortPath(c.secondFile.path)}</span>
              <span class="impact-clone-lines"> (${c.lines} lines)</span>
            </div>`,
            )
            .join("")}
        </div>`
          : "";

      const intraHtml =
        intraClones.length > 0
          ? `
        <div class="impact-duplication-group">
          <div class="impact-duplication-group-title">Intra-File</div>
          ${intraClones
            .map(
              (c) => `
            <div class="impact-clone">
              <span class="impact-clone-file">${shortPath(c.firstFile.path)}</span>
              <span class="impact-clone-lines"> L${c.firstFile.startLine}-${c.firstFile.endLine} ↔ L${c.secondFile.startLine}-${c.secondFile.endLine}</span>
            </div>`,
            )
            .join("")}
        </div>`
          : "";

      duplicationHtml = `
        <div class="${sectionClass}">
          <div class="impact-section-title">Code Duplication</div>
          <div class="impact-metric"><span class="impact-metric-label">Lines:</span><span class="${valueClass}">${dup.duplicatedLines}</span></div>
          <div class="impact-metric"><span class="impact-metric-label">Percentage:</span><span class="${valueClass}">${dup.percentage.toFixed(1)}%</span></div>
          <div class="impact-metric"><span class="impact-metric-label">Blocks:</span><span class="impact-metric-value">${dup.clones.length}</span></div>
          ${crossHtml}
          ${intraHtml}
        </div>`;
    }
  }

  content.innerHTML = `
    <div class="impact-section">
      <div class="impact-section-title">Files</div>
      <div class="impact-metric"><span class="impact-metric-label">New:</span><span class="impact-metric-value">${metrics.files.new}</span><span class="impact-trend">${filesTrend.new || "→"}</span></div>
      <div class="impact-metric"><span class="impact-metric-label">Changed:</span><span class="impact-metric-value">${metrics.files.changed}</span><span class="impact-trend">${filesTrend.changed || "→"}</span></div>
      <div class="impact-metric"><span class="impact-metric-label">Deleted:</span><span class="impact-metric-value">${metrics.files.deleted}</span><span class="impact-trend">${filesTrend.deleted || "→"}</span></div>
    </div>
    <div class="impact-section">
      <div class="impact-section-title">Lines of Code</div>
      <div class="impact-metric"><span class="impact-metric-label">Added:</span><span class="impact-metric-value">+${metrics.linesOfCode.added}</span><span class="impact-trend">${locTrend.added || "→"}</span></div>
      <div class="impact-metric"><span class="impact-metric-label">Removed:</span><span class="impact-metric-value">-${metrics.linesOfCode.removed}</span><span class="impact-trend">${locTrend.removed || "→"}</span></div>
      <div class="impact-metric"><span class="impact-metric-label">Net:</span><span class="impact-metric-value ${netClass}">${netValue}</span><span class="impact-trend">${locTrend.net || "→"}</span></div>
    </div>
    <div class="impact-section">
      <div class="impact-section-title">Complexity</div>
      <div class="impact-metric"><span class="impact-metric-label">Cyclomatic:</span><span class="impact-metric-value">${metrics.complexity.cyclomatic}</span><span class="impact-trend">${complexityTrend.cyclomatic || "→"}</span></div>
      <div class="impact-metric"><span class="impact-metric-label">Cognitive:</span><span class="impact-metric-value">${metrics.complexity.cognitive}</span><span class="impact-trend">${complexityTrend.cognitive || "→"}</span></div>
      <div class="impact-metric"><span class="impact-metric-label">Est. Time:</span><span class="impact-metric-value">~${metrics.complexity.estimatedMinutes} min</span></div>
    </div>
    ${duplicationHtml}
  `;
}

// DOM: Show notification
function showNotification(message, type = "info") {
  const container = document.querySelector("#chat-messages");
  if (!container) return;

  const notification = renderNotification(message, type);
  container.appendChild(notification);
  scrollToBottom();

  setTimeout(() => notification.remove(), 5000);
}

// DOM: Insert error message
function insertError(message) {
  const container = document.querySelector("#chat-messages");
  if (!container) return;

  const el = renderMessage({
    role: "system",
    content: `Error: ${message}`,
  });
  el.classList.add("error");
  el.querySelector(".message-content").style.color = "#ff6b6b";

  container.appendChild(el);
  scrollToBottom();
}

// DOM: Insert cancelled message
function insertCancelledMessage() {
  const container = document.querySelector("#chat-messages");
  if (!container) return;

  const el = renderMessage({
    role: "system",
    content: "Response cancelled by user.",
  });
  el.classList.add("info");
  el.querySelector(".message-content").style.color = "#888";
  el.querySelector(".message-content").style.fontStyle = "italic";

  container.appendChild(el);
  scrollToBottom();
}

// DOM: Insert timeout warning
function insertTimeoutWarning() {
  const container = document.querySelector("#chat-messages");
  if (!container) return;

  const el = renderMessage({
    role: "system",
    content: `Warning: Agent did not respond within ${ChatState.STREAMING_TIMEOUT_MS / 1000} seconds. You can try sending your message again.`,
  });
  el.classList.add("warning");
  el.querySelector(".message-content").style.color = "#ffa500";

  container.appendChild(el);
  scrollToBottom();
}

// DOM: Insert pending clear message
function insertPendingClearMessage() {
  const container = document.querySelector("#chat-messages");
  if (!container) return;

  const el = renderMessage({
    role: "system",
    content: "Clearing session context...",
  });
  el.id = "clear-session-pending";
  el.querySelector(".message-content").style.color = "#888";
  el.querySelector(".message-content").style.fontStyle = "italic";

  container.appendChild(el);
  scrollToBottom();
}

// DOM: Load chat history
function loadChatHistory(messages) {
  const container = document.querySelector("#chat-messages");
  if (!container) return;

  container.innerHTML = "";
  ChatState.editableBubble = null;

  let currentThought = "";
  let currentMessage = "";
  let inThought = false;
  let inMessage = false;
  let lastRole = null;
  let lastUsageCost = null;

  messages.forEach((msg) => {
    if (msg.content?.includes("available_commands_update")) return;

    const parsed = parseHistoryMessage(msg);

    if (parsed.type === "thought_chunk") {
      if (!inThought) {
        inThought = true;
        currentThought = "";
      }
      currentThought += parsed.content;
      return;
    }

    if (parsed.type === "message_chunk") {
      if (inThought) {
        insertMessage({
          role: "assistant",
          content: `<details><summary>Thought Process</summary>${currentThought}</details>`,
        });
        inThought = false;
        currentThought = "";
      }
      if (!inMessage) {
        inMessage = true;
        currentMessage = "";
      }
      currentMessage += parsed.content;
      return;
    }

    if (parsed.type === "cancelled") {
      // Flush any pending streaming messages first
      if (inThought) {
        insertMessage({
          role: "assistant",
          content: `<details><summary>Thought Process</summary>${currentThought}</details>`,
        });
        inThought = false;
        currentThought = "";
      }
      if (inMessage && currentMessage) {
        insertMessage({
          role: "assistant",
          content: currentMessage,
        });
        inMessage = false;
        currentMessage = "";
      }
      // Now insert the cancelled message with its metadata preserved
      insertMessage(msg);
      lastRole = msg.role;
      return;
    }

    if (parsed.type === "usage") {
      lastUsageCost = parsed.cost;
      updateUsageDisplay(parsed.cost);
      return;
    }

    lastRole = msg.role;
    insertMessage(msg);
  });

  // Seed cumulative duration total from history
  ChatState.totalDurationMs = messages.reduce((sum, msg) => {
    if (
      msg.role === "assistant" &&
      typeof msg.metadata?.durationMs === "number"
    ) {
      return sum + msg.metadata.durationMs;
    }
    return sum;
  }, 0);
  if (ChatState.totalDurationMs > 0) {
    updateUsageDisplay(lastUsageCost);
  }

  // Flush any pending
  if (inThought && currentThought) {
    insertMessage({
      role: "assistant",
      content: `<details><summary>Thought Process</summary>${currentThought}</details>`,
    });
  }

  if (inMessage && currentMessage) {
    lastRole = "assistant";
    insertMessage({ role: "assistant", content: currentMessage });
  }

  if (lastRole !== "user" && !ChatState.streaming.reconstructed) {
    insertEditableBubble();
  }

  // Fallback
  setTimeout(() => {
    if (
      !ChatState.editableBubble &&
      !ChatState.streaming.messageElement &&
      !ChatState.streaming.reconstructed
    ) {
      console.log(
        "[CHAT] Fallback: creating editable bubble after history load",
      );
      insertEditableBubble();
    }
  }, 2000);
}

// DOM: Update model selector
function updateModelSelector(modelState) {
  console.log("[MODEL] Updating with state:", modelState);
  const selector = document.querySelector("#model-selector");
  const container = document.querySelector("#model-selector-container");

  if (!selector || !container) {
    console.log("[MODEL] Elements not found");
    return;
  }

  if (!modelState?.availableModels?.length) {
    console.log("[MODEL] No data available");
    return;
  }

  console.log(
    "[MODEL] Populating with",
    modelState.availableModels.length,
    "options",
  );
  container.style.opacity = "1";
  selector.disabled = false;
  selector.innerHTML = "";

  modelState.availableModels.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.value;
    option.textContent = model.name;
    option.title = model.description || model.name;
    if (model.value === modelState.currentModelId) {
      option.selected = true;
    }
    selector.appendChild(option);
  });

  selector.dataset.current = modelState.currentModelId;
  container.title = modelState.currentModelId;
}

// DOM: Update mode selector
function updateModeSelector(modeState) {
  console.log("[MODE] Updating with state:", modeState);
  const selector = document.querySelector("#mode-selector");
  const container = document.querySelector("#mode-selector-container");

  if (!selector || !container) {
    console.log("[MODE] Elements not found");
    return;
  }

  if (!modeState?.availableModes?.length) {
    console.log("[MODE] No data available");
    return;
  }

  console.log(
    "[MODE] Populating with",
    modeState.availableModes.length,
    "options",
  );
  container.style.opacity = "1";
  selector.disabled = false;
  selector.innerHTML = "";

  modeState.availableModes.forEach((mode) => {
    const option = document.createElement("option");
    option.value = mode.value;
    option.textContent = mode.name;
    option.title = mode.description || mode.name;
    if (mode.value === modeState.currentModeId) {
      option.selected = true;
    }
    selector.appendChild(option);
  });

  selector.dataset.current = modeState.currentModeId;
  container.title = modeState.currentModeId;
}

// DOM: Show permission card
function showPermissionCard(data) {
  const container = document.querySelector("#chat-messages");
  if (!container) return;

  const { requestId, toolCall, options } = data;
  const card = renderPermissionCard(requestId, toolCall, options);

  card.querySelectorAll(".permission-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const optionId = btn.dataset.optionId;
      if (ChatState.socket?.readyState === WebSocket.OPEN) {
        ChatState.socket.send(
          JSON.stringify({
            type: "permission_response",
            requestId,
            optionId,
          }),
        );
      }
      removePermissionCard(requestId);
    });
  });

  container.appendChild(card);
  scrollToBottom();
}

// DOM: Remove permission card
function removePermissionCard(requestId) {
  const card = document.querySelector(
    `.permission-card[data-request-id="${requestId}"]`,
  );
  if (card) card.remove();
}

// DOM: Scroll to bottom
function isNearBottom(container, thresholdPx = 64) {
  if (!container) return false;
  const distanceFromBottom =
    container.scrollHeight - container.clientHeight - container.scrollTop;
  return distanceFromBottom <= thresholdPx;
}

function scrollToBottom(options) {
  const container = document.querySelector("#chat-messages");
  if (!container) return;

  const { force = true, wasNearBottom } = options || {};
  if (!force) {
    const shouldAutoFollow =
      typeof wasNearBottom === "boolean"
        ? wasNearBottom
        : isNearBottom(container);
    if (!shouldAutoFollow) return;
  }

  container.scrollTop = container.scrollHeight;
}

function focusEditableBubbleInput() {
  let input = document.querySelector(".editable-bubble .message-content");

  if (!input && !ChatState.streaming.messageElement) {
    insertEditableBubble();
    input = document.querySelector(".editable-bubble .message-content");
  }

  if (!input) return false;

  input.focus();

  if (window.getSelection && document.createRange) {
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  return true;
}

function shouldIgnoreFocusShortcutTarget(target) {
  if (!target || typeof target.closest !== "function") return false;

  if (target.closest(".editable-bubble .message-content")) {
    return false;
  }

  return !!target.closest(
    'input, textarea, select, button, [contenteditable="true"]',
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6: SETUP & EVENT LISTENERS
// Bootstrap the module when DOM is ready
// ═════════════════════════════════════════════════════════════════════════════

function setupEventListeners() {
  document.addEventListener("keydown", (e) => {
    if (e.isComposing || e.metaKey || e.altKey) return;
    if (!e.ctrlKey || String(e.key).toLowerCase() !== "m") return;
    if (shouldIgnoreFocusShortcutTarget(e.target)) return;

    if (focusEditableBubbleInput()) {
      e.preventDefault();
    }
  });

  // Model selector
  const modelSelector = document.querySelector("#model-selector");
  if (modelSelector) {
    modelSelector.addEventListener("change", (e) => {
      const modelId = e.target.value;
      const currentId = e.target.dataset.current;

      if (modelId !== currentId) {
        e.target.dataset.current = modelId;
        if (ChatState.socket?.readyState === WebSocket.OPEN) {
          const payload = {
            type: "set_model",
            modelId,
          };
          // Include chatThreadId if available
          if (
            typeof ChatThreadsState !== "undefined" &&
            ChatThreadsState?.activeThreadId
          ) {
            payload.chatThreadId = ChatThreadsState.activeThreadId;
          }
          ChatState.socket.send(JSON.stringify(payload));
        }
      }
    });
  }

  // Mode selector
  const modeSelector = document.querySelector("#mode-selector");
  if (modeSelector) {
    modeSelector.addEventListener("change", (e) => {
      const modeId = e.target.value;
      const currentId = e.target.dataset.current;

      if (modeId !== currentId) {
        e.target.dataset.current = modeId;
        if (ChatState.socket?.readyState === WebSocket.OPEN) {
          const payload = {
            type: "set_mode",
            modeId,
          };
          // Include chatThreadId if available
          if (
            typeof ChatThreadsState !== "undefined" &&
            ChatThreadsState?.activeThreadId
          ) {
            payload.chatThreadId = ChatThreadsState.activeThreadId;
          }
          ChatState.socket.send(JSON.stringify(payload));
        }
      }
    });
  }

  // Clear session button
  const clearBtn = document.querySelector("#clear-session-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", clearSession);
  }

  const impactRefreshBtn = document.querySelector("#impact-refresh-btn");
  if (impactRefreshBtn) {
    impactRefreshBtn.addEventListener("click", refreshImpact);
  }

  document.querySelectorAll(".frame-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const frameId = tab.dataset.frameId;
      const bufferId = tab.dataset.bufferId;
      if (!frameId || !bufferId) return;
      switchFrameBuffer(frameId, bufferId);
    });
  });

  // Notes event listeners moved to notes.js
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7: PUBLIC API
// Expose functions globally
// ═════════════════════════════════════════════════════════════════════════════

window.MIMO_CHAT = {
  init: initChat,
  prepareThreadSwitch,
  clearSession,
  send: (msg) => {
    if (ChatState.socket?.readyState === WebSocket.OPEN) {
      ChatState.socket.send(
        JSON.stringify({
          type: "send_message",
          content: msg,
        }),
      );
    }
  },
  replay: () => {
    if (ChatState.socket?.readyState === WebSocket.OPEN) {
      ChatState.socket.send(JSON.stringify({ type: "request_replay" }));
    }
  },
  setModel: (modelId) => {
    if (ChatState.socket?.readyState === WebSocket.OPEN) {
      ChatState.socket.send(JSON.stringify({ type: "set_model", modelId }));
    }
  },
  setMode: (modeId) => {
    if (ChatState.socket?.readyState === WebSocket.OPEN) {
      ChatState.socket.send(JSON.stringify({ type: "set_mode", modeId }));
    }
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 8: BOOTSTRAP
// Initialize when DOM is ready
// ═════════════════════════════════════════════════════════════════════════════

// Add blinking cursor animation
if (!document.getElementById("chat-animations")) {
  const style = document.createElement("style");
  style.id = "chat-animations";
  style.textContent = `
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();

  if (window.MIMO_SESSION_ID) {
    initChat(window.MIMO_SESSION_ID);
  }
});
