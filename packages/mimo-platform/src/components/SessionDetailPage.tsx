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
  upstreamPath: string;
  checkoutPath: string;
  assignedAgentId?: string;
  createdAt: Date;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

interface Agent {
  id: string;
  status: "online" | "offline";
  startedAt: Date;
  lastActivityAt?: Date;
}

interface FileChange {
  path: string;
  status: "clean" | "modified" | "new" | "deleted" | "conflict";
}

interface SessionDetailProps {
  project: Project;
  session: Session;
  chatHistory: ChatMessage[];
  agent?: Agent;
  changes?: FileChange[];
  hasConflicts?: boolean;
}

function renderFileTree(changes: FileChange[]) {
  const fileTree: Map<string, { name: string; status: FileChange["status"] }[]> = new Map();
  
  for (const change of changes) {
    const parts = change.path.split("/");
    const fileName = parts.pop() || "";
    const dir = parts.length > 0 ? parts.join("/") : "(root)";
    
    if (!fileTree.has(dir)) {
      fileTree.set(dir, []);
    }
    fileTree.get(dir)!.push({ name: fileName, status: change.status });
  }
  
  const sortedDirs = Array.from(fileTree.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  return (
    <div class="file-tree">
      {sortedDirs.map(([dir, files]) => (
        <div key={dir} class="file-tree-dir">
          <div class="file-tree-dir-name">{dir}/</div>
          <div class="file-tree-files">
            {files.map((file) => (
              <div key={file.name} class="file-tree-file">
                <span class={`file-indicator file-indicator-${file.status}`}>
                  {file.status === "modified" && "[M]"}
                  {file.status === "new" && "[?]"}
                  {file.status === "deleted" && "[D]"}
                  {file.status === "conflict" && "[!]"}
                  {file.status === "clean" && "   "}
                </span>
                <span class={`file-name file-name-${file.status}`}>{file.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function getStatusIcon(status: FileChange["status"]): string {
  switch (status) {
    case "modified": return "M";
    case "new": return "?";
    case "deleted": return "D";
    case "conflict": return "!";
    default: return " ";
  }
}

export const SessionDetailPage: FC<SessionDetailProps> = ({
  project,
  session,
  chatHistory,
  agent,
  changes = [],
  hasConflicts = false,
}) => {
  return (
    <Layout title={`${session.name} - ${project.name}`} showStatusLine={true} sessionId={session.id}>
      <div class="session-container">
        <div class="session-header-bar">
          <div>
            <h1>{session.name}</h1>
            <span style="color: #888; font-size: 12px;">
              Project: {project.name} | Status: {session.status}
              {agent && (
                <span class={`agent-status agent-status-${agent.status}`}>
                  | Agent: {agent.id.slice(0, 8)}... ({agent.status === "online" ? "🟢" : "🔴"} {agent.status})
                </span>
              )}
              {!agent && (
                <span style="color: #666;">| No agent assigned</span>
              )}
            </span>
          </div>
          <div style="display: flex; gap: 10px;">
            {agent && (
              <a href={`/agents/${agent.id}`} class="btn-secondary">Agent Details</a>
            )}
            {!agent && (
              <a href="/agents/new" class="btn-primary">Create Agent</a>
            )}
            <a href={`/projects/${project.id}/sessions`} class="btn-secondary">
              Back to Sessions
            </a>
          </div>
        </div>

        <div class="buffers-container">
          <div class="buffer buffer-left">
            <div class="buffer-header">Files</div>
            <div class="buffer-content">
              <div id="file-tree">
                <p style="color: #888; padding: 10px;">Loading files...</p>
              </div>
            </div>
          </div>

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
            <div class="chat-input" id="chat-form">
              <form>
                <input
                  type="text"
                  id="chat-input"
                  name="message"
                  placeholder="Type a message..."
                  autocomplete="off"
                />
                <button type="submit">Send</button>
                <span class="chat-connection-status" title="Connection status"></span>
              </form>
            </div>
          </div>

          <div class="buffer buffer-right">
            <div class="buffer-header">
              Changes
              {hasConflicts && <span class="conflict-badge">Conflicts Detected!</span>}
            </div>
            <div class="buffer-content">
              {changes.length === 0 ? (
                <div style="padding: 10px; color: #888;">
                  <p>No changes detected</p>
                  <p style="font-size: 12px; margin-top: 10px;">
                    Modified files will appear here
                  </p>
                </div>
              ) : (
                <div class="changes-list">
                  {changes.map((change) => (
                    <div key={change.path} class={`change-item change-${change.status}`}>
                      <span class="change-indicator">[{getStatusIcon(change.status)}]</span>
                      <span class="change-path">{change.path}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style="padding: 15px; border-top: 1px solid #444; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; gap: 10px;">
            <button type="button" id="commit-btn" class="btn-primary">
              Commit
            </button>
            <a href="/config" class="btn-secondary">Settings</a>
          </div>
          <span id="commit-status" style="color: #888; font-size: 12px;"></span>
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

      <div id="commit-dialog" class="modal" style="display: none;">
        <div class="modal-content">
          <h3>Commit Changes</h3>
          <textarea 
            id="commit-message" 
            placeholder="Enter commit message..."
            rows="3"
            style="width: 100%; margin: 10px 0; padding: 8px; background: #2d2d2d; border: 1px solid #444; color: #d4d4d4; font-family: monospace;"
          ></textarea>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" id="commit-cancel" class="btn-secondary">Cancel</button>
            <button type="button" id="commit-confirm" class="btn-primary">Commit & Push</button>
          </div>
          <div id="commit-error" style="color: #ff6b6b; margin-top: 10px; font-size: 12px;"></div>
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
        .agent-status-online {
          background: #0b3d0b;
          color: #51cf66;
        }
        .agent-status-offline {
          background: #3d0b0b;
          color: #ff6b6b;
        }
        .btn-primary, .btn-secondary, .btn-danger {
          padding: 6px 12px;
          border: none;
          cursor: pointer;
          font-family: monospace;
          font-size: 12px;
          text-decoration: none;
          border-radius: 3px;
        }
        .btn-primary {
          background: #74c0fc;
          color: #1a1a1a;
        }
        .btn-secondary {
          background: #3d3d3d;
          color: #d4d4d4;
        }
        .btn-danger {
          background: #ff6b6b;
          color: #1a1a1a;
        }
        .changes-list {
          padding: 10px;
        }
        .change-item {
          padding: 4px 0;
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: monospace;
          font-size: 12px;
        }
        .change-indicator {
          width: 20px;
          text-align: center;
        }
        .change-modified .change-indicator { color: #ffd43b; }
        .change-new .change-indicator { color: #74c0fc; }
        .change-deleted .change-indicator { color: #ff6b6b; }
        .change-conflict .change-indicator { color: #ff8585; background: #3d0b0b; }
        .change-path {
          color: #d4d4d4;
        }
        .conflict-badge {
          margin-left: 10px;
          padding: 2px 6px;
          background: #ff6b6b;
          color: #1a1a1a;
          font-size: 10px;
          text-transform: uppercase;
          border-radius: 3px;
        }
        .file-tree {
          padding: 10px;
        }
        .file-tree-dir {
          margin-bottom: 10px;
        }
        .file-tree-dir-name {
          color: #888;
          font-size: 11px;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .file-tree-files {
          margin-left: 10px;
        }
        .file-tree-file {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: monospace;
          font-size: 12px;
          padding: 2px 0;
        }
        .file-indicator {
          width: 24px;
          text-align: center;
          font-family: monospace;
        }
        .file-indicator-modified { color: #ffd43b; }
        .file-indicator-new { color: #74c0fc; }
        .file-indicator-deleted { color: #ff6b6b; }
        .file-indicator-conflict { color: #ff8585; background: #3d0b0b; }
        .file-name-modified { color: #ffd43b; }
        .file-name-new { color: #74c0fc; }
        .file-name-deleted { color: #ff6b6b; }
        .file-name-conflict { color: #ff8585; }
        .modal {
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
        }
        .modal-content {
          background: #2d2d2d;
          border: 1px solid #444;
          padding: 20px;
          width: 90%;
          max-width: 500px;
          border-radius: 4px;
        }
        .modal-content h3 {
          margin: 0 0 15px 0;
        }
      `}</style>
    </Layout>
  );
};