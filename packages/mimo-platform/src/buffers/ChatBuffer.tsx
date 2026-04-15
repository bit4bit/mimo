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
          <div
            class="no-messages"
            style="padding: 20px; color: #888; text-align: center;"
          >
            <p>No messages yet.</p>
            <p style="font-size: 12px; margin-top: 10px;">
              Start chatting with the agent
            </p>
          </div>
        ) : (
          chatHistory.map((msg, i) => (
            <div key={i} class={`message message-${msg.role}`}>
              <div class="message-header">
                <span>{msg.role === "user" ? "You" : "Agent"}</span>
                {msg.role === "assistant" && msg.metadata?.duration && (
                  <span style="font-size: 0.75em; color: #888; margin-left: 8px;">
                    {String(msg.metadata.duration)} · {new Date(msg.timestamp).toLocaleString()}
                  </span>
                )}
              </div>
              <div class="message-content">{msg.content}</div>
            </div>
          ))
        )}
      </div>
      <div
        id="chat-usage"
        class="chat-usage"
        style="display: none; font-size: 0.75em; color: #666; padding: 4px 10px; text-align: right; border-top: 1px solid #333;"
      ></div>
    </>
  );
};
