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

'use strict';

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
  connectionStatus: 'disconnected', // 'connected' | 'disconnected' | 'error'
  
  // Agent Status
  agentStatus: 'offline', // 'online' | 'offline'
  acpStatus: 'active',    // 'active' | 'parked' | 'waking'
  
  // Streaming
  streaming: {
    active: false,
    messageElement: null,
    thoughtElement: null,
    content: '',
    thoughtContent: '',
    timeout: null,
    lastActivity: null,
    reconstructed: false,
  },
  
  // Input
  editableBubble: null,
  pendingMessages: new Set(),
  
  // Config
  modelState: null,
  modeState: null,
  
  // Constants
  STREAMING_TIMEOUT_MS: 60000,
};

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2: VIEWS (Pure Functions)
// These functions create and return DOM elements. They don't touch state,
// don't attach event listeners, don't make side effects. They just build UI.
// ═════════════════════════════════════════════════════════════════════════════

// View: Connection status indicator
function renderConnectionStatus(status) {
  const el = document.createElement('span');
  el.className = `connection-status ${status}`;
  el.textContent = status === 'connected' ? '●' : '○';
  el.style.color = status === 'connected' ? '#51cf66' : '#888';
  el.title = `Connection: ${status}`;
  return el;
}

// View: Message bubble (user/agent/system)
function renderMessage(message) {
  const div = document.createElement('div');
  div.className = `message message-${message.role}`;
  div.dataset.messageId = message.id || Date.now().toString();
  
  const header = document.createElement('div');
  header.className = 'message-header';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  
  const label = document.createElement('span');
  label.textContent = message.role === 'user' ? 'You' : 
                       message.role === 'assistant' ? 'Agent' : 'System';
  
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = '📋';
  
  header.appendChild(label);
  header.appendChild(copyBtn);
  
  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = message.content;
  
  div.appendChild(header);
  div.appendChild(content);
  
  return div;
}

// View: Thought section (collapsible)
function renderThoughtSection(content) {
  const div = document.createElement('div');
  div.className = 'message-thought thought-collapsed';
  div.style.marginBottom = '10px';
  div.style.background = '#2d2d2d';
  div.style.borderRadius = '4px';
  
  const header = document.createElement('div');
  header.className = 'message-header';
  header.style.background = '#3d3d3d';
  header.innerHTML = '<span class="thought-toggle">▶</span> Thought Process';
  header.style.cursor = 'pointer';
  header.style.fontSize = '0.9em';
  header.style.padding = '4px 8px';
  header.style.justifyContent = 'flex-start';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.style.display = 'none';
  contentDiv.style.padding = '8px';
  contentDiv.style.fontSize = '0.9em';
  contentDiv.style.color = '#d4d4d4';
  contentDiv.style.background = '#2d2d2d';
  contentDiv.textContent = content;
  
  div.appendChild(header);
  div.appendChild(contentDiv);
  
  return div;
}

// View: Editable input bubble
function renderEditableBubble() {
  const bubble = document.createElement('div');
  bubble.className = 'message message-user editable-bubble';
  
  const header = document.createElement('div');
  header.className = 'message-header editable-bubble-header';
  
  const label = document.createElement('span');
  label.textContent = 'You';
  
  const status = renderConnectionStatus(ChatState.connectionStatus);
  status.className = 'editable-bubble-status';
  status.title = 'Connection status';
  
  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  
  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'editable-send-btn';
  sendBtn.textContent = '⌃↵ Send';
  
  header.appendChild(label);
  header.appendChild(status);
  header.appendChild(spacer);
  header.appendChild(sendBtn);
  
  const content = document.createElement('div');
  content.className = 'message-content';
  content.contentEditable = 'true';
  content.setAttribute('data-placeholder', 'Type a message...');
  
  bubble.appendChild(header);
  bubble.appendChild(content);
  
  return bubble;
}

// View: Streaming message (with cancel button)
function renderStreamingMessage() {
  const div = document.createElement('div');
  div.className = 'message message-assistant streaming';
  
  const header = document.createElement('div');
  header.className = 'message-header';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  
  const agentLabel = document.createElement('span');
  agentLabel.textContent = 'Agent';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'cancel-streaming-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.marginLeft = 'auto';
  cancelBtn.style.fontFamily = 'monospace';
  cancelBtn.style.fontSize = '11px';
  cancelBtn.style.padding = '1px 8px';
  cancelBtn.style.background = 'none';
  cancelBtn.style.color = '#aaa';
  cancelBtn.style.border = '1px solid #777';
  cancelBtn.style.borderRadius = '3px';
  cancelBtn.style.cursor = 'pointer';
  
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = '📋';
  copyBtn.style.marginLeft = '5px';
  
  header.appendChild(agentLabel);
  header.appendChild(cancelBtn);
  header.appendChild(copyBtn);
  
  const content = document.createElement('div');
  content.className = 'message-content';
  
  const indicator = document.createElement('span');
  indicator.className = 'streaming-indicator';
  indicator.textContent = '●';
  
  div.appendChild(header);
  div.appendChild(content);
  div.appendChild(indicator);
  
  return div;
}

// View: Agent status indicator
function renderAgentStatus(agentStatus, acpStatus) {
  const div = document.createElement('div');
  div.id = 'agent-status-indicator';
  div.className = 'agent-status-combined';
  
  let statusText, statusTitle, statusClass;
  
  if (!agentStatus || agentStatus === 'offline') {
    statusText = '🔴 Agent offline';
    statusTitle = 'Agent is disconnected';
    statusClass = 'agent-status--offline';
  } else if (acpStatus === 'active') {
    statusText = '🟢 Agent ready';
    statusTitle = 'ACP is active and ready';
    statusClass = 'agent-status--active';
  } else if (acpStatus === 'parked') {
    statusText = '💤 Agent sleeping';
    statusTitle = 'ACP is parked. Will wake on next message.';
    statusClass = 'agent-status--parked';
  } else if (acpStatus === 'waking') {
    statusText = '⏳ Waking up...';
    statusTitle = 'ACP is starting up';
    statusClass = 'agent-status--waking';
  } else {
    statusText = '🟢 Agent ready';
    statusTitle = 'ACP is active and ready';
    statusClass = 'agent-status--active';
  }
  
  div.classList.add(statusClass);
  div.textContent = statusText;
  div.title = statusTitle;
  
  return div;
}

// View: Notification banner
function renderNotification(message, type = 'info') {
  const div = document.createElement('div');
  div.className = `message message-system notification notification--${type}`;
  div.textContent = message;
  div.style.cssText = `
    padding: 8px 12px;
    margin: 8px 0;
    border-radius: 4px;
    background: ${type === 'info' ? '#e3f2fd' : type === 'warning' ? '#fff3e0' : '#ffebee'};
    color: ${type === 'info' ? '#1976d2' : type === 'warning' ? '#f57c00' : '#d32f2f'};
    font-size: 0.9em;
    text-align: center;
  `;
  
  return div;
}

// View: Permission card
function renderPermissionCard(requestId, toolCall, options) {
  const card = document.createElement('div');
  card.className = 'permission-card';
  card.dataset.requestId = requestId;
  
  const kindLabel = toolCall?.kind ? `<span class="permission-kind">${toolCall.kind}</span>` : '';
  const title = toolCall?.title || 'Tool action';
  const locations = (toolCall?.locations || [])
    .map(loc => `<li>${loc.path}${loc.startLine != null ? `:${loc.startLine}` : ''}</li>`)
    .join('');
  const locationsList = locations ? `<ul class="permission-locations">${locations}</ul>` : '';
  
  const buttons = (options || []).map(opt =>
    `<button class="permission-btn permission-btn--${opt.kind}" data-option-id="${opt.optionId}">${opt.name}</button>`
  ).join('');
  
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
  const detailsMatch = content.match(/\u003cdetails\u003e\s*\u003csummary\u003e(.+?)\u003c\/summary\u003e\s*([\s\S]*?)\u003c\/details\u003e/);
  if (detailsMatch) {
    return {
      hasThought: true,
      thought: detailsMatch[2].trim(),
      message: content.replace(/\u003cdetails\u003e[\s\S]*?\u003c\/details\u003e/, '').replace(/^\s*\n+/, ''),
    };
  }
  return { hasThought: false, thought: null, message: content };
}

// Service: Parse history message for streaming chunks
function parseHistoryMessage(msg) {
  if (msg.role !== 'assistant' || !msg.content) {
    return { type: 'regular', data: msg };
  }
  
  try {
    const parsed = JSON.parse(msg.content);
    if (parsed.update) {
      const updateType = parsed.update.sessionUpdate;
      const text = parsed.update.content?.text || '';
      
      if (updateType === 'agent_thought_chunk') {
        return { type: 'thought_chunk', content: text };
      }
      if (updateType === 'agent_message_chunk') {
        return { type: 'message_chunk', content: text };
      }
      if (updateType === 'usage_update') {
        return { type: 'usage', cost: parsed.update.cost };
      }
    }
  } catch (e) {
    // Not JSON, return as regular
  }
  
  return { type: 'regular', data: msg };
}

// Service: Build WebSocket URL
function buildWebSocketUrl(sessionId) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/chat/${sessionId}`;
}

// Service: Calculate combined status
function calculateCombinedStatus(agentStatus, acpStatus) {
  if (!agentStatus || agentStatus === 'offline') {
    return { canSend: false, placeholder: 'Agent offline...' };
  }
  if (acpStatus === 'waking') {
    return { canSend: false, placeholder: 'Waking agent...' };
  }
  return { canSend: true, placeholder: 'Type your message...' };
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
  return parts.join(' | ');
}

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
}

// Controller: Connect WebSocket
function connectWebSocket(sessionId) {
  const url = buildWebSocketUrl(sessionId);
  ChatState.socket = new WebSocket(url);
  
  ChatState.socket.onopen = () => {
    console.log('Chat WebSocket connected');
    ChatState.connectionStatus = 'connected';
    updateConnectionStatusUI();
    
    ChatState.socket.send(JSON.stringify({
      type: 'request_state',
      sessionId: ChatState.sessionId,
    }));
  };
  
  ChatState.socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWebSocketMessage(data);
  };
  
  ChatState.socket.onclose = () => {
    console.log('Chat WebSocket disconnected');
    ChatState.connectionStatus = 'disconnected';
    updateConnectionStatusUI();
    
    setTimeout(() => {
      if (ChatState.sessionId) connectWebSocket(ChatState.sessionId);
    }, 3000);
  };
  
  ChatState.socket.onerror = (error) => {
    console.error('Chat WebSocket error:', error);
    ChatState.connectionStatus = 'error';
    updateConnectionStatusUI();
  };
}

// Controller: Handle incoming WebSocket messages
function handleWebSocketMessage(data) {
  console.log('[CHAT] Received:', data.type, data);
  
  switch (data.type) {
    case 'prompt_received':
      handlePromptReceived();
      break;
    case 'thought_start':
      handleThoughtStart();
      break;
    case 'thought_chunk':
      handleThoughtChunk(data.content);
      break;
    case 'thought_end':
      handleThoughtEnd();
      break;
    case 'message_chunk':
      handleMessageChunk(data.content);
      break;
    case 'usage_update':
      handleUsageUpdate(data.usage);
      break;
    case 'message':
      handleMessage(data);
      break;
    case 'error':
      handleErrorMessage(data.message);
      break;
    case 'history':
      loadChatHistory(data.messages);
      break;
    case 'session_initialized':
      handleSessionInitialized(data);
      break;
    case 'model_state':
      updateModelSelector(data.modelState);
      break;
    case 'mode_state':
      updateModeSelector(data.modeState);
      break;
    case 'streaming_state':
      handleStreamingState(data);
      break;
    case 'permission_request':
      showPermissionCard(data);
      break;
    case 'permission_resolved':
      removePermissionCard(data.requestId);
      break;
    case 'session_cleared':
      handleSessionCleared(data);
      break;
    case 'clear_session_error':
      handleClearSessionError(data);
      break;
    case 'acp_status':
      handleAcpStatus(data);
      break;
  }
}

// Controller: Handle prompt received (agent is responding)
function handlePromptReceived() {
  removeEditableBubble();
  insertStreamingMessage();
  startStreamingTimeout();
}

// Controller: Handle thought start
function handleThoughtStart() {
  startStreamingTimeout();
  if (!ChatState.streaming.messageElement) {
    removeEditableBubble();
    insertStreamingMessage();
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
function handleUsageUpdate(usage) {
  clearStreamingTimeout();
  updateUsageDisplay(usage);
  finalizeMessageStream();
  insertEditableBubble();
}

// Controller: Handle regular message
function handleMessage(message) {
  // Skip if already added locally
  if (message.role === 'user' && ChatState.pendingMessages.has(message.content)) {
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
  console.log('[CHAT] ACP status update:', { status, wasReset });
  
  ChatState.acpStatus = status;
  updateAgentStatusUI();
  
  if (wasReset && message) {
    showNotification(message, 'info');
  }
}

// Controller: Handle session initialized
function handleSessionInitialized(data) {
  console.log('[INIT] session_initialized received:', data);
  ChatState.agentStatus = 'online';
  updateAgentStatusUI();
  
  if (data.modelState) updateModelSelector(data.modelState);
  if (data.modeState) updateModeSelector(data.modeState);
}

// Controller: Send message
function sendMessage(content) {
  ChatState.pendingMessages.add(content);
  
  if (ChatState.socket?.readyState === WebSocket.OPEN) {
    ChatState.socket.send(JSON.stringify({
      type: 'send_message',
      content: content,
    }));
  } else {
    sendMessageHttp(content);
  }
}

// Controller: Send via HTTP fallback
async function sendMessageHttp(content) {
  try {
    const res = await fetch(`/sessions/${ChatState.sessionId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ message: content }).toString(),
    });
    
    if (!res.ok) {
      handleErrorMessage('Failed to send message');
    }
  } catch (error) {
    handleErrorMessage(`Failed to send message: ${error.message}`);
  }
}

// Controller: Cancel streaming
function cancelStreaming() {
  console.log('[CHAT] User cancelled streaming');
  clearStreamingTimeout();
  
  if (ChatState.socket?.readyState === WebSocket.OPEN) {
    ChatState.socket.send(JSON.stringify({
      type: 'cancel_request',
      sessionId: ChatState.sessionId,
    }));
  }
  
  removeStreamingMessage();
  insertCancelledMessage();
  insertEditableBubble();
}

// Controller: Clear session
function clearSession() {
  console.log('[CHAT] User requested session clear');
  
  if (ChatState.socket?.readyState === WebSocket.OPEN) {
    ChatState.socket.send(JSON.stringify({
      type: 'clear_session',
      sessionId: ChatState.sessionId,
    }));
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
  console.log('[CHAT] Streaming timeout - agent did not respond within 60 seconds');
  
  if (ChatState.streaming.messageElement) {
    ChatState.streaming.messageElement.remove();
    ChatState.streaming.messageElement = null;
    ChatState.streaming.thoughtElement = null;
    ChatState.streaming.content = '';
    ChatState.streaming.thoughtContent = '';
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
    if (ChatState.streaming.reconstructed && !ChatState.editableBubble && !ChatState.streaming.messageElement) {
      const timeSinceActivity = Date.now() - ChatState.streaming.lastActivity;
      if (timeSinceActivity >= 10000) {
        console.log('[CHAT] Fallback: restoring input after stale reconstructed streaming');
        ChatState.streaming.reconstructed = false;
        insertEditableBubble();
      }
    }
  }, 10000);
}

// Controller: Handle session cleared
function handleSessionCleared(data) {
  console.log('[CHAT] Session cleared:', data);
  
  const pending = document.querySelector('#clear-session-pending');
  if (pending) pending.remove();
  
  insertMessage({
    role: 'system',
    content: 'Session cleared - context reset',
    timestamp: new Date().toISOString(),
  });
}

// Controller: Handle clear session error
function handleClearSessionError(data) {
  console.error('[CHAT] Clear session error:', data);
  
  const pending = document.querySelector('#clear-session-pending');
  if (pending) pending.remove();
  
  insertError(data.error || 'Failed to clear session');
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5: DOM MANIPULATION (View Insertion/Updates)
// These functions insert rendered views into the DOM and update existing ones.
// They bridge the gap between pure views and the live DOM.
// ═════════════════════════════════════════════════════════════════════════════

// DOM: Insert message into chat container
function insertMessage(message) {
  const container = document.querySelector('#chat-messages');
  if (!container) return;
  
  const parsed = parseMessageContent(message.content);
  const el = renderMessage({
    ...message,
    content: parsed.hasThought ? parsed.message : message.content,
  });
  
  // Add thought section if present
  if (parsed.hasThought) {
    const thoughtEl = renderThoughtSection(parsed.thought);
    const contentEl = el.querySelector('.message-content');
    const header = thoughtEl.querySelector('.message-header');
    const thoughtContentDiv = thoughtEl.querySelector('.message-content');
    
    header.addEventListener('click', () => {
      const isVisible = thoughtContentDiv.style.display !== 'none';
      thoughtContentDiv.style.display = isVisible ? 'none' : 'block';
      thoughtEl.classList.toggle('thought-collapsed', isVisible);
      thoughtEl.classList.toggle('thought-expanded', !isVisible);
      header.querySelector('.thought-toggle').textContent = isVisible ? '▶' : '▼';
    });
    
    contentEl.prepend(thoughtEl);
  }
  
  // Attach copy handler
  const copyBtn = el.querySelector('.copy-btn');
  copyBtn.addEventListener('click', () => {
    const text = el.querySelector('.message-content').textContent;
    navigator.clipboard.writeText(text);
  });
  
  // Remove "no messages" placeholder if exists
  const placeholder = container.querySelector('.no-messages');
  if (placeholder) placeholder.remove();
  
  container.appendChild(el);
  scrollToBottom();
}

// DOM: Insert editable bubble
function insertEditableBubble() {
  const container = document.querySelector('#chat-messages');
  if (!container || ChatState.editableBubble) return;
  
  const bubble = renderEditableBubble();
  const content = bubble.querySelector('.message-content');
  const sendBtn = bubble.querySelector('.editable-send-btn');
  
  // Event handlers
  sendBtn.addEventListener('click', submitEditableBubble);
  content.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      submitEditableBubble();
    }
  });
  content.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
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
  
  const content = ChatState.editableBubble.querySelector('.message-content');
  const message = content.innerText.trim();
  if (!message) return;
  
  // Convert to static message
  const header = ChatState.editableBubble.querySelector('.editable-bubble-header');
  if (header) header.remove();
  content.removeAttribute('contenteditable');
  ChatState.editableBubble.classList.remove('editable-bubble');
  
  const staticHeader = document.createElement('div');
  staticHeader.className = 'message-header';
  staticHeader.textContent = 'You';
  ChatState.editableBubble.insertBefore(staticHeader, content);
  
  ChatState.editableBubble = null;
  
  sendMessage(message);
}

// DOM: Insert streaming message
function insertStreamingMessage() {
  const container = document.querySelector('#chat-messages');
  if (!container || ChatState.streaming.messageElement) return;
  
  const el = renderStreamingMessage();
  
  // Attach cancel handler
  const cancelBtn = el.querySelector('.cancel-streaming-btn');
  cancelBtn.addEventListener('click', cancelStreaming);
  
  // Attach copy handler
  const copyBtn = el.querySelector('.copy-btn');
  copyBtn.addEventListener('click', () => {
    const text = el.querySelector('.message-content').textContent;
    navigator.clipboard.writeText(text);
  });
  
  container.appendChild(el);
  ChatState.streaming.messageElement = el;
  ChatState.streaming.content = '';
  ChatState.streaming.active = true;
  scrollToBottom();
}

// DOM: Remove streaming message
function removeStreamingMessage() {
  if (ChatState.streaming.messageElement) {
    ChatState.streaming.messageElement.remove();
    ChatState.streaming.messageElement = null;
    ChatState.streaming.thoughtElement = null;
    ChatState.streaming.content = '';
    ChatState.streaming.thoughtContent = '';
    ChatState.streaming.active = false;
  }
}

// DOM: Finalize message stream (remove indicators)
function finalizeMessageStream() {
  if (!ChatState.streaming.messageElement) return;
  
  const indicator = ChatState.streaming.messageElement.querySelector('.streaming-indicator');
  if (indicator) indicator.remove();
  
  const responseContent = ChatState.streaming.messageElement.querySelector('.message-response');
  if (responseContent) {
    const cursor = responseContent.querySelector('.typing-cursor');
    if (cursor) cursor.remove();
  }
  
  const cancelBtn = ChatState.streaming.messageElement.querySelector('.cancel-streaming-btn');
  if (cancelBtn) cancelBtn.remove();
  
  ChatState.streaming.messageElement.classList.remove('streaming');
  ChatState.streaming.messageElement = null;
  ChatState.streaming.thoughtElement = null;
  ChatState.streaming.content = '';
  ChatState.streaming.thoughtContent = '';
  ChatState.streaming.reconstructed = false;
  ChatState.streaming.active = false;
}

// DOM: Insert thought section
function insertThoughtSection() {
  if (!ChatState.streaming.messageElement || ChatState.streaming.thoughtElement) return;
  
  const contentEl = ChatState.streaming.messageElement.querySelector('.message-content');
  const thoughtEl = renderThoughtSection('');
  const header = thoughtEl.querySelector('.message-header');
  const thoughtContentDiv = thoughtEl.querySelector('.message-content');
  
  header.addEventListener('click', () => {
    const isVisible = thoughtContentDiv.style.display !== 'none';
    thoughtContentDiv.style.display = isVisible ? 'none' : 'block';
    header.querySelector('.thought-toggle').textContent = isVisible ? '▶' : '▼';
    thoughtEl.classList.toggle('thought-collapsed', isVisible);
    thoughtEl.classList.toggle('thought-expanded', !isVisible);
  });
  
  header.innerHTML = '<span class="thought-toggle" style="animation: blink 1s infinite; display: inline-block;">●</span> Thinking...';
  contentEl.insertBefore(thoughtEl, contentEl.firstChild);
  ChatState.streaming.thoughtElement = thoughtEl;
}

// DOM: Update thought content
function updateThoughtContent(text) {
  if (!ChatState.streaming.thoughtElement) return;
  const contentDiv = ChatState.streaming.thoughtElement.querySelector('.message-content');
  contentDiv.textContent += text;
  scrollToBottom();
}

// DOM: Finalize thought section
function finalizeThoughtSection() {
  if (!ChatState.streaming.thoughtElement) return;
  const header = ChatState.streaming.thoughtElement.querySelector('.message-header');
  header.innerHTML = '<span class="thought-toggle">▶</span> Thought Process';
}

// DOM: Update message content
function updateMessageContent(text) {
  if (!ChatState.streaming.messageElement) return;
  
  let responseEl = ChatState.streaming.messageElement.querySelector('.message-response');
  if (!responseEl) {
    responseEl = document.createElement('div');
    responseEl.className = 'message-response';
    ChatState.streaming.messageElement.querySelector('.message-content')?.appendChild(responseEl);
  }
  
  const cursor = responseEl.querySelector('.typing-cursor');
  if (cursor) cursor.remove();
  
  responseEl.textContent += text;
  
  const newCursor = document.createElement('span');
  newCursor.className = 'typing-cursor';
  newCursor.textContent = '▋';
  newCursor.style.color = '#51cf66';
  newCursor.style.animation = 'blink 1s infinite';
  responseEl.appendChild(newCursor);
  
  scrollToBottom();
}

// DOM: Update usage display
function updateUsageDisplay(usage) {
  const container = document.querySelector('#chat-usage');
  if (!container) return;
  
  if (!usage) {
    container.textContent = '';
    container.style.display = 'none';
    return;
  }
  
  container.textContent = formatUsage(usage);
  container.style.display = 'block';
}

// DOM: Update connection status UI
function updateConnectionStatusUI() {
  const statusEl = ChatState.editableBubble?.querySelector('.editable-bubble-status');
  if (!statusEl) return;
  
  const connected = ChatState.connectionStatus === 'connected';
  statusEl.textContent = connected ? '●' : '○';
  statusEl.style.color = connected ? '#51cf66' : '#888';
  statusEl.className = `editable-bubble-status ${ChatState.connectionStatus}`;
}

// DOM: Update agent status UI
function updateAgentStatusUI() {
  const container = document.querySelector('#agent-status-indicator');
  const chatInput = document.querySelector('#chat-input');
  const sendButton = document.querySelector('#send-button');
  
  if (container) {
    const newStatus = renderAgentStatus(ChatState.agentStatus, ChatState.acpStatus);
    container.replaceWith(newStatus);
  }
  
  const { canSend, placeholder } = calculateCombinedStatus(
    ChatState.agentStatus,
    ChatState.acpStatus
  );
  
  if (chatInput) {
    chatInput.disabled = !canSend;
    chatInput.placeholder = placeholder;
  }
  
  if (sendButton) {
    sendButton.disabled = !canSend;
  }
}

// DOM: Show notification
function showNotification(message, type = 'info') {
  const container = document.querySelector('#chat-messages');
  if (!container) return;
  
  const notification = renderNotification(message, type);
  container.appendChild(notification);
  scrollToBottom();
  
  setTimeout(() => notification.remove(), 5000);
}

// DOM: Insert error message
function insertError(message) {
  const container = document.querySelector('#chat-messages');
  if (!container) return;
  
  const el = renderMessage({
    role: 'system',
    content: `Error: ${message}`,
  });
  el.classList.add('error');
  el.querySelector('.message-content').style.color = '#ff6b6b';
  
  container.appendChild(el);
  scrollToBottom();
}

// DOM: Insert cancelled message
function insertCancelledMessage() {
  const container = document.querySelector('#chat-messages');
  if (!container) return;
  
  const el = renderMessage({
    role: 'system',
    content: 'Response cancelled by user.',
  });
  el.classList.add('info');
  el.querySelector('.message-content').style.color = '#888';
  el.querySelector('.message-content').style.fontStyle = 'italic';
  
  container.appendChild(el);
  scrollToBottom();
}

// DOM: Insert timeout warning
function insertTimeoutWarning() {
  const container = document.querySelector('#chat-messages');
  if (!container) return;
  
  const el = renderMessage({
    role: 'system',
    content: 'Warning: Agent did not respond within 60 seconds. You can try sending your message again.',
  });
  el.classList.add('warning');
  el.querySelector('.message-content').style.color = '#ffa500';
  
  container.appendChild(el);
  scrollToBottom();
}

// DOM: Insert pending clear message
function insertPendingClearMessage() {
  const container = document.querySelector('#chat-messages');
  if (!container) return;
  
  const el = renderMessage({
    role: 'system',
    content: 'Clearing session context...',
  });
  el.id = 'clear-session-pending';
  el.querySelector('.message-content').style.color = '#888';
  el.querySelector('.message-content').style.fontStyle = 'italic';
  
  container.appendChild(el);
  scrollToBottom();
}

// DOM: Load chat history
function loadChatHistory(messages) {
  const container = document.querySelector('#chat-messages');
  if (!container) return;
  
  container.innerHTML = '';
  ChatState.editableBubble = null;
  
  let currentThought = '';
  let currentMessage = '';
  let inThought = false;
  let inMessage = false;
  let lastRole = null;
  
  messages.forEach(msg => {
    if (msg.content?.includes('available_commands_update')) return;
    
    const parsed = parseHistoryMessage(msg);
    
    if (parsed.type === 'thought_chunk') {
      if (!inThought) {
        inThought = true;
        currentThought = '';
      }
      currentThought += parsed.content;
      return;
    }
    
    if (parsed.type === 'message_chunk') {
      if (inThought) {
        insertMessage({
          role: 'assistant',
          content: `<details><summary>Thought Process</summary>${currentThought}</details>`,
        });
        inThought = false;
        currentThought = '';
      }
      if (!inMessage) {
        inMessage = true;
        currentMessage = '';
      }
      currentMessage += parsed.content;
      return;
    }
    
    if (parsed.type === 'usage') {
      updateUsageDisplay(parsed.cost);
      return;
    }
    
    lastRole = msg.role;
    insertMessage(msg);
  });
  
  // Flush any pending
  if (inThought && currentThought) {
    insertMessage({
      role: 'assistant',
      content: `<details><summary>Thought Process</summary>${currentThought}</details>`,
    });
  }
  
  if (inMessage && currentMessage) {
    lastRole = 'assistant';
    insertMessage({ role: 'assistant', content: currentMessage });
  }
  
  if (lastRole !== 'user' && !ChatState.streaming.reconstructed) {
    insertEditableBubble();
  }
  
  // Fallback
  setTimeout(() => {
    if (!ChatState.editableBubble && !ChatState.streaming.messageElement && !ChatState.streaming.reconstructed) {
      console.log('[CHAT] Fallback: creating editable bubble after history load');
      insertEditableBubble();
    }
  }, 2000);
}

// DOM: Update model selector
function updateModelSelector(modelState) {
  console.log('[MODEL] Updating with state:', modelState);
  const selector = document.querySelector('#model-selector');
  const container = document.querySelector('#model-selector-container');
  
  if (!selector || !container) {
    console.log('[MODEL] Elements not found');
    return;
  }
  
  if (!modelState?.availableModels?.length) {
    console.log('[MODEL] No data available');
    return;
  }
  
  console.log('[MODEL] Populating with', modelState.availableModels.length, 'options');
  container.style.opacity = '1';
  selector.disabled = false;
  selector.innerHTML = '';
  
  modelState.availableModels.forEach(model => {
    const option = document.createElement('option');
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
  console.log('[MODE] Updating with state:', modeState);
  const selector = document.querySelector('#mode-selector');
  const container = document.querySelector('#mode-selector-container');
  
  if (!selector || !container) {
    console.log('[MODE] Elements not found');
    return;
  }
  
  if (!modeState?.availableModes?.length) {
    console.log('[MODE] No data available');
    return;
  }
  
  console.log('[MODE] Populating with', modeState.availableModes.length, 'options');
  container.style.opacity = '1';
  selector.disabled = false;
  selector.innerHTML = '';
  
  modeState.availableModes.forEach(mode => {
    const option = document.createElement('option');
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
  const container = document.querySelector('#chat-messages');
  if (!container) return;
  
  const { requestId, toolCall, options } = data;
  const card = renderPermissionCard(requestId, toolCall, options);
  
  card.querySelectorAll('.permission-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const optionId = btn.dataset.optionId;
      if (ChatState.socket?.readyState === WebSocket.OPEN) {
        ChatState.socket.send(JSON.stringify({
          type: 'permission_response',
          requestId,
          optionId,
        }));
      }
      removePermissionCard(requestId);
    });
  });
  
  container.appendChild(card);
  scrollToBottom();
}

// DOM: Remove permission card
function removePermissionCard(requestId) {
  const card = document.querySelector(`.permission-card[data-request-id="${requestId}"]`);
  if (card) card.remove();
}

// DOM: Scroll to bottom
function scrollToBottom() {
  const container = document.querySelector('#chat-messages');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6: SETUP & EVENT LISTENERS
// Bootstrap the module when DOM is ready
// ═════════════════════════════════════════════════════════════════════════════

function setupEventListeners() {
  // Model selector
  const modelSelector = document.querySelector('#model-selector');
  if (modelSelector) {
    modelSelector.addEventListener('change', (e) => {
      const modelId = e.target.value;
      const currentId = e.target.dataset.current;
      
      if (modelId !== currentId) {
        e.target.dataset.current = modelId;
        if (ChatState.socket?.readyState === WebSocket.OPEN) {
          ChatState.socket.send(JSON.stringify({
            type: 'set_model',
            modelId,
          }));
        }
      }
    });
  }
  
  // Mode selector
  const modeSelector = document.querySelector('#mode-selector');
  if (modeSelector) {
    modeSelector.addEventListener('change', (e) => {
      const modeId = e.target.value;
      const currentId = e.target.dataset.current;
      
      if (modeId !== currentId) {
        e.target.dataset.current = modeId;
        if (ChatState.socket?.readyState === WebSocket.OPEN) {
          ChatState.socket.send(JSON.stringify({
            type: 'set_mode',
            modeId,
          }));
        }
      }
    });
  }
  
  // Clear session button
  const clearBtn = document.querySelector('#clear-session-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearSession);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7: PUBLIC API
// Expose functions globally
// ═════════════════════════════════════════════════════════════════════════════

window.MIMO_CHAT = {
  init: initChat,
  send: (msg) => {
    if (ChatState.socket?.readyState === WebSocket.OPEN) {
      ChatState.socket.send(JSON.stringify({
        type: 'send_message',
        content: msg,
      }));
    }
  },
  replay: () => {
    if (ChatState.socket?.readyState === WebSocket.OPEN) {
      ChatState.socket.send(JSON.stringify({ type: 'request_replay' }));
    }
  },
  setModel: (modelId) => {
    if (ChatState.socket?.readyState === WebSocket.OPEN) {
      ChatState.socket.send(JSON.stringify({ type: 'set_model', modelId }));
    }
  },
  setMode: (modeId) => {
    if (ChatState.socket?.readyState === WebSocket.OPEN) {
      ChatState.socket.send(JSON.stringify({ type: 'set_mode', modeId }));
    }
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 8: BOOTSTRAP
// Initialize when DOM is ready
// ═════════════════════════════════════════════════════════════════════════════

// Add blinking cursor animation
if (!document.getElementById('chat-animations')) {
  const style = document.createElement('style');
  style.id = 'chat-animations';
  style.textContent = `
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  
  if (window.MIMO_SESSION_ID) {
    initChat(window.MIMO_SESSION_ID);
  }
});
