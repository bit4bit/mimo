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
import type { SessionKeybindingsConfig, GlobalKeybindingsConfig } from "../config/service.js";
import { FileFinderDialog } from "./FileFinderDialog.js";

interface Project {
  id: string;
  name: string;
}

interface Session {
  id: string;
  name: string;
  branch?: string;
  status: "active" | "paused" | "closed";
  upstreamPath: string;
  agentWorkspacePath: string;
  assignedAgentId?: string;
  syncState?: "idle" | "syncing" | "error";
  lastSyncAt?: string;
  lastSyncError?: string;
  createdAt: Date;
  lastActivityAt: string | null;
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
  cloneWorkspaceCommand?: string;
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
  sessionKeybindings?: SessionKeybindingsConfig;
  globalKeybindings?: GlobalKeybindingsConfig;
  agentWorkspacePath?: string;
  chatFileExtensions?: string[];
  canDelete?: boolean;
}

function toEmacsNotation(binding: string): string {
  const modMap: Record<string, string> = {
    mod: "C",
    ctrl: "C",
    control: "C",
    meta: "M",
    cmd: "M",
    command: "M",
    alt: "M",
    option: "M",
    shift: "S",
  };
  const keyMap: Record<string, string> = {
    arrowright: "<right>",
    arrowleft: "<left>",
    arrowup: "<up>",
    arrowdown: "<down>",
    pagedown: "<next>",
    pageup: "<prior>",
    escape: "ESC",
    esc: "ESC",
    enter: "RET",
    return: "RET",
    backspace: "DEL",
    delete: "<del>",
    tab: "TAB",
    space: "SPC",
  };

  const parts = binding.split("+").map((p) => p.trim());
  const modifiers: string[] = [];
  let key = "";

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (modMap[lower] !== undefined) {
      modifiers.push(modMap[lower]);
    } else {
      const mapped = keyMap[lower];
      if (mapped) {
        key = mapped;
      } else if (part.length === 1) {
        key = part.toLowerCase();
      } else {
        key = part;
      }
    }
  }

  const order = ["C", "M", "S"];
  modifiers.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  return [...modifiers, key].join("-");
}

export const SessionDetailPage: FC<SessionDetailProps> = ({
  project,
  session,
  chatHistory,
  agent,
  modelState,
  modeState,
  fossilUrl,
  cloneWorkspaceCommand,
  acpStatus = "active",
  frameState,
  notesContent = "",
  projectId = "",
  projectNotesContent = "",
  mcpServers = [],
  streamingTimeoutMs,
  chatThreads = [],
  activeChatThreadId,
  sessionKeybindings,
  globalKeybindings,
  agentWorkspacePath = "",
  chatFileExtensions,
  canDelete = true,
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
      sessionKeybindings={sessionKeybindings}
      globalKeybindings={globalKeybindings}
      chatFileExtensions={chatFileExtensions}
      projectId={project.id}
      projectName={project.name}
      sessionName={session.name}
      sessionBranch={session.branch}
      fossilUrl={fossilUrl}
      agentId={agent?.id}
      agentName={agent?.name}
      cloneWorkspaceHtml={
        cloneWorkspaceCommand ? (
          <button
            type="button"
            id="clone-workspace-btn"
            class="btn-secondary clone-workspace-btn"
          >
            Clone Workspace
          </button>
        ) : undefined
      }
      backUrl={`/projects/${project.id}/sessions`}
    >
      <div class="session-container">
        <div
          class={`buffers-container ${frameState.rightFrame.isCollapsed ? "right-frame-collapsed" : ""}`}
        >
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
              edit: {
                agentWorkspacePath,
              },
            }}
          />

          <Frame
            frameId="right"
            sessionId={session.id}
            buffers={rightBuffers}
            activeBufferId={frameState.rightFrame.activeBufferId}
            tabBarActions={
              <button
                type="button"
                id="right-frame-toggle-btn"
                class="frame-tab-action"
                title="Collapse right frame"
                aria-label="Collapse right frame"
                aria-expanded={
                  frameState.rightFrame.isCollapsed ? "false" : "true"
                }
                data-collapsed={
                  frameState.rightFrame.isCollapsed ? "true" : "false"
                }
              >
                &lt;&lt;
              </button>
            }
            bufferProps={{
              notes: {
                initialContent: notesContent,
                projectId,
                projectNotesContent,
              },
              "mcp-servers": { servers: mcpServers },
            }}
          />

          <button
            type="button"
            id="right-frame-restore-btn"
            class="right-frame-restore-handle"
            title="Restore right frame"
            aria-label="Restore right frame"
            aria-expanded={frameState.rightFrame.isCollapsed ? "false" : "true"}
          >
            &lt;&lt;
          </button>
        </div>

        <div style="padding: 15px; border-top: 1px solid #444; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; gap: 10px;">
            <button type="button" id="commit-btn" class="btn-primary">
              Commit
            </button>
            <button type="button" id="sync-now-btn" class="btn-secondary">
              Sync Now
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
          <div style="display: flex; gap: 8px;">
            {session.status !== "closed" && (
              <form
                method="POST"
                action={`/projects/${project.id}/sessions/${session.id}/close`}
                style="display: inline;"
                onsubmit={`return confirm('Close session "${session.name}"? It will become read-only.')`}
              >
                <button type="submit" class="btn-secondary">
                  Close Session
                </button>
              </form>
            )}
            {canDelete && (
              <form
                method="POST"
                action={`/projects/${project.id}/sessions/${session.id}/delete`}
                style="display: inline;"
              >
                <button type="submit" class="btn-danger">
                  Delete Session
                </button>
              </form>
            )}
          </div>
        </div>

        <div
          id="session-shortcuts-bar"
          class="session-shortcuts-bar"
          aria-label="Session keyboard shortcuts"
        >
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(sessionKeybindings?.newThread || "Mod+Shift+N")}
            </span>
            <span class="session-shortcut-desc">New thread</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.nextThread || "Mod+Shift+ArrowRight",
              )}
            </span>
            <span class="session-shortcut-desc">Next thread</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.previousThread || "Mod+Shift+ArrowLeft",
              )}
            </span>
            <span class="session-shortcut-desc">Prev thread</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(sessionKeybindings?.commit || "Mod+Shift+M")}
            </span>
            <span class="session-shortcut-desc">Commit</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.projectNotes || "Mod+Shift+,",
              )}
            </span>
            <span class="session-shortcut-desc">Proj notes</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.sessionNotes || "Mod+Shift+.",
              )}
            </span>
            <span class="session-shortcut-desc">Sess notes</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.shortcutsHelp || "Mod+Shift+/",
              )}
            </span>
            <span class="session-shortcut-desc">Help</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.openFileFinder || "Mod+Shift+F",
              )}
            </span>
            <span class="session-shortcut-desc">Open file</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.nextFile || "Mod+Alt+ArrowRight",
              )}
            </span>
            <span class="session-shortcut-desc">Next file</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.previousFile || "Mod+Alt+ArrowLeft",
              )}
            </span>
            <span class="session-shortcut-desc">Prev file</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(sessionKeybindings?.closeFile || "Alt+Shift+W")}
            </span>
            <span class="session-shortcut-desc">Close file</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.nextLeftBuffer || "Alt+Shift+PageDown",
              )}
            </span>
            <span class="session-shortcut-desc">Next buf</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.previousLeftBuffer || "Alt+Shift+PageUp",
              )}
            </span>
            <span class="session-shortcut-desc">Prev buf</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.toggleRightFrame || "Alt+Shift+Control+F",
              )}
            </span>
            <span class="session-shortcut-desc">Toggle right</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.approvePatch || "Control+Enter",
              )}
            </span>
            <span class="session-shortcut-desc">Approve patch</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.declinePatch || "Alt+Shift+G",
              )}
            </span>
            <span class="session-shortcut-desc">Decline patch</span>
          </span>
          <span class="session-shortcut-item expert-mode-shortcut">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.toggleExpertMode || "Alt+Shift+E",
              )}
            </span>
            <span class="session-shortcut-desc">Expert mode</span>
          </span>
          <span class="session-shortcut-item expert-mode-shortcut">
            <span class="session-shortcut-key">
              {toEmacsNotation(sessionKeybindings?.expertInput || "Enter")}
            </span>
            <span class="session-shortcut-desc">Expert input</span>
          </span>
          <span class="session-shortcut-item expert-mode-shortcut">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.moveFocusUp || "Alt+ArrowUp",
              )}
            </span>
            <span class="session-shortcut-desc">Focus up</span>
          </span>
          <span class="session-shortcut-item expert-mode-shortcut">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.moveFocusDown || "Alt+ArrowDown",
              )}
            </span>
            <span class="session-shortcut-desc">Focus down</span>
          </span>
          <span class="session-shortcut-item expert-mode-shortcut">
            <span class="session-shortcut-key">
              {toEmacsNotation(sessionKeybindings?.centerFocus || "Alt+Enter")}
            </span>
            <span class="session-shortcut-desc">Center focus</span>
          </span>
          <span class="session-shortcut-item expert-mode-shortcut">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.increaseFocus || "Alt+Shift+ArrowRight",
              )}
            </span>
            <span class="session-shortcut-desc">Focus+</span>
          </span>
          <span class="session-shortcut-item expert-mode-shortcut">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.decreaseFocus || "Alt+Shift+ArrowLeft",
              )}
            </span>
            <span class="session-shortcut-desc">Focus-</span>
          </span>
          <span class="session-shortcut-separator">|</span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                globalKeybindings?.newThread || "Control+Shift+N",
              )}
            </span>
            <span class="session-shortcut-desc">New thread (G)</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                globalKeybindings?.nextThread || "Control+Shift+ArrowRight",
              )}
            </span>
            <span class="session-shortcut-desc">Next thread (G)</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                globalKeybindings?.previousThread ||
                  "Control+Shift+ArrowLeft",
              )}
            </span>
            <span class="session-shortcut-desc">Prev thread (G)</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                globalKeybindings?.openFileFinder || "Control+Shift+F",
              )}
            </span>
            <span class="session-shortcut-desc">Open file (G)</span>
          </span>
        </div>
      </div>

      {/* File Finder Dialog */}
      <FileFinderDialog sessionId={session.id} />

      {/* Commit dialog */}
      <div id="commit-dialog" class="modal" style="display: none;">
        <div class="modal-content commit-modal">
          <h3 style="margin: 0 0 15px 0; font-size: 16px;">Commit Changes</h3>
          <div class="commit-preview-container">
            <div class="commit-status-filters">
              <label class="status-filter">
                <input type="checkbox" id="filter-added" checked />
                <span class="status-badge status-added">Added</span>
                <span class="status-count">
                  (<span id="count-added">0</span>)
                </span>
              </label>
              <label class="status-filter">
                <input type="checkbox" id="filter-modified" checked />
                <span class="status-badge status-modified">Modified</span>
                <span class="status-count">
                  (<span id="count-modified">0</span>)
                </span>
              </label>
              <label class="status-filter">
                <input type="checkbox" id="filter-deleted" />
                <span class="status-badge status-deleted">Deleted</span>
                <span class="status-count">
                  (<span id="count-deleted">0</span>)
                </span>
              </label>
              <span style="margin-left: auto; font-size: 12px; color: #888;">
                <span id="selected-count">0</span> /{" "}
                <span id="total-count">0</span> selected
              </span>
            </div>
            <div id="commit-tree" class="commit-tree" tabindex="-1">
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
            <button type="button" id="commit-cancel" class="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              id="commit-confirm"
              class="btn-primary"
              disabled
            >
              Commit &amp; Push
            </button>
          </div>
        </div>
      </div>

      {/* Clone workspace command dialog */}
      {cloneWorkspaceCommand && (
        <div id="clone-workspace-dialog" class="modal" style="display: none;">
          <div class="modal-content clone-workspace-modal">
            <h3 style="margin: 0 0 10px 0; font-size: 16px;">
              Clone Workspace Command
            </h3>
            <p style="margin: 0 0 12px 0; color: #888; font-size: 12px;">
              Click the command to copy it.
            </p>
            <pre
              id="clone-workspace-command"
              class="clone-workspace-command"
              data-command={cloneWorkspaceCommand}
              title="Click to copy"
            >
              {cloneWorkspaceCommand}
            </pre>
            <div class="clone-workspace-actions">
              <span id="clone-workspace-copy-status" aria-live="polite"></span>
              <button
                type="button"
                id="clone-workspace-close"
                class="btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inject session closed flag for JS */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.MIMO_SESSION_CLOSED = ${session.status === "closed" ? "true" : "false"};`,
        }}
      />

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
          padding: 10px 16px;
          border-bottom: 1px solid #444;
          background: #252525;
        }
        .session-header-main {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          min-width: 0;
        }
        .session-back-link-bar {
          color: #9ecbff;
          font-size: 16px;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          align-self: stretch;
          width: 28px;
          border-right: 1px solid #3a3a3a;
          margin-right: 10px;
          line-height: 1;
        }
        .session-back-link-bar:hover {
          background: #2e2e2e;
          color: #cfe5ff;
        }
        .session-header-bar h1 {
          margin: 0;
          font-size: 18px;
        }
        .session-header-bar .btn-primary,
        .session-header-bar .btn-secondary {
          padding: 5px 10px;
          font-size: 11px;
        }
        .clone-workspace-btn {
          margin-left: 8px;
          padding: 3px 8px !important;
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
        .buffers-container.right-frame-collapsed .frame-left {
          flex: 1;
          border-right: none;
        }
        .buffers-container.right-frame-collapsed .frame-right {
          display: none;
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
        .frame-tab-bar-actions {
          margin-left: auto;
          display: flex;
          align-items: center;
          padding-right: 6px;
        }
        .frame-tab-action {
          border: 1px solid #454545;
          background: #232323;
          color: #bdbdbd;
          border-radius: 3px;
          cursor: pointer;
          font-family: monospace;
          font-size: 11px;
          padding: 2px 7px;
          line-height: 1;
        }
        .frame-tab-action:hover {
          background: #303030;
          color: #dcdcdc;
        }
        .right-frame-restore-handle {
          display: none;
          border: none;
          border-left: 1px solid #444;
          background: #252525;
          color: #bdbdbd;
          width: 24px;
          cursor: pointer;
          font-family: monospace;
          font-size: 12px;
        }
        .right-frame-restore-handle:hover {
          background: #2f2f2f;
          color: #dcdcdc;
        }
        .buffers-container.right-frame-collapsed .right-frame-restore-handle {
          display: block;
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
          display: flex;
          align-items: center;
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
        .editable-bubble {
          position: sticky;
          bottom: -10px;
          z-index: 2;
          margin-bottom: 0;
          border-top: 1px solid #3b3b3b;
          box-shadow: 0 -8px 18px rgba(0, 0, 0, 0.45);
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
        .chat-file-ref {
          background: transparent;
          border: 1px solid #4f667f;
          border-radius: 3px;
          color: #9ecbff;
          cursor: pointer;
          font: inherit;
          line-height: inherit;
          margin: 0;
          padding: 0 4px;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .chat-file-ref:hover {
          background: #263242;
          color: #cfe5ff;
          border-color: #6d8cae;
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
        .session-shortcuts-bar {
          display: flex;
          gap: 6px;
          align-items: center;
          padding: 7px 10px;
          border-top: 1px solid #393939;
          background: #202020;
          overflow-x: auto;
          white-space: nowrap;
          scrollbar-width: thin;
        }
        .session-shortcuts-bar.is-pulsing {
          border-top-color: #74c0fc;
          box-shadow: inset 0 1px 0 #74c0fc;
        }
        .session-shortcut-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #3a3a3a;
          border-radius: 999px;
          background: #272727;
          padding: 3px 8px;
          flex: 0 0 auto;
        }
        .session-shortcut-key {
          color: #74c0fc;
          font-size: 10.5px;
          font-weight: bold;
        }
        .session-shortcut-desc {
          color: #bdbdbd;
          font-size: 10.5px;
        }
        @media (max-width: 768px) {
          .session-shortcuts-bar {
            padding: 7px;
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
        .tree-children {
          margin-left: 20px;
        }
        .file-status {
          font-family: monospace;
          font-size: 12px;
          font-weight: bold;
          min-width: 12px;
          text-align: center;
        }
        .file-status--added {
          color: #51cf66;
        }
        .file-status--modified {
          color: #74c0fc;
        }
        .file-status--deleted {
          color: #ff6b6b;
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
        #edit-buffer-content .hljs {
          background: transparent;
          padding: 0;
        }
        #edit-buffer-content:focus {
          outline: none;
        }
        .clone-workspace-modal {
          max-width: 760px;
          width: 92%;
        }
        .clone-workspace-command {
          margin: 0;
          padding: 12px;
          background: #1b1b1b;
          border: 1px solid #444;
          border-radius: 4px;
          color: #d4d4d4;
          font-family: monospace;
          font-size: 12px;
          white-space: pre-wrap;
          word-break: break-all;
          cursor: pointer;
        }
        .clone-workspace-command:hover {
          border-color: #666;
        }
        .clone-workspace-actions {
          margin-top: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        #clone-workspace-copy-status {
          font-size: 12px;
          color: #888;
        }
      `}</style>
    </Layout>
  );
};
