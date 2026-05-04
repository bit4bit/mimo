import type { FC } from "hono/jsx";
import type { BufferProps } from "./types.js";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface ChatBufferProps extends BufferProps {
  chatHistory?: ChatMessage[];
}

export const ChatBuffer: FC<ChatBufferProps> = ({ chatHistory = [] }) => {
  return (
    <>
      <div class="buffer-content" id="chat-messages">
        {chatHistory.length === 0 ? (
          <div class="no-messages chat-empty-state text-muted">
            <p>No messages yet.</p>
            <p class="text-small chat-empty-hint">
              Start chatting with the agent
            </p>
          </div>
        ) : (
          chatHistory.map((msg, i) => (
            <div key={i} class={`message message-${msg.role}`}>
              <div class="message-header">
                <span>{msg.role === "user" ? "You" : "Agent"}</span>
                {msg.role === "assistant" && msg.metadata?.duration && (
                  <span class="chat-message-meta">
                    {String(msg.metadata.duration)} ·{" "}
                    {new Date(msg.timestamp).toLocaleString()}
                  </span>
                )}
              </div>
              <div class="message-content">{msg.content}</div>
            </div>
          ))
        )}
      </div>
      <div id="chat-usage" class="chat-usage hidden"></div>
    </>
  );
};
