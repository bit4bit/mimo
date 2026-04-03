import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface Project {
  id: string;
  name: string;
}

interface Session {
  id: string;
  name: string;
  status: "active" | "paused" | "closed";
  worktreePath: string;
  createdAt: Date;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

interface Agent {
  id: string;
  status: "starting" | "connected" | "failed" | "killed" | "died";
  pid?: number;
  startedAt: Date;
}

interface SessionDetailProps {
  project: Project;
  session: Session;
  chatHistory: ChatMessage[];
  activeAgent?: Agent;
}

export const SessionDetailPage: FC<SessionDetailProps> = ({
  project,
  session,
  chatHistory,
  activeAgent,
}) => {
  return (
    <Layout title={`${session.name} - ${project.name}`}>
      <div class="session-container">
        {/* Header */}
        <div class="session-header-bar">
          <div>
            <h1>{session.name}</h1>
            <span style="color: #888; font-size: 12px;">
              Project: {project.name} | Status: {session.status}
              {activeAgent && (
                <span class={`agent-status agent-status-${activeAgent.status}`}>
                  | Agent: {activeAgent.status}
                  {activeAgent.pid && ` (PID: ${activeAgent.pid})`}
                </span>
              )}
            </span>
          </div>
          <div style="display: flex; gap: 10px;">
            {activeAgent && (
              <form method="POST" action={`/agents/${activeAgent.id}/kill`}>
                <button type="submit" class="btn-danger">Kill Agent</button>
              </form>
            )}
            {!activeAgent && (
              <form method="POST" action={`/sessions/${session.id}/agent`}>
                <button type="submit" class="btn-primary">Start Agent</button>
              </form>
            )}
            <a href={`/sessions?projectId=${project.id}`} class="btn-secondary">
              Back to Sessions
            </a>
          </div>
        </div>

        {/* Three Buffer Layout */}
        <div class="buffers-container">
          {/* Left Buffer - Files */}
          <div class="buffer buffer-left">
            <div class="buffer-header">Files</div>
            <div class="buffer-content">
              <div id="file-tree">
                <p style="color: #888; padding: 10px;">Loading files...</p>
              </div>
            </div>
          </div>

          {/* Center Buffer - Chat */}
          <div class="buffer buffer-center">
            <div class="buffer-header">Chat</div>
            <div class="buffer-content" id="chat-messages">
              {chatHistory.length === 0 ? (
                <div style="padding: 20px; color: #888; text-align: center;">
                  <p>No messages yet.</p>
                  <p style="font-size: 12px; margin-top: 10px;">
                    Start chatting with the agent
                  </p>
                </div>
              ) : (
                chatHistory.map((msg, i) => (
                  <div key={i} class={`message message-${msg.role}`}>
                    <div class="message-header">
                      {msg.role === "user" ? "You" : "Agent"}
                    </div>
                    <div class="message-content">{msg.content}</div>
                  </div>
                ))
              )}
            </div>
            <div class="chat-input">
              <form method="POST" action={`/projects/${project.id}/sessions/${session.id}/chat`}>
                <input
                  type="text"
                  name="message"
                  placeholder="Type a message..."
                  autocomplete="off"
                />
                <button type="submit">Send</button>
              </form>
            </div>
          </div>

          {/* Right Buffer - Changes */}
          <div class="buffer buffer-right">
            <div class="buffer-header">Changes</div>
            <div class="buffer-content">
              <div style="padding: 10px; color: #888;">
                <p>No changes detected</p>
                <p style="font-size: 12px; margin-top: 10px;">
                  Modified files will appear here
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style="padding: 15px; border-top: 1px solid #444;">
          <form
            method="POST"
            action={`/projects/${project.id}/sessions/${session.id}/delete`}
            style="display: inline;"
          >
            <button type="submit" class="btn-danger">
              Delete Session
            </button>
          </form>
        </div>
      </div>

      <style>{`
        .session-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
        }
        .session-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 20px;
          border-bottom: 1px solid #444;
          background: #252525;
        }
        .session-header-bar h1 {
          margin: 0;
          font-size: 18px;
        }
        .buffers-container {
          display: flex;
          flex: 1;
          overflow: hidden;
        }
        .buffer {
          flex: 1;
          display: flex;
          flex-direction: column;
          border-right: 1px solid #444;
          overflow: hidden;
        }
        .buffer:last-child {
          border-right: none;
        }
        .buffer-header {
          padding: 10px 15px;
          background: #2d2d2d;
          border-bottom: 1px solid #444;
          font-size: 12px;
          text-transform: uppercase;
          color: #888;
        }
        .buffer-content {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
        }
        .buffer-center {
          flex: 2;
        }
        .chat-input {
          padding: 10px;
          border-top: 1px solid #444;
        }
        .chat-input form {
          display: flex;
          gap: 10px;
        }
        .chat-input input {
          flex: 1;
          background: #2d2d2d;
          border: 1px solid #444;
          color: #d4d4d4;
          padding: 8px;
          font-family: monospace;
        }
        .message {
          margin-bottom: 15px;
          padding: 10px;
          background: #2d2d2d;
          border-radius: 4px;
        }
        .message-user {
          border-left: 3px solid #74c0fc;
        }
        .message-assistant {
          border-left: 3px solid #51cf66;
        }
        .message-header {
          font-size: 11px;
          color: #888;
          margin-bottom: 5px;
          text-transform: uppercase;
        }
        .message-content {
          white-space: pre-wrap;
          word-break: break-word;
        }
        .agent-status {
          margin-left: 10px;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          text-transform: uppercase;
        }
        .agent-status-starting {
          background: #665c00;
          color: #ffd43b;
        }
        .agent-status-connected {
          background: #0b3d0b;
          color: #51cf66;
        }
        .agent-status-failed, .agent-status-died {
          background: #3d0b0b;
          color: #ff6b6b;
        }
        .agent-status-killed {
          background: #3d3d3d;
          color: #888;
        }
      `}</style>
    </Layout>
  );
};
