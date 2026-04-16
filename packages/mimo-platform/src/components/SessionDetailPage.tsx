import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import { Frame } from "./Frame.js";
import {
  ensureDefaultBuffersRegistered,
  getBuffersForFrame,
} from "../buffers/index.js";
import type { FrameState } from "../sessions/frame-state.js";
import type { McpServer } from "../mcp-servers/types.js";
import type { ChatThread } from "../sessions/repository.js";

interface Project {
  id: string;
  name: string;
}

interface Session {
  id: string;
  name: string;
  status: "active" | "paused" | "closed";
  upstreamPath: string;
  agentWorkspacePath: string;
  assignedAgentId?: string;
  syncState?: "idle" | "syncing" | "error";
  lastSyncAt?: string;
  lastSyncError?: string;
  createdAt: Date;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

interface Agent {
  id: string;
  name: string;
  status: "online" | "offline";
  startedAt: Date;
  lastActivityAt?: Date;
}

// Model and Mode selector types
interface ModelState {
  currentModelId: string;
  availableModels: Array<{ value: string; name: string; description?: string }>;
  optionId: string;
}

interface ModeState {
  currentModeId: string;
  availableModes: Array<{ value: string; name: string; description?: string }>;
  optionId: string;
}

interface SessionDetailProps {
  project: Project;
  session: Session;
  chatHistory: ChatMessage[];
  agent?: Agent;
  modelState?: ModelState;
  modeState?: ModeState;
  fossilUrl?: string;
  acpStatus?: "active" | "parked" | "waking";
  frameState: FrameState;
  notesContent?: string;
  projectId?: string;
  projectNotesContent?: string;
  mcpServers?: McpServer[];
  streamingTimeoutMs?: number;
  // Chat threads data
  chatThreads?: ChatThread[];
  activeChatThreadId?: string | null;
}

export const SessionDetailPage: FC<SessionDetailProps> = ({
  project,
  session,
  chatHistory,
  agent,
  modelState,
  modeState,
  fossilUrl,
  acpStatus = "active",
  frameState,
  notesContent = "",
  projectId = "",
  projectNotesContent = "",
  mcpServers = [],
  streamingTimeoutMs,
  chatThreads = [],
  activeChatThreadId,
}) => {
  ensureDefaultBuffersRegistered();
  const leftBuffers = getBuffersForFrame("left");
  const rightBuffers = getBuffersForFrame("right");

  return (
    <Layout
      title={`${session.name} - ${project.name}`}
      showStatusLine={true}
      sessionId={session.id}
      streamingTimeoutMs={streamingTimeoutMs}
    >
      <div class="session-container">
        <div class="session-header-bar">
          <div>
            <h1>{session.name}</h1>
            <span style="color: #888; font-size: 12px;">
              Project: {project.name}
              {fossilUrl && (
                <a
                  href={`${fossilUrl}timeline`}
                  target="_blank"
                  class="fossil-icon-link"
                  title="View Fossil Repository"
                >
                  🌿
                </a>
              )}{" "}
              | Status: {session.status}
              {agent && ` | Agent: ${agent.name}`} |
              <span
                id="subtitle-acp-status"
                class={`acp-status acp-status--${acpStatus}`}
              >
                {acpStatus === "active" && "🟢 Agent ready"}
                {acpStatus === "parked" && "💤 Agent sleeping"}
                {acpStatus === "waking" && "⏳ Waking agent..."}
              </span>
            </span>
          </div>
          <div style="display: flex; gap: 10px; align-items: center;">
            {agent && (
              <a href={`/agents/${agent.id}`} class="btn-secondary">
                Agent Details
              </a>
            )}
            {!agent && (
              <a href="/agents/new" class="btn-primary">
                Create Agent
              </a>
            )}
            <a href={`/projects/${project.id}/sessions`} class="btn-secondary">
              Back to Sessions
            </a>
          </div>
        </div>

        <div class="buffers-container">
          <Frame
            frameId="left"
            sessionId={session.id}
            buffers={leftBuffers}
            activeBufferId={frameState.leftFrame.activeBufferId}
            bufferProps={{
              chat: {
                chatHistory,
                chatThreads,
                activeChatThreadId,
                modelState,
                modeState,
              },
            }}
          />

          <Frame
            frameId="right"
            sessionId={session.id}
            buffers={rightBuffers}
            activeBufferId={frameState.rightFrame.activeBufferId}
            bufferProps={{
              notes: {
                initialContent: notesContent,
                projectId,
                projectNotesContent,
              },
              "mcp-servers": { servers: mcpServers },
            }}
          />
        </div>

        <div style="padding: 15px; border-top: 1px solid #444; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; gap: 10px;">
            <button type="button" id="commit-btn" class="btn-primary">
              Commit
            </button>
            <button type="button" id="sync-now-btn" class="btn-secondary">
              Sync Now
            </button>
            <button
              type="button"
              id="session-shortcuts-help-btn"
              class="btn-secondary"
              title="Keyboard shortcuts (Mod+Shift+/)"
            >
              Shortcuts
            </button>
            <a
              href={`/projects/${project.id}/sessions/${session.id}/settings`}
              class="btn-secondary"
            >
              Settings
            </a>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <span id="sync-status" style="color: #888; font-size: 12px;">
              Sync: {session.syncState || "idle"}
            </span>
            <span
              id="commit-status"
              style="color: #888; font-size: 12px;"
            ></span>
          </div>
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

      {/* Commit dialog */}
      <div id="commit-dialog" class="modal" style="display: none;">
        <div class="modal-content commit-modal">
          <h3 style="margin: 0 0 15px 0; font-size: 16px;">Commit Changes</h3>
          <div class="commit-preview-container">
            <div class="commit-status-filters">
              <label class="status-filter">
                <input type="checkbox" id="filter-added" checked />
                <span class="status-badge status-added">Added</span>
                <span class="status-count">(<span id="count-added">0</span>)</span>
              </label>
              <label class="status-filter">
                <input type="checkbox" id="filter-modified" checked />
                <span class="status-badge status-modified">Modified</span>
                <span class="status-count">(<span id="count-modified">0</span>)</span>
              </label>
              <label class="status-filter">
                <input type="checkbox" id="filter-deleted" />
                <span class="status-badge status-deleted">Deleted</span>
                <span class="status-count">(<span id="count-deleted">0</span>)</span>
              </label>
              <span style="margin-left: auto; font-size: 12px; color: #888;">
                <span id="selected-count">0</span> / <span id="total-count">0</span> selected
              </span>
            </div>
            <div id="commit-tree" class="commit-tree">
              <div class="commit-empty-state">Loading changes...</div>
            </div>
          </div>
          <div class="commit-message-section">
            <textarea
              id="commit-message"
              rows={3}
              placeholder="Enter commit message..."
              minlength="1"
            ></textarea>
            <div id="commit-error" class="commit-error"></div>
          </div>
          <div class="commit-actions">
            <button type="button" id="commit-cancel" class="btn-secondary">Cancel</button>
            <button type="button" id="commit-confirm" class="btn-primary" disabled>Commit &amp; Push</button>
          </div>
        </div>
      </div>

      <div id="session-shortcuts-hint" class="session-shortcuts-hint" style="display: none;"></div>

      <div id="session-shortcuts-help" class="modal" style="display: none;" aria-hidden="true">
        <div class="modal-content shortcuts-modal" role="dialog" aria-label="Keyboard shortcuts">
          <h3 style="margin: 0 0 12px 0; font-size: 16px;">Session Keyboard Shortcuts</h3>
          <div class="shortcuts-grid">
            <div class="shortcut-row"><span class="shortcut-key">Mod+Shift+N</span><span class="shortcut-desc">Create new thread</span></div>
            <div class="shortcut-row"><span class="shortcut-key">Mod+Shift+ArrowRight</span><span class="shortcut-desc">Next thread</span></div>
            <div class="shortcut-row"><span class="shortcut-key">Mod+Shift+ArrowLeft</span><span class="shortcut-desc">Previous thread</span></div>
            <div class="shortcut-row"><span class="shortcut-key">Mod+Shift+M</span><span class="shortcut-desc">Open commit dialog</span></div>
            <div class="shortcut-row"><span class="shortcut-key">Mod+Shift+,</span><span class="shortcut-desc">Focus Project Notes</span></div>
            <div class="shortcut-row"><span class="shortcut-key">Mod+Shift+.</span><span class="shortcut-desc">Focus Session Notes</span></div>
            <div class="shortcut-row"><span class="shortcut-key">Mod+Shift+/</span><span class="shortcut-desc">Toggle shortcuts help</span></div>
          </div>
          <div class="commit-actions" style="margin-top: 16px;">
            <button type="button" id="session-shortcuts-close" class="btn-secondary">Close</button>
          </div>
        </div>
      </div>

      {/* Inject thread data for JS */}
      {chatThreads.length > 0 && (
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.MIMO_CHAT_THREADS_DATA = ${JSON.stringify({
                threads: chatThreads,
                activeChatThreadId,
              })};
              window.MIMO_CHAT_MODELS = ${JSON.stringify(modelState?.availableModels || [])};
              window.MIMO_CHAT_MODES = ${JSON.stringify(modeState?.availableModes || [])};
            `,
          }}
        />
      )}

      <style>{`
        .session-container {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
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
        .frame {
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
          border-right: 1px solid #444;
        }
        .frame:last-child {
          border-right: none;
        }
        .frame-left {
          flex: 2;
        }
        .frame-right {
          display: flex;
          flex: 1;
          flex-direction: column;
        }
        .frame-tab-bar {
          display: flex;
          align-items: center;
          background: #2d2d2d;
          border-bottom: 1px solid #444;
        }
        .frame-tab {
          border: none;
          border-right: 1px solid #444;
          background: transparent;
          color: #888;
          padding: 10px 14px;
          cursor: pointer;
          font-family: monospace;
          font-size: 12px;
        }
        .frame-tab:hover {
          background: #353535;
          color: #d4d4d4;
        }
        .frame-tab.active {
          background: #1a1a1a;
          color: #d4d4d4;
          border-bottom: 2px solid #74c0fc;
        }
        .frame-content {
          flex: 1;
          display: flex;
          min-height: 0;
          overflow: hidden;
        }
        .frame-buffer-panel {
          flex: 1;
          min-height: 0;
          width: 100%;
          display: flex;
          flex-direction: column;
        }
        .frame-empty {
          padding: 14px;
          color: #888;
          font-size: 12px;
        }
        .buffer {
          display: flex;
          flex-direction: column;
          min-height: 0;
          height: 100%;
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
          overflow: hidden;
        }
        .buffer-content {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
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
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: #888;
          margin-bottom: 5px;
          text-transform: uppercase;
        }
        .editable-bubble-header {
          justify-content: flex-start;
          gap: 6px;
        }
        .editable-bubble-status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          font-size: 11px;
        }
        .editable-send-btn {
          margin-left: auto;
          background: none;
          border: 1px solid #777;
          color: #aaa;
          font-family: monospace;
          font-size: 11px;
          line-height: 1.2;
          padding: 1px 8px;
          border-radius: 3px;
          cursor: pointer;
        }
        .editable-send-btn:hover {
          color: #d4d4d4;
          border-color: #888;
        }
        .copy-btn {
          background: none;
          border: 1px solid #555;
          color: #888;
          font-size: 11px;
          padding: 1px 6px;
          border-radius: 3px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .copy-btn:hover {
          color: #d4d4d4;
          border-color: #888;
        }
        .message-content {
          white-space: pre-wrap;
          word-break: break-word;
        }
        /* Chat threads styles */
        .chat-threads-container {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .chat-threads-tabs {
          display: flex;
          background: #2d2d2d;
          border-bottom: 1px solid #444;
          overflow-x: auto;
        }
        .chat-thread-tab {
          padding: 8px 16px;
          border: none;
          border-right: 1px solid #444;
          background: transparent;
          color: #888;
          cursor: pointer;
          font-family: monospace;
          font-size: 12px;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .chat-thread-tab:hover {
          background: #353535;
          color: #d4d4d4;
        }
        .chat-thread-tab.active {
          background: #1a1a1a;
          color: #d4d4d4;
        }
        .chat-thread-context {
          padding: 8px 12px;
          background: #252525;
          border-bottom: 1px solid #444;
          display: flex;
          gap: 15px;
          align-items: center;
        }
        .chat-messages-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
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
        .fossil-icon-link {
          font-size: 10px;
          margin-left: 4px;
          text-decoration: none;
          opacity: 0.8;
          transition: opacity 0.2s;
        }
        .fossil-icon-link:hover {
          opacity: 1;
        }
        
        /* Commit Modal Styles */
        .commit-modal {
          width: 100%;
          height: 100%;
          max-width: none !important;
          max-height: none;
          display: flex;
          flex-direction: column;
          border-radius: 0;
        }
        .shortcuts-modal {
          max-width: 620px;
        }
        .shortcuts-grid {
          display: grid;
          gap: 8px;
        }
        .shortcut-row {
          display: grid;
          grid-template-columns: 220px 1fr;
          align-items: center;
          gap: 10px;
          border: 1px solid #3a3a3a;
          border-radius: 4px;
          background: #232323;
          padding: 8px 10px;
        }
        .shortcut-key {
          color: #74c0fc;
          font-weight: bold;
          font-size: 12px;
          white-space: nowrap;
        }
        .shortcut-desc {
          color: #d4d4d4;
          font-size: 12px;
        }
        .session-shortcuts-hint {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 1300;
          background: #2b2b2b;
          border: 1px solid #4a4a4a;
          border-radius: 4px;
          color: #d4d4d4;
          font-size: 12px;
          padding: 8px 10px;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
          max-width: 320px;
        }
        @media (max-width: 768px) {
          .shortcut-row {
            grid-template-columns: 1fr;
          }
          .session-shortcuts-hint {
            right: 10px;
            left: 10px;
            max-width: none;
          }
        }
        .commit-preview-container {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          border: 1px solid #444;
          border-radius: 4px;
          margin-bottom: 15px;
        }
        .commit-status-filters {
          display: flex;
          gap: 15px;
          padding: 10px 15px;
          background: #252525;
          border-bottom: 1px solid #444;
          flex-shrink: 0;
        }
        .status-filter {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font-size: 12px;
        }
        .status-filter input[type="checkbox"] {
          cursor: pointer;
        }
        .status-badge {
          padding: 2px 8px;
          border-radius: 3px;
          font-size: 11px;
          font-weight: bold;
        }
        .status-added {
          background: #0b3d0b;
          color: #51cf66;
        }
        .status-modified {
          background: #3d3d0b;
          color: #ffd43b;
        }
        .status-deleted {
          background: #3d0b0b;
          color: #ff6b6b;
        }
        .status-count {
          color: #888;
          font-size: 11px;
        }
        .commit-tree {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
          background: #1a1a1a;
          min-height: 0;
        }
        .commit-empty-state {
          color: #888;
          text-align: center;
          padding: 40px;
          font-style: italic;
        }
        .tree-node {
          display: flex;
          flex-direction: column;
          padding: 2px 0;
          font-size: 13px;
        }
        .tree-node-row {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 2px 0;
        }
        .tree-node--directory > .tree-node-row {
          cursor: pointer;
        }
        .tree-node--file > .tree-node-row {
          padding-left: 20px;
        }
        .tree-toggle {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: #888;
          cursor: pointer;
          user-select: none;
        }
        .tree-checkbox {
          cursor: pointer;
        }
        .tree-node--directory > .tree-node-row > .tree-checkbox {
          opacity: 0.7;
        }
        .tree-node--directory > .tree-node-row > .tree-checkbox:checked {
          opacity: 1;
        }
        .tree-node--directory > .tree-node-row > .tree-checkbox:indeterminate {
          opacity: 1;
        }
        .tree-label {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tree-icon {
          font-size: 14px;
        }
        .tree-icon--folder {
          color: #74c0fc;
        }
        .tree-icon--file {
          color: #888;
        }
        .tree-icon--expanded {
          color: #888;
        }
        .tree-children {
          margin-left: 20px;
        }
        .file-status {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 3px;
          margin-left: auto;
        }
        .file-status--added {
          background: #0b3d0b;
          color: #51cf66;
        }
        .file-status--modified {
          background: #3d3d0b;
          color: #ffd43b;
        }
        .file-status--deleted {
          background: #3d0b0b;
          color: #ff6b6b;
        }
        .file-status--binary {
          background: #3d0b3d;
          color: #da77f2;
        }
        .file-diff {
          margin: 8px 0;
          padding: 10px;
          background: #2d2d2d;
          border: 1px solid #444;
          border-radius: 4px;
          font-family: monospace;
          font-size: 12px;
        }
        .file-diff-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid #444;
        }
        .file-diff-title {
          color: #888;
          font-size: 11px;
        }
        .file-diff-close {
          background: none;
          border: none;
          color: #888;
          cursor: pointer;
          font-size: 14px;
        }
        .diff-hunk {
          margin-bottom: 10px;
        }
        .diff-hunk-header {
          color: #74c0fc;
          font-size: 11px;
          margin-bottom: 4px;
        }
        .diff-line {
          padding: 1px 4px;
          white-space: pre;
          overflow-x: auto;
        }
        .diff-line--added {
          background: #0b3d0b;
          color: #51cf66;
        }
        .diff-line--removed {
          background: #3d0b0b;
          color: #ff6b6b;
        }
        .diff-line--context {
          color: #888;
        }
        .diff-binary {
          color: #888;
          font-style: italic;
          padding: 10px;
        }
        .commit-message-section {
          margin-bottom: 15px;
        }
        .commit-file-count {
          font-size: 12px;
          color: #888;
          margin-bottom: 8px;
        }
        .commit-file-count span {
          color: #d4d4d4;
          font-weight: bold;
        }
        #commit-message {
          width: 100%;
          padding: 8px;
          background: #2d2d2d;
          border: 1px solid #444;
          color: #d4d4d4;
          font-family: monospace;
          border-radius: 4px;
        }
        #commit-message:invalid {
          border-color: #ff6b6b;
        }
        .commit-error {
          color: #ff6b6b;
          font-size: 12px;
          margin-top: 8px;
          min-height: 18px;
        }
        .commit-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          padding-top: 10px;
          border-top: 1px solid #444;
        }
        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </Layout>
  );
};
