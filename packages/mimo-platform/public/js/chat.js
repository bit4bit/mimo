// MIMO Chat System - WebSocket client for real-time chat
(function() {
  'use strict';

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

// Chat WebSocket connection
let chatSocket = null;
let currentSessionId = null;
let currentThoughtElement = null;
let currentThoughtContent = null;
let currentMessageElement = null;
let currentMessageContent = null;
let pendingUserMessages = new Set(); // Track messages waiting for server echo
let editableBubble = null; // Reference to the current editable YOU bubble
let _lastConnectionStatus = 'disconnected'; // Last known connection status
let _reconstructedStreaming = false; // Flag to prevent editable bubble until usage_update
let streamingTimeout = null; // Timeout for agent response recovery
let lastStreamingActivity = null; // Timestamp of last streaming activity

  // Initialize chat for a session
  function initChat(sessionId) {
    if (!sessionId) {
      console.error('No session ID provided');
      return;
    }

    currentSessionId = sessionId;
    connectWebSocket(sessionId);
    createEditableBubble();
  }

  // Connect to chat WebSocket
  function connectWebSocket(sessionId) {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/chat/${sessionId}`;
    
    chatSocket = new WebSocket(wsUrl);
    
    chatSocket.onopen = () => {
      console.log('Chat WebSocket connected');
      showConnectionStatus('connected');
      
      // Request current state from agent
      chatSocket.send(JSON.stringify({
        type: 'request_state',
        sessionId: currentSessionId,
      }));
    };
    
    chatSocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };
    
    chatSocket.onclose = () => {
      console.log('Chat WebSocket disconnected');
      showConnectionStatus('disconnected');
      
      // Attempt reconnect after 3 seconds
      setTimeout(() => {
        if (currentSessionId) {
          connectWebSocket(currentSessionId);
        }
      }, 3000);
    };
    
    chatSocket.onerror = (error) => {
      console.error('Chat WebSocket error:', error);
      showConnectionStatus('error');
    };
  }

  // Handle incoming WebSocket messages
  function handleWebSocketMessage(data) {
    console.log('[CHAT] Received message type:', data.type, data);
    
    switch (data.type) {
      case 'prompt_received':
        createWaitingAgentMessage();
        startStreamingTimeout();
        break;

      case 'thought_start':
        startStreamingTimeout(); // reset 60s timer — agent is actively thinking
        startThoughtSection();
        break;

      case 'thought_chunk':
        appendThoughtChunk(data.content);
        break;

      case 'thought_end':
        endThoughtSection();
        break;

      case 'message_chunk':
        startStreamingTimeout(); // reset 60s timer — agent is actively writing
        appendMessageChunk(data.content);
        break;
        
      case 'usage_update':
        clearStreamingTimeout();
        updateUsageDisplay(data.usage);
        endMessageStream();
        break;
        
      case 'message':
        // Check if this is a user message we already added locally
        if (data.role === 'user' && pendingUserMessages.has(data.content)) {
          pendingUserMessages.delete(data.content);
          return; // Skip - already added locally
        }
        addMessageToChat(data);
        break;
        
      case 'error':
        // Clean up any waiting/streaming element before showing the error
        if (currentMessageElement) {
          currentMessageElement.remove();
          currentMessageElement = null;
          currentMessageContent = null;
          currentThoughtElement = null;
          currentThoughtContent = null;
        }
        showError(data.message);
        break;
        
      case 'history':
        loadChatHistory(data.messages);
        break;

      case 'session_initialized':
        // Initialize model and mode selectors
        console.log('[INIT] session_initialized received:', data);
        // Session initialized means agent is online
        currentAgentStatus = 'online';
        updateAgentStatusUI(currentAgentStatus, currentAcpStatus);
        if (data.modelState) {
          updateModelSelector(data.modelState);
        } else {
          console.log('[INIT] No modelState in message');
        }
        if (data.modeState) {
          updateModeSelector(data.modeState);
        } else {
          console.log('[INIT] No modeState in message');
        }
        break;

      case 'model_state':
        // Update model selector
        if (data.modelState) {
          updateModelSelector(data.modelState);
        }
        break;

      case 'mode_state':
        // Update mode selector
        if (data.modeState) {
          updateModeSelector(data.modeState);
        }
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

  let currentAcpStatus = 'active'; // Track current ACP status
  let currentAgentStatus = null; // Track agent connection status

  function handleAcpStatus(data) {
    const { status, sessionId, wasReset, message } = data;
    console.log('[CHAT] ACP status update:', { status, sessionId, wasReset });

    currentAcpStatus = status;
    updateAgentStatusUI(currentAgentStatus, status);

    // Show notification for session reset
    if (wasReset && message) {
      showNotification(message, 'info');
    }
  }

  // Handle agent status from session_initialized and other messages
  function updateAgentConnectionStatus(agentStatus) {
    currentAgentStatus = agentStatus;
    updateAgentStatusUI(agentStatus, currentAcpStatus);
  }

  function updateAgentStatusUI(agentStatus, acpStatus) {
    // Update combined status indicator in UI
    const statusIndicator = document.querySelector('#agent-status-indicator');
    const chatInput = document.querySelector('#chat-input');
    const sendButton = document.querySelector('#send-button');

    if (statusIndicator) {
      // Compute combined status
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
      
      statusIndicator.className = `agent-status-combined ${statusClass}`;
      statusIndicator.textContent = statusText;
      statusIndicator.title = statusTitle;
    }

    // Disable/enable input based on status
    if (chatInput) {
      if (acpStatus === 'waking') {
        chatInput.disabled = true;
        chatInput.placeholder = 'Waking agent...';
      } else if (!agentStatus || agentStatus === 'offline') {
        chatInput.disabled = true;
        chatInput.placeholder = 'Agent offline...';
      } else {
        chatInput.disabled = false;
        chatInput.placeholder = 'Type your message...';
      }
    }

    if (sendButton) {
      sendButton.disabled = acpStatus === 'waking' || !agentStatus || agentStatus === 'offline';
    }
  }

  function showNotification(message, type = 'info') {
    const chatContainer = document.querySelector('#chat-messages');
    if (!chatContainer) return;

    const notification = document.createElement('div');
    notification.className = `message message-system notification notification--${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      padding: 8px 12px;
      margin: 8px 0;
      border-radius: 4px;
      background: ${type === 'info' ? '#e3f2fd' : type === 'warning' ? '#fff3e0' : '#ffebee'};
      color: ${type === 'info' ? '#1976d2' : type === 'warning' ? '#f57c00' : '#d32f2f'};
      font-size: 0.9em;
      text-align: center;
    `;

    chatContainer.appendChild(notification);
    scrollToBottom();

    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  function handleStreamingState(data) {
    const { thoughtContent, messageContent } = data;
    
    _reconstructedStreaming = true;
    lastStreamingActivity = Date.now();
    
    if (thoughtContent) {
      startThoughtSection();
      appendThoughtChunk(thoughtContent);
      endThoughtSection();
    }
    
    if (messageContent) {
      appendMessageChunk(messageContent);
    }
    
    // If reconstructed streaming state but no activity for 10 seconds and no active
    // streaming element, assume agent finished without usage_update and restore input.
    setTimeout(() => {
      if (_reconstructedStreaming && !editableBubble && !currentMessageElement) {
        const timeSinceActivity = Date.now() - lastStreamingActivity;
        if (timeSinceActivity >= 10000) {
          console.log('[CHAT] Fallback: restoring input after stale reconstructed streaming');
          _reconstructedStreaming = false;
          createEditableBubble();
        }
      }
    }, 10000);
  }

  function showPermissionCard(data) {
    const { requestId, toolCall, options } = data;
    const chatMessages = document.querySelector('#chat-messages');
    if (!chatMessages) return;

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

    card.querySelectorAll('.permission-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const optionId = btn.dataset.optionId;
        if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
          chatSocket.send(JSON.stringify({ type: 'permission_response', requestId, optionId }));
        }
        removePermissionCard(requestId);
      });
    });

    chatMessages.appendChild(card);
    scrollToBottom();
  }

  function removePermissionCard(requestId) {
    const card = document.querySelector(`.permission-card[data-request-id="${requestId}"]`);
    if (card) card.remove();
  }

  // Create the editable YOU bubble at the bottom of chat-messages
  function createEditableBubble() {
    const chatContainer = document.querySelector('#chat-messages');
    if (!chatContainer) return;
    // Don't create if one already exists
    if (editableBubble) return;

    const bubble = document.createElement('div');
    bubble.className = 'message message-user editable-bubble';

    // Header: YOU · ● status · spacer · [⌃↵ Send]
    const header = document.createElement('div');
    header.className = 'message-header editable-bubble-header';

    const label = document.createElement('span');
    label.textContent = 'You';

    const status = document.createElement('span');
    status.className = 'editable-bubble-status';
    status.title = 'Connection status';

    const spacer = document.createElement('span');
    spacer.style.flex = '1';

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'editable-send-btn';
    sendBtn.textContent = '⌃↵ Send';
    sendBtn.addEventListener('click', submitEditableBubble);

    header.appendChild(label);
    header.appendChild(status);
    header.appendChild(spacer);
    header.appendChild(sendBtn);

    // Editable content area
    const content = document.createElement('div');
    content.className = 'message-content';
    content.contentEditable = 'true';
    content.setAttribute('data-placeholder', 'Type a message...');

    // Ctrl+Enter to send; Enter inserts newline (native contenteditable behavior)
    content.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        submitEditableBubble();
      }
    });

    // Paste: strip HTML, insert plain text only
    content.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    bubble.appendChild(header);
    bubble.appendChild(content);

    chatContainer.appendChild(bubble);
    scrollToBottom();
    content.focus();

    editableBubble = bubble;

    // Apply current connection status to the new bubble
    showConnectionStatus(_lastConnectionStatus || 'disconnected');
  }

  // Send the editable bubble's content
  function submitEditableBubble() {
    if (!editableBubble) return;

    const content = editableBubble.querySelector('.message-content[contenteditable]');
    if (!content) return;

    const message = content.innerText.trim();
    if (!message) return;

    // Convert bubble to read-only: remove contenteditable and header controls
    const header = editableBubble.querySelector('.editable-bubble-header');
    if (header) header.remove();
    content.removeAttribute('contenteditable');
    editableBubble.classList.remove('editable-bubble');

    // Replace with a static message-header
    const staticHeader = document.createElement('div');
    staticHeader.className = 'message-header';
    staticHeader.textContent = 'You';
    editableBubble.insertBefore(staticHeader, content);

    editableBubble = null;

    // Add to pending to avoid duplicate when server echoes
    pendingUserMessages.add(message);

    // Send via WebSocket or HTTP fallback
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(JSON.stringify({
        type: 'send_message',
        content: message,
      }));
    } else {
      sendMessageHttp(message);
    }
  }

  // Send message via HTTP fallback
  async function sendMessageHttp(message) {
    try {
      const res = await fetch(`/sessions/${currentSessionId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ message }).toString(),
      });
      
      if (!res.ok) {
        showError('Failed to send message');
      }
    } catch (error) {
      showError('Failed to send message: ' + error.message);
    }
  }

  // Add a message to the chat display
  function addMessageToChat(message) {
    const chatContainer = document.querySelector('#chat-messages');
    if (!chatContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${message.role}`;
    messageDiv.dataset.messageId = message.id || Date.now().toString();
    
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
    copyBtn.addEventListener('click', function() {
      navigator.clipboard.writeText(this.closest('.message').querySelector('.message-content').textContent);
    });
    
    header.appendChild(label);
    header.appendChild(copyBtn);
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    // Parse thought toggle HTML if present
    if (message.content.includes('<details>')) {
      // Match the entire details block including newlines
      const detailsMatch = message.content.match(/<details>\s*<summary>(.+?)<\/summary>\s*([\s\S]*?)<\/details>/);
      if (detailsMatch) {
        // Extract thought content (everything between </summary> and </details>)
        const thoughtText = detailsMatch[2].trim();
        
        // Get the rest of the message (after </details>), removing leading newlines
        const restContent = message.content.replace(/<details>[\s\S]*?<\/details>/, '').replace(/^\s*\n+/, '');
        
         // Thought toggle (same structure as streaming, matching agent background)
        const thoughtToggle = document.createElement('div');
        thoughtToggle.className = 'message-thought thought-collapsed';
        thoughtToggle.style.marginBottom = '10px';
        thoughtToggle.style.background = '#2d2d2d';
        thoughtToggle.style.borderRadius = '4px';
        
        const thoughtHeader = document.createElement('div');
        thoughtHeader.className = 'message-header';
        thoughtHeader.style.background = '#3d3d3d';
        thoughtHeader.innerHTML = '<span class="thought-toggle">▶</span> Thought Process';
        thoughtHeader.style.cursor = 'pointer';
        thoughtHeader.style.fontSize = '0.9em';
        thoughtHeader.style.padding = '4px 8px';
        thoughtHeader.style.justifyContent = 'flex-start';
        
        const thoughtContentDiv = document.createElement('div');
        thoughtContentDiv.className = 'message-content';
        thoughtContentDiv.style.display = 'none';
        thoughtContentDiv.style.padding = '8px';
        thoughtContentDiv.style.fontSize = '0.9em';
        thoughtContentDiv.style.color = '#d4d4d4';
        thoughtContentDiv.style.background = '#2d2d2d';
        thoughtContentDiv.textContent = thoughtText;
        
        thoughtHeader.addEventListener('click', () => {
          const isVisible = thoughtContentDiv.style.display !== 'none';
          thoughtContentDiv.style.display = isVisible ? 'none' : 'block';
          thoughtToggle.classList.toggle('thought-collapsed', isVisible);
          thoughtToggle.classList.toggle('thought-expanded', !isVisible);
          thoughtHeader.querySelector('.thought-toggle').textContent = isVisible ? '▶' : '▼';
        });
        
        thoughtToggle.appendChild(thoughtHeader);
        thoughtToggle.appendChild(thoughtContentDiv);
        content.appendChild(thoughtToggle);
        
        // Rest of message
        if (restContent) {
          const mainContent = document.createElement('div');
          mainContent.style.marginTop = '10px';
          mainContent.textContent = restContent;
          content.appendChild(mainContent);
        }
      } else {
        content.textContent = message.content;
      }
    } else {
      content.textContent = message.content;
    }
    
    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    
    // Remove "no messages" placeholder if exists
    const placeholder = chatContainer.querySelector('.no-messages');
    if (placeholder) {
      placeholder.remove();
    }
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
  }

  // Create a waiting agent message element (shown when prompt_received arrives)
  function createWaitingAgentMessage() {
    const chatContainer = document.querySelector('#chat-messages');
    if (!chatContainer) return;

    // Don't create if one already exists
    if (currentMessageElement) return;

    // Remove any premature input bubble — agent is now responding
    if (editableBubble) {
      editableBubble.remove();
      editableBubble = null;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-assistant streaming';

    const header = document.createElement('div');
    header.className = 'message-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    const agentLabel = document.createElement('span');
    agentLabel.textContent = 'Agent';
    header.appendChild(agentLabel);
    
    // Add cancel button
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
    cancelBtn.addEventListener('click', handleCancelStreaming);
    header.appendChild(cancelBtn);

    // Add copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = '📋';
    copyBtn.style.marginLeft = '5px';
    copyBtn.addEventListener('click', function() {
      const content = this.closest('.message').querySelector('.message-content');
      const text = content ? content.textContent : '';
      navigator.clipboard.writeText(text);
    });
    header.appendChild(copyBtn);

    const content = document.createElement('div');
    content.className = 'message-content';

    const waiting = document.createElement('span');
    waiting.className = 'waiting-indicator streaming-indicator';
    waiting.style.animation = 'blink 1s infinite';
    waiting.textContent = '● Received, processing...';

    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    messageDiv.appendChild(waiting);

    chatContainer.appendChild(messageDiv);
    scrollToBottom();

    currentMessageElement = messageDiv;
    currentMessageContent = content;
  }

  // Handle cancel button click
  function handleCancelStreaming() {
    console.log('[CHAT] User cancelled streaming');
    
    // Clear streaming timeout
    clearStreamingTimeout();
    
    // Send cancel request to server
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(JSON.stringify({
        type: 'cancel_request',
        sessionId: currentSessionId,
      }));
    }
    
    // Clean up streaming elements
    if (currentMessageElement) {
      currentMessageElement.remove();
      currentMessageElement = null;
      currentMessageContent = null;
      currentThoughtElement = null;
      currentThoughtContent = null;
    }
    
    // Show cancelled message
    const chatContainer = document.querySelector('#chat-messages');
    if (chatContainer) {
      const cancelledDiv = document.createElement('div');
      cancelledDiv.className = 'message message-system info';
      
      const content = document.createElement('div');
      content.className = 'message-content';
      content.textContent = 'Response cancelled by user.';
      content.style.color = '#888';
      content.style.fontStyle = 'italic';
      
      cancelledDiv.appendChild(content);
      chatContainer.appendChild(cancelledDiv);
      scrollToBottom();
    }
    
    // Restore input
    endMessageStream();
    createEditableBubble();
  }

  // Handle clear session button click
  function handleClearSession() {
    console.log('[CHAT] User requested session clear');
    
    // Send clear session request to server
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(JSON.stringify({
        type: 'clear_session',
        sessionId: currentSessionId,
      }));
    }
    
    // Show pending message in chat
    const chatContainer = document.querySelector('#chat-messages');
    if (chatContainer) {
      const pendingDiv = document.createElement('div');
      pendingDiv.className = 'message message-system';
      pendingDiv.id = 'clear-session-pending';
      
      const header = document.createElement('div');
      header.className = 'message-header';
      header.textContent = 'System';
      
      const content = document.createElement('div');
      content.className = 'message-content';
      content.textContent = 'Clearing session context...';
      content.style.color = '#888';
      content.style.fontStyle = 'italic';
      
      pendingDiv.appendChild(header);
      pendingDiv.appendChild(content);
      chatContainer.appendChild(pendingDiv);
      scrollToBottom();
    }
  }

  // Start a thought section inside the current message
  function startThoughtSection() {
    const chatContainer = document.querySelector('#chat-messages');
    if (!chatContainer) return;

    // Reuse existing thought section if already created for this turn
    if (currentThoughtElement && currentThoughtContent) {
      const header = currentThoughtElement.querySelector('.message-header');
      if (header) {
        header.innerHTML = '<span class="thought-toggle" style="animation: blink 1s infinite; display: inline-block;">●</span> Thinking...';
      }
      return;
    }

    // Remove any premature input bubble — agent has resumed streaming
    if (editableBubble) {
      editableBubble.remove();
      editableBubble = null;
    }

    // Wait for message element to exist
    if (!currentMessageElement) {
      // Message hasn't started yet, create it first
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message message-assistant streaming';

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
      cancelBtn.addEventListener('click', handleCancelStreaming);
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = '📋';
      copyBtn.style.marginLeft = '5px';
      copyBtn.addEventListener('click', function() {
        const content = this.closest('.message').querySelector('.message-content');
        const text = content ? content.textContent : '';
        navigator.clipboard.writeText(text);
      });
      
      header.appendChild(agentLabel);
      header.appendChild(cancelBtn);
      header.appendChild(copyBtn);

      const content = document.createElement('div');
      content.className = 'message-content';

      const indicator = document.createElement('span');
      indicator.className = 'streaming-indicator';
      indicator.textContent = '●';

      messageDiv.appendChild(header);
      messageDiv.appendChild(content);
      messageDiv.appendChild(indicator);

      chatContainer.appendChild(messageDiv);
      scrollToBottom();

      currentMessageElement = messageDiv;
      currentMessageContent = content;
    } else {
      // Element already exists (created by prompt_received) — swap waiting indicator for streaming indicator
      const waitingIndicator = currentMessageElement.querySelector('.waiting-indicator');
      if (waitingIndicator) waitingIndicator.remove();
      const indicator = document.createElement('span');
      indicator.className = 'streaming-indicator';
      indicator.textContent = '●';
      currentMessageElement.appendChild(indicator);
    }
    
    // Now create thought section inside message content
    const content = currentMessageElement.querySelector('.message-content');
    if (!content) return;
    
    // Create thought container
    const thoughtDiv = document.createElement('div');
    thoughtDiv.className = 'message-thought thought-collapsed';
    thoughtDiv.style.marginBottom = '10px';
    thoughtDiv.style.background = '#2d2d2d';
    thoughtDiv.style.borderRadius = '4px';
    
    const thoughtHeader = document.createElement('div');
    thoughtHeader.className = 'message-header';
    thoughtHeader.style.background = '#3d3d3d';
    thoughtHeader.innerHTML = '<span class="thought-toggle" style="animation: blink 1s infinite; display: inline-block;">●</span> Thinking...';
    thoughtHeader.style.cursor = 'pointer';
    thoughtHeader.style.fontSize = '0.9em';
    thoughtHeader.style.padding = '4px 8px';
    thoughtHeader.style.justifyContent = 'flex-start';

    const thoughtContentDiv = document.createElement('div');
    thoughtContentDiv.className = 'message-content';
    thoughtContentDiv.style.display = 'none';
    thoughtContentDiv.style.padding = '8px';
    thoughtContentDiv.style.fontSize = '0.9em';
    thoughtContentDiv.style.color = '#d4d4d4';
    thoughtContentDiv.style.background = '#2d2d2d';

    // Toggle visibility
    thoughtHeader.addEventListener('click', () => {
      const isVisible = thoughtContentDiv.style.display !== 'none';
      thoughtContentDiv.style.display = isVisible ? 'none' : 'block';
      thoughtHeader.querySelector('.thought-toggle').textContent = isVisible ? '▶' : '▼';
      thoughtDiv.classList.toggle('thought-collapsed', isVisible);
      thoughtDiv.classList.toggle('thought-expanded', !isVisible);
    });
    
    thoughtDiv.appendChild(thoughtHeader);
    thoughtDiv.appendChild(thoughtContentDiv);
    
    // Insert before any existing content
    content.insertBefore(thoughtDiv, content.firstChild);
    
    currentThoughtElement = thoughtDiv;
    currentThoughtContent = thoughtContentDiv;
  }

  // Append a chunk to the thought section
  function appendThoughtChunk(text) {
    if (!currentThoughtContent) {
      // Thought section might not exist yet, create it
      startThoughtSection();
    }
    if (!currentThoughtContent) return;
    currentThoughtContent.textContent += text || '';
    scrollToBottom();
  }

  // End the thought section
  function endThoughtSection() {
    if (currentThoughtElement) {
      const header = currentThoughtElement.querySelector('.message-header');
      if (header) {
        header.innerHTML = '<span class="thought-toggle">▶</span> Thought Process';
      }
    }
    // Keep references alive — subsequent thought_start events in the same turn
    // will reuse this element. Cleanup happens in endMessageStream / cancel / error.
  }

  // Append a chunk to the assistant message
  function appendMessageChunk(text) {
    if (!currentMessageElement) {
      // No thought_start or prompt_received preceded this chunk — create the message element now
      // Remove any premature input bubble first
      if (editableBubble) {
        editableBubble.remove();
        editableBubble = null;
      }

      const chatContainer = document.querySelector('#chat-messages');
      if (!chatContainer) return;

      const messageDiv = document.createElement('div');
      messageDiv.className = 'message message-assistant streaming';

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
      cancelBtn.addEventListener('click', handleCancelStreaming);
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = '📋';
      copyBtn.style.marginLeft = '5px';
      copyBtn.addEventListener('click', function() {
        const content = this.closest('.message').querySelector('.message-content');
        const text = content ? content.textContent : '';
        navigator.clipboard.writeText(text);
      });
      
      header.appendChild(agentLabel);
      header.appendChild(cancelBtn);
      header.appendChild(copyBtn);

      const content = document.createElement('div');
      content.className = 'message-content';

      const indicator = document.createElement('span');
      indicator.className = 'streaming-indicator';
      indicator.textContent = '●';

      messageDiv.appendChild(header);
      messageDiv.appendChild(content);
      messageDiv.appendChild(indicator);

      chatContainer.appendChild(messageDiv);
      scrollToBottom();

      currentMessageElement = messageDiv;
      currentMessageContent = content;
    } else {
      // Element already exists (created by prompt_received or thought_start) — remove waiting indicator
      const waitingIndicator = currentMessageElement.querySelector('.waiting-indicator');
      if (waitingIndicator) waitingIndicator.remove();
    }
    
    // Find or create a container for the response text (after thought section)
    let responseContent = currentMessageElement.querySelector('.message-response');
    if (!responseContent) {
      responseContent = document.createElement('div');
      responseContent.className = 'message-response';
      currentMessageElement.querySelector('.message-content')?.appendChild(responseContent);
    }
    
    // Remove cursor if exists
    const existingCursor = responseContent.querySelector('.typing-cursor');
    if (existingCursor) {
      existingCursor.remove();
    }
    
    // Append text
    responseContent.textContent += text;
    
    // Add blinking cursor at end
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    cursor.textContent = '▋';
    cursor.style.color = '#51cf66';
    cursor.style.animation = 'blink 1s infinite';
    responseContent.appendChild(cursor);
    
    scrollToBottom();
  }

  // End the message stream
  function endMessageStream() {
    if (!currentMessageElement) return;
    
    // Remove streaming indicator
    const indicator = currentMessageElement.querySelector('.streaming-indicator');
    if (indicator) {
      indicator.remove();
    }
    
    // Remove typing cursor
    const responseContent = currentMessageElement.querySelector('.message-response');
    if (responseContent) {
      const cursor = responseContent.querySelector('.typing-cursor');
      if (cursor) {
        cursor.remove();
      }
    }

    // Remove cancel button
    const cancelBtn = currentMessageElement.querySelector('.cancel-streaming-btn');
    if (cancelBtn) {
      cancelBtn.remove();
    }

    currentMessageElement.classList.remove('streaming');
    currentMessageElement = null;
    currentMessageContent = null;
    currentThoughtElement = null;
    currentThoughtContent = null;
    _reconstructedStreaming = false;

    // Agent has finished responding — show the editable bubble
    createEditableBubble();
  }

  // Update usage display
  function updateUsageDisplay(usage) {
    const usageEl = document.querySelector('#chat-usage');
    if (!usageEl) return;
    
    if (!usage) {
      usageEl.textContent = '';
      usageEl.style.display = 'none';
      return;
    }
    
    const parts = [];
    
    // Show cost if available
    if (usage.cost?.amount !== undefined) {
      const amount = usage.cost.amount / 100;
      parts.push(`Cost: $${amount.toFixed(4)}`);
    }
    
    // Show tokens used if available
    if (usage.used !== undefined) {
      parts.push(`Tokens: ${usage.used.toLocaleString()}`);
    }
    
    // Show context size if available
    if (usage.size !== undefined) {
      parts.push(`Context: ${usage.size.toLocaleString()}`);
    }
    
    if (parts.length > 0) {
      usageEl.textContent = parts.join(' | ');
      usageEl.style.display = 'block';
    } else {
      usageEl.textContent = '';
      usageEl.style.display = 'none';
    }
  }

  // Scroll chat to bottom
  function scrollToBottom() {
    const chatContainer = document.querySelector('#chat-messages');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  // Show connection status — updates the ● indicator inside the editable bubble header
  function showConnectionStatus(status) {
    _lastConnectionStatus = status;
    const statusEl = editableBubble
      ? editableBubble.querySelector('.editable-bubble-status')
      : null;
    if (!statusEl) return; // Bubble not visible (agent processing) — silent
    statusEl.className = `editable-bubble-status ${status}`;
    statusEl.textContent = status === 'connected' ? '●' : '○';
    statusEl.style.color = status === 'connected' ? '#51cf66' : '#888';
  }

  // Show error
  function showError(message) {
    const chatContainer = document.querySelector('#chat-messages');
    if (!chatContainer) return;
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message message-system error';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = `Error: ${message}`;
    content.style.color = '#ff6b6b';
    
    errorDiv.appendChild(content);
    chatContainer.appendChild(errorDiv);
    scrollToBottom();
  }

  // Load chat history
  function loadChatHistory(messages) {
    const chatContainer = document.querySelector('#chat-messages');
    if (!chatContainer) return;

    // Clear existing messages and any existing editable bubble
    chatContainer.innerHTML = '';
    editableBubble = null;
    
    // Track current thought and message for grouping
    let currentThoughtText = '';
    let currentMessageText = '';
    let inThought = false;
    let inMessage = false;
    let lastRole = null;

    messages.forEach(msg => {
      // Skip available_commands_update in history
      if (msg.content && msg.content.includes('available_commands_update')) {
        return;
      }
      
      // Try to parse JSON content for assistant messages
      if (msg.role === 'assistant' && msg.content) {
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed.update) {
            const updateType = parsed.update.sessionUpdate;
            const text = parsed.update.content?.text || '';
            
            // Handle thought chunks
            if (updateType === 'agent_thought_chunk') {
              if (!inThought) {
                inThought = true;
                currentThoughtText = '';
              }
              currentThoughtText += text;
              return; // Skip adding as individual message
            }
            
            // Handle message chunks
            if (updateType === 'agent_message_chunk') {
              if (inThought) {
                // End thought section first
                addThoughtToChat(chatContainer, currentThoughtText);
                inThought = false;
                currentThoughtText = '';
              }
              if (!inMessage) {
                inMessage = true;
                currentMessageText = '';
              }
              currentMessageText += text;
              return; // Skip adding as individual message
            }
            
            // Handle usage
            if (updateType === 'usage_update') {
              updateUsageDisplay(parsed.update.cost || {});
              return;
            }
            
            // Skip other types
            return;
          }
        } catch (e) {
          // Not JSON, display as-is
        }
      }
      
      // User message or unparseable content
      lastRole = msg.role;
      addMessageToChat(msg);
    });
    
    // Add any pending thought
    if (inThought && currentThoughtText) {
      addThoughtToChat(chatContainer, currentThoughtText);
    }
    
    // Add any pending message
    if (inMessage && currentMessageText) {
      lastRole = 'assistant';
      addMessageToChat({
        role: 'assistant',
        content: currentMessageText,
      });
    }

    scrollToBottom();

    // Show editable bubble only if:
    // - last message is NOT from the user, AND
    // - we haven't reconstructed streaming state (wait for usage_update)
    if (lastRole !== 'user' && !_reconstructedStreaming) {
      createEditableBubble();
    }
    
    // Fallback: if after 2s there is still no input bubble AND no active/reconstructed
    // streaming, create the bubble. Avoids clearing currentMessageElement mid-stream.
    setTimeout(() => {
      if (!editableBubble && !currentMessageElement && !_reconstructedStreaming) {
        console.log('[CHAT] Fallback: creating editable bubble after history load');
        createEditableBubble();
      }
    }, 2000);
  }

  // Add thought section to chat (legacy - for old ACP format)
  function addThoughtToChat(container, text) {
    if (!text || !text.trim()) return;
    
    const thoughtDiv = document.createElement('div');
    thoughtDiv.className = 'message message-thought';
    thoughtDiv.style.background = '#2d2d2d';
    thoughtDiv.style.borderRadius = '4px';
    
    const header = document.createElement('div');
    header.className = 'thought-header';
    header.innerHTML = '<span class="thought-toggle">▶</span> Thought Process';
    header.style.cursor = 'pointer';
    header.style.fontSize = '0.9em';
    header.style.padding = '4px 8px';
    header.style.background = '#3d3d3d';
    
    const content = document.createElement('div');
    content.className = 'thought-content';
    content.textContent = text;
    content.style.display = 'none';
    content.style.padding = '8px';
    content.style.fontSize = '0.9em';
    content.style.color = '#d4d4d4';
    content.style.background = '#2d2d2d';
    
    header.addEventListener('click', () => {
      const isVisible = content.style.display !== 'none';
      content.style.display = isVisible ? 'none' : 'block';
      header.querySelector('.thought-toggle').textContent = isVisible ? '▶' : '▼';
    });
    
    thoughtDiv.appendChild(header);
    thoughtDiv.appendChild(content);
    container.appendChild(thoughtDiv);
  }

  // Request chat replay
  function replayChat() {
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(JSON.stringify({
        type: 'request_replay',
      }));
    }
  }

  // Expose functions globally
  window.MIMO_CHAT = {
    init: initChat,
    send: (msg) => {
      if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({
          type: 'send_message',
          content: msg,
        }));
      }
    },
    replay: replayChat,
    setModel: (modelId) => {
      if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({
          type: 'set_model',
          modelId: modelId,
        }));
      }
    },
    setMode: (modeId) => {
      if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({
          type: 'set_mode',
          modeId: modeId,
        }));
      }
    },
  };

  // Auto-initialize if session ID is available
  document.addEventListener('DOMContentLoaded', () => {
    if (window.MIMO_SESSION_ID) {
      initChat(window.MIMO_SESSION_ID);
    }
    
    // Set up model/mode selector event listeners
    setupSelectorListeners();
    
    // Set up clear session button
    const clearBtn = document.querySelector('#clear-session-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', handleClearSession);
    }
  });
  
  // Set up selector event listeners
  function setupSelectorListeners() {
    const modelSelector = document.querySelector('#model-selector');
    const modeSelector = document.querySelector('#mode-selector');
    
    if (modelSelector) {
      modelSelector.addEventListener('change', (e) => {
        const modelId = e.target.value;
        const currentId = e.target.dataset.current;
        
        if (modelId !== currentId) {
          e.target.dataset.current = modelId;
          if (window.MIMO_CHAT && window.MIMO_CHAT.setModel) {
            window.MIMO_CHAT.setModel(modelId);
          }
        }
      });
    }
    
    if (modeSelector) {
      modeSelector.addEventListener('change', (e) => {
        const modeId = e.target.value;
        const currentId = e.target.dataset.current;
        
        if (modeId !== currentId) {
          e.target.dataset.current = modeId;
          if (window.MIMO_CHAT && window.MIMO_CHAT.setMode) {
            window.MIMO_CHAT.setMode(modeId);
          }
        }
      });
    }
  }
  
  // Update model selector
  function updateModelSelector(modelState) {
    console.log('[MODEL] Updating with state:', modelState);
    const selector = document.querySelector('#model-selector');
    const container = document.querySelector('#model-selector-container');
    
    if (!selector || !container) {
      console.log('[MODEL] Elements not found');
      return;
    }
    
    if (!modelState || !modelState.availableModels || modelState.availableModels.length === 0) {
      console.log('[MODEL] No data available');
      return;
    }
    
    // Enable and populate
    console.log('[MODEL] Populating with', modelState.availableModels.length, 'options');
    container.style.opacity = '1';
    selector.disabled = false;
    
    // Clear and rebuild options
    selector.innerHTML = '';
    modelState.availableModels.forEach((model) => {
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

  // Update mode selector
  function updateModeSelector(modeState) {
    console.log('[MODE] Updating with state:', modeState);
    const selector = document.querySelector('#mode-selector');
    const container = document.querySelector('#mode-selector-container');
    
    if (!selector || !container) {
      console.log('[MODE] Elements not found');
      return;
    }
    
    if (!modeState || !modeState.availableModes || modeState.availableModes.length === 0) {
      console.log('[MODE] No data available');
      return;
    }
    
    // Enable and populate
    console.log('[MODE] Populating with', modeState.availableModes.length, 'options');
    container.style.opacity = '1';
    selector.disabled = false;
    
    // Clear and rebuild options
    selector.innerHTML = '';
    modeState.availableModes.forEach((mode) => {
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

  // Start streaming timeout - called when prompt_received arrives
  function startStreamingTimeout() {
    clearStreamingTimeout();
    lastStreamingActivity = Date.now();
    streamingTimeout = setTimeout(() => {
      handleStreamingTimeout();
    }, 60000); // 60 seconds
  }

  // Clear streaming timeout - called when usage_update arrives
  function clearStreamingTimeout() {
    if (streamingTimeout) {
      clearTimeout(streamingTimeout);
      streamingTimeout = null;
    }
    lastStreamingActivity = Date.now();
  }

  // Handle streaming timeout - agent didn't respond
  function handleStreamingTimeout() {
    console.log('[CHAT] Streaming timeout - agent did not respond within 60 seconds');
    
    // Clean up streaming elements
    if (currentMessageElement) {
      currentMessageElement.remove();
      currentMessageElement = null;
      currentMessageContent = null;
      currentThoughtElement = null;
      currentThoughtContent = null;
    }
    
    // Show warning message
    const chatContainer = document.querySelector('#chat-messages');
    if (chatContainer) {
      const warningDiv = document.createElement('div');
      warningDiv.className = 'message message-system warning';
      
      const content = document.createElement('div');
      content.className = 'message-content';
      content.textContent = 'Warning: Agent did not respond within 60 seconds. You can try sending your message again.';
      content.style.color = '#ffa500';
      
      warningDiv.appendChild(content);
      chatContainer.appendChild(warningDiv);
      scrollToBottom();
    }
    
    // Restore input
    endMessageStream();
    createEditableBubble();
  }
  // Handle session cleared confirmation
  function handleSessionCleared(data) {
    console.log('[CHAT] Session cleared:', data);
    
    // Remove pending message if exists
    const pendingDiv = document.querySelector('#clear-session-pending');
    if (pendingDiv) {
      pendingDiv.remove();
    }
    
    // Add system message to chat
    addMessageToChat({
      role: 'system',
      content: 'Session cleared - context reset',
      timestamp: new Date().toISOString(),
    });
  }

  // Handle clear session error
  function handleClearSessionError(data) {
    console.error('[CHAT] Clear session error:', data);
    
    // Remove pending message if exists
    const pendingDiv = document.querySelector('#clear-session-pending');
    if (pendingDiv) {
      pendingDiv.remove();
    }
    
    // Show error message in chat
    const chatContainer = document.querySelector('#chat-messages');
    if (chatContainer) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'message message-system error';
      
      const header = document.createElement('div');
      header.className = 'message-header';
      header.textContent = 'System';
      
      const content = document.createElement('div');
      content.className = 'message-content';
      content.textContent = data.error || 'Failed to clear session';
      content.style.color = '#ff6b6b';
      
      errorDiv.appendChild(header);
      errorDiv.appendChild(content);
      chatContainer.appendChild(errorDiv);
      scrollToBottom();
    }
  }

})();
