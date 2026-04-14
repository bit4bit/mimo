import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import { Frame } from "./Frame.js";
import { ensureDefaultBuffersRegistered, getBuffersForFrame } from "../buffers/index.js";
import type { FrameState } from "../sessions/frame-state.js";

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
  acpStatus?: "active" | "parked";
  frameState: FrameState;
  notesContent?: string;
  streamingTimeoutMs?: number;
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
  streamingTimeoutMs,
}) => {
  ensureDefaultBuffersRegistered();
  const leftBuffers = getBuffersForFrame("left");
  const rightBuffers = getBuffersForFrame("right");

  return (
    <Layout title={`${session.name} - ${project.name}`} showStatusLine={true} sessionId={session.id} streamingTimeoutMs={streamingTimeoutMs}>
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
              )} | Status: {session.status}
              {agent && ` | Agent: ${agent.name}`} | 
              <span id="subtitle-acp-status" class={`acp-status acp-status--${acpStatus}`}>
                {acpStatus === 'active' && '🟢 Agent ready'}
                {acpStatus === 'parked' && '💤 Agent sleeping'}
                {acpStatus === 'waking' && '⏳ Waking agent...'}
              </span>
            </span>
          </div>
          <div style="display: flex; gap: 10px; align-items: center;">
            {/* Model Selector - always visible with placeholder */}
            <div 
              id="model-selector-container" 
              class="selector-container" 
              style={modelState ? "opacity: 1;" : "opacity: 0.5;"}
              title={modelState ? modelState.currentModelId : "Waiting for ACP server to provide model options..."}
            >
              <label class="selector-label">Model:</label>
              <select
                id="model-selector"
                class="selector-dropdown"
                disabled={!modelState}
              >
                {modelState ? (
                  modelState.availableModels.map((model) => (
                    <option value={model.value} selected={model.value === modelState.currentModelId}>
                      {model.name}
                    </option>
                  ))
                ) : (
                  <option>Not configured</option>
                )}
              </select>
            </div>

            {/* Mode Selector - always visible with placeholder */}
            <div 
              id="mode-selector-container" 
              class="selector-container"
              style={modeState ? "opacity: 1;" : "opacity: 0.5;"}
              title={modeState ? modeState.currentModeId : "Waiting for ACP server to provide mode options..."}
            >
              <label class="selector-label">Mode:</label>
              <select
                id="mode-selector"
                class="selector-dropdown"
                disabled={!modeState}
              >
                {modeState ? (
                  modeState.availableModes.map((mode) => (
                    <option value={mode.value} selected={mode.value === modeState.currentModeId}>
                      {mode.name}
                    </option>
                  ))
                ) : (
                  <option>Not configured</option>
                )}
              </select>
            </div>

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
          <Frame
            frameId="left"
            sessionId={session.id}
            buffers={leftBuffers}
            activeBufferId={frameState.leftFrame.activeBufferId}
            bufferProps={{
              chat: { chatHistory },
              notes: { initialContent: notesContent },
            }}
          />

          <Frame
            frameId="right"
            sessionId={session.id}
            buffers={rightBuffers}
            activeBufferId={frameState.rightFrame.activeBufferId}
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
            <button type="button" id="clear-session-btn" class="btn-secondary" title="Clear agent context while preserving history">
              Clear
            </button>
            <a href={`/projects/${project.id}/sessions/${session.id}/settings`} class="btn-secondary">Settings</a>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
            <span id="sync-status" style="color: #888; font-size: 12px;">
              Sync: {session.syncState || "idle"}
            </span>
            <span id="commit-status" style="color: #888; font-size: 12px;"></span>
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

      <div id="commit-dialog" class="modal" style="display: none;">
        <div class="modal-content commit-modal">
          <h3>Commit Changes</h3>
          
          <div class="commit-preview-container">
            <div class="commit-status-filters">
              <label class="status-filter">
                <input type="checkbox" id="filter-added" checked />
                <span class="status-badge status-added">Added</span>
                <span id="count-added" class="status-count">0</span>
              </label>
              <label class="status-filter">
                <input type="checkbox" id="filter-modified" checked />
                <span class="status-badge status-modified">Modified</span>
                <span id="count-modified" class="status-count">0</span>
              </label>
              <label class="status-filter">
                <input type="checkbox" id="filter-deleted" checked />
                <span class="status-badge status-deleted">Deleted</span>
                <span id="count-deleted" class="status-count">0</span>
              </label>
            </div>
            
            <div id="commit-tree" class="commit-tree">
              <div class="commit-empty-state">Loading changes...</div>
            </div>
          </div>
          
          <div class="commit-message-section">
            <div class="commit-file-count">
              <span id="selected-count">0</span> of <span id="total-count">0</span> files selected
            </div>
            <textarea 
              id="commit-message" 
              placeholder="Enter commit message..."
              rows="3"
            ></textarea>
            <div id="commit-error" class="commit-error"></div>
          </div>
          
          <div class="commit-actions">
            <button type="button" id="commit-cancel" class="btn-secondary">Cancel</button>
            <button type="button" id="commit-confirm" class="btn-primary" disabled>Commit & Push</button>
          </div>
        </div>
      </div>



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
        /* Editable YOU bubble styles */
        .editable-bubble .message-content[contenteditable] {
          cursor: text;
          outline: none;
          min-height: 1.4em;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .editable-bubble .message-content[contenteditable]:empty::before {
          content: attr(data-placeholder);
          color: #555;
          pointer-events: none;
        }
        .editable-bubble-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #888;
          margin-bottom: 5px;
          text-transform: uppercase;
        }
        .editable-bubble-status {
          font-size: 10px;
        }
        .editable-send-btn {
          background: none;
          border: 1px solid #555;
          color: #888;
          font-family: monospace;
          font-size: 11px;
          padding: 1px 6px;
          border-radius: 3px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .editable-send-btn:hover {
          color: #d4d4d4;
          border-color: #888;
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
          max-width: 700px !important;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
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
          min-height: 150px;
          max-height: 350px;
        }
        .commit-empty-state {
          color: #888;
          text-align: center;
          padding: 40px;
          font-style: italic;
        }
        .tree-node {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 0;
          font-size: 13px;
        }
        .tree-node--directory {
          cursor: pointer;
        }
        .tree-node--file {
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
        .tree-node--directory > .tree-checkbox {
          opacity: 0.7;
        }
        .tree-node--directory > .tree-checkbox:checked {
          opacity: 1;
        }
        .tree-node--directory > .tree-checkbox:indeterminate {
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
          margin: 8px 0 8px 36px;
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
