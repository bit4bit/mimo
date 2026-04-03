// MIMO Chat System - WebSocket client for real-time chat
(function() {
  'use strict';

  // Chat WebSocket connection
  let chatSocket = null;
  let currentSessionId = null;
  let messageBuffer = '';
  let currentStreamingMessage = null;

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
    switch (data.type) {
      case 'message':
        if (data.streaming) {
          handleStreamingMessage(data);
        } else {
          addMessageToChat(data);
        }
        break;
        
      case 'stream_start':
        startStreamingMessage(data);
        break;
        
      case 'stream_chunk':
        appendStreamingChunk(data);
        break;
        
      case 'stream_end':
        endStreamingMessage(data);
        break;
        
      case 'error':
        showError(data.message);
        break;
        
      case 'history':
        loadChatHistory(data.messages);
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
      
      // Add user message immediately
      addMessageToChat({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      });
      
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
    content.textContent = message.content;
    
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

  // Start a streaming message
  function startStreamingMessage(data) {
    const chatContainer = document.querySelector('#chat-messages');
    if (!chatContainer) return;
    
    // Create streaming message element
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-assistant streaming';
    messageDiv.dataset.streamId = data.streamId;
    
    const header = document.createElement('div');
    header.className = 'message-header';
    header.textContent = 'Agent';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    const indicator = document.createElement('span');
    indicator.className = 'streaming-indicator';
    indicator.textContent = '...';
    
    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    messageDiv.appendChild(indicator);
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
    
    currentStreamingMessage = {
      element: messageDiv,
      content: content,
      buffer: '',
    };
  }

  // Append a chunk to streaming message
  function appendStreamingChunk(data) {
    if (!currentStreamingMessage) return;
    
    currentStreamingMessage.buffer += data.chunk;
    currentStreamingMessage.content.textContent = currentStreamingMessage.buffer;
    scrollToBottom();
  }

  // Handle streaming message updates
  function handleStreamingMessage(data) {
    if (!currentStreamingMessage) {
      // Start new streaming message
      startStreamingMessage({
        streamId: data.id || Date.now().toString(),
      });
    }
    
    appendStreamingChunk({ chunk: data.content });
  }

  // End streaming message
  function endStreamingMessage(data) {
    if (!currentStreamingMessage) return;
    
    // Remove streaming indicator
    const indicator = currentStreamingMessage.element.querySelector('.streaming-indicator');
    if (indicator) {
      indicator.remove();
    }
    
    // Remove streaming class
    currentStreamingMessage.element.classList.remove('streaming');
    
    currentStreamingMessage = null;
  }

  // Load chat history
  function loadChatHistory(messages) {
    const chatContainer = document.querySelector('#chat-messages');
    if (!chatContainer) return;
    
    // Clear existing
    chatContainer.innerHTML = '';
    
    messages.forEach(msg => {
      addMessageToChat(msg);
    });
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
  };

  // Auto-initialize if session ID is available
  document.addEventListener('DOMContentLoaded', () => {
    if (window.MIMO_SESSION_ID) {
      initChat(window.MIMO_SESSION_ID);
    }
  });
})();
