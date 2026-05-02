/**
 * Request and response types for the chat internal API.
 */

/**
 * Request body for saving a chat message.
 */
export interface SaveMessageRequest {
  sessionId: string;
  chatThreadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Response for successful message save.
 */
export interface SaveMessageResponse {
  success: boolean;
  timestamp: string;
}

/**
 * Chat message in history.
 */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  chatThreadId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Get chat history response.
 */
export interface GetChatHistoryResponse {
  messages: ChatMessage[];
}
