// MIMO Chat System - WebSocket client for real-time chat
(function() {
  'use strict';

// Chat WebSocket connection
let chatSocket = null;
let currentSessionId = null;
let currentThoughtElement = null;
let currentThoughtContent = null;
let currentMessageElement = null;
let currentMessageContent = null;
let pendingUserMessages = new Set(); // Track messages waiting for server echo

  // Initialize chat for a session
  function initChat(sessionId) {
    if (!sessionId) {
      console.error('No session ID provided');
      return;
    }

    currentSessionId = sessionId;
    connectWebSocket(sessionId);
    
    // Set up chat input handler
    setupChatInput();
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
      case 'thought_start':
        startThoughtSection();
        break;
        
      case 'thought_chunk':
        appendThoughtChunk(data.content);
        break;
        
      case 'thought_end':
        endThoughtSection();
        break;
        
      case 'message_chunk':
        appendMessageChunk(data.content);
        break;
        
      case 'usage_update':
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
        showError(data.message);
        break;
        
      case 'history':
        loadChatHistory(data.messages);
        break;

      case 'session_initialized':
        // Initialize model and mode selectors
        console.log('[INIT] session_initialized received:', data);
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
    }
  }

  // Set up chat input form
  function setupChatInput() {
    const chatForm = document.querySelector('#chat-form');
    const chatInput = document.querySelector('#chat-input');
    
    if (!chatForm || !chatInput) return;
    
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const message = chatInput.value.trim();
      if (!message) return;
      
      // Add user message immediately for better UX
      addMessageToChat({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      });
      
      // Track this message to prevent duplicate when server echoes it
      pendingUserMessages.add(message);
      
      // Clear input
      chatInput.value = '';
      
      // Send via WebSocket if connected
      if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({
          type: 'send_message',
          content: message,
        }));
      } else {
        // Fallback to HTTP
        sendMessageHttp(message);
      }
    });
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
    header.textContent = message.role === 'user' ? 'You' : 
                         message.role === 'assistant' ? 'Agent' : 'System';
    
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

  // Start a thought section inside the current message
  function startThoughtSection() {
    const chatContainer = document.querySelector('#chat-messages');
    if (!chatContainer) return;
    
    // Wait for message element to exist
    if (!currentMessageElement) {
      // Message hasn't started yet, create it first
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message message-assistant streaming';
      
      const header = document.createElement('div');
      header.className = 'message-header';
      header.textContent = 'Agent';
      
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
    thoughtHeader.innerHTML = '<span class="thought-toggle">▶</span> Thought Process';
    thoughtHeader.style.cursor = 'pointer';
    thoughtHeader.style.fontSize = '0.9em';
    thoughtHeader.style.padding = '4px 8px';
    
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
    // Just clear the reference, the thought section stays in the message
    currentThoughtElement = null;
    currentThoughtContent = null;
  }

  // Append a chunk to the assistant message
  function appendMessageChunk(text) {
    if (!currentMessageElement) return; // Message should already exist from thought_start
    
    // Find or create a container for the response text (after thought section)
    let responseContent = currentMessageElement.querySelector('.message-response');
    if (!responseContent) {
      responseContent = document.createElement('div');
      responseContent.className = 'message-response';
      currentMessageElement.querySelector('.message-content')?.appendChild(responseContent);
    }
    
    responseContent.textContent += text;
    scrollToBottom();
  }

  // End the message stream
  function endMessageStream() {
    if (!currentMessageElement) return;
    
    const indicator = currentMessageElement.querySelector('.streaming-indicator');
    if (indicator) {
      indicator.remove();
    }
    
    currentMessageElement.classList.remove('streaming');
    currentMessageElement = null;
    currentMessageContent = null;
    currentThoughtElement = null;
    currentThoughtContent = null;
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

  // Show connection status
  function showConnectionStatus(status) {
    const statusEl = document.querySelector('.chat-connection-status');
    if (!statusEl) return;
    
    statusEl.className = `chat-connection-status ${status}`;
    statusEl.textContent = status === 'connected' ? '●' : '○';
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
    
    // Clear existing messages
    chatContainer.innerHTML = '';
    
    // Track current thought and message for grouping
    let currentThoughtText = '';
    let currentMessageText = '';
    let inThought = false;
    let inMessage = false;
    
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
      addMessageToChat(msg);
    });
    
    // Add any pending thought
    if (inThought && currentThoughtText) {
      addThoughtToChat(chatContainer, currentThoughtText);
    }
    
    // Add any pending message
    if (inMessage && currentMessageText) {
      addMessageToChat({
        role: 'assistant',
        content: currentMessageText,
      });
    }
    
    scrollToBottom();
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
})();
