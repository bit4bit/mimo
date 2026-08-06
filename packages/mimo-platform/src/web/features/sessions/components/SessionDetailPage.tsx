// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import { Layout } from "../../../shared/components/Layout.js";
import { Frame } from "../../../shared/components/Frame.js";
import {
  ensureDefaultBuffersRegistered,
  getBuffersForFrame,
} from "./buffers/index.js";
import type { FrameState } from "../../../../domain/sessions/frame-state.js";
import type { McpServer } from "../../../../domain/mcp-servers/types.js";
import type { ChatThread } from "../../../../domain/sessions/repository.js";
import type {
  SessionKeybindingsConfig,
  GlobalKeybindingsConfig,
} from "../../../../domain/config/service.js";
import { FileFinderDialog } from "../../../shared/components/FileFinderDialog.js";
import { ContentFinderDialog } from "../../../shared/components/ContentFinderDialog.js";

interface Project {
  id: string;
  name: string;
  color?: string;
  iconGlyph?: string;
  sourceBranch?: string;
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
  closeReason?: string;
  instructions?: string;
  browserNotificationsEnabled?: boolean;
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
  cloneUrl?: string;
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
  backUrl?: string;
  /** When true, the page is rendered inside a same-origin iframe on `/pinned`.
   *  Suppresses top-nav, footer actions bar, shortcuts bar, pin checkbox, and
   *  the pinned-sessions side-menu button. Also defaults the right frame to
   *  collapsed when no explicit frame-state preference is persisted. */
  embed?: boolean;
  /** Whether this session is currently in the user's pin store. */
  isPinned?: boolean;
  /** The list of group labels this session is currently pinned in. */
  pinGroups?: string[];
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
  cloneUrl,
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
  backUrl,
  embed = false,
  isPinned = false,
  pinGroups = [],
}) => {
  ensureDefaultBuffersRegistered();
  const leftBuffers = getBuffersForFrame("left");
  // In embed mode, the right frame is filtered to the buffers that are
  // useful at narrow iframe widths: Files, Impact, and Notes. Summary, MCP,
  // and Plan are hidden in embed mode (they're either redundant at ~288px or
  // rarely needed side-by-side). Non-embed pages keep the full set.
  const embedRightBufferAllowList = ["file-tree", "impact", "notes"];
  const rightBuffers = embed
    ? getBuffersForFrame("right").filter((b) =>
        embedRightBufferAllowList.includes(b.id),
      )
    : getBuffersForFrame("right");

  // In embed mode, default the right frame to collapsed when no explicit
  // preference has been persisted. The route handler passes an already-
  // adjusted frameState when embed=1 and no preference exists, so this is
  // a defensive default.
  const effectiveFrameState: FrameState = embed
    ? {
        leftFrame: frameState.leftFrame,
        rightFrame: {
          ...frameState.rightFrame,
          isCollapsed: frameState.rightFrame.isCollapsed,
        },
      }
    : frameState;

  const pinSlot = embed ? null : (
    <span class="pin-slot">
      <input
        type="checkbox"
        id="session-pin-checkbox"
        class="pin-checkbox"
        checked={isPinned}
        data-help-id="session-detail-page-pin-checkbox"
        data-session-id={session.id}
        data-project-id={project.id}
        onchange={
          "document.dispatchEvent(new CustomEvent('mimo:pin-toggle',{detail:{sessionId:this.dataset.sessionId,projectId:this.dataset.projectId,checked:this.checked}}))"
        }
      />
      <label for="session-pin-checkbox" class="pin-checkbox-label">
        pin
      </label>
      <div
        id="pin-groups-root"
        class="pin-groups-root"
        data-help-id="session-detail-page-pin-group-picker"
        data-session-id={session.id}
        data-project-id={project.id}
        data-pin-groups={JSON.stringify(pinGroups)}
      ></div>
      <span id="pin-error-inline" class="pin-error-inline"></span>
    </span>
  );

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
      projectColor={project.color}
      projectIconGlyph={project.iconGlyph}
      sessionName={session.name}
      sessionBranch={session.branch}
      cloneUrl={cloneUrl}
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
      backUrl={backUrl ?? `/projects/${project.id}/sessions`}
      showSessionFinder={true}
      embed={embed}
      pinSlot={pinSlot}
    >
      <script
        dangerouslySetInnerHTML={{
          __html: `window.MIMO_DEFAULT_INSTRUCTIONS = ${JSON.stringify(session.instructions || "")};\nwindow.MIMO_BROWSER_NOTIFICATIONS_ENABLED = ${session.browserNotificationsEnabled ? "true" : "false"};`,
        }}
      />
      <div class="session-container">
        {session.status === "closed" && session.closeReason && (
          <div class="session-closed-banner">
            <strong>Closed:</strong> {session.closeReason}
          </div>
        )}
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
              terminal: {
                terminals: session.terminals ?? [],
                activeTerminalId:
                  (session.terminals ?? []).find((t: any) => t.state === "active")?.id ?? "",
              },
              edit: {
                agentWorkspacePath,
              },
              review: {
                baseBranch: project.repositories?.[0]?.sourceBranch,
                headBranch: session.branch,
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
              summary: {
                threads: chatThreads,
              },
            }}
          />

          <button
            type="button"
            id="right-frame-restore-btn"
            class="right-frame-restore-handle"
            title="Restore right frame"
            aria-label="Restore right frame"
            aria-expanded={frameState.rightFrame.isCollapsed ? "false" : "true"}
            data-help-id="session-detail-page-right-frame-restore-btn-button"
          >
            &lt;&lt;
          </button>
        </div>

        {!embed && (
          <div class="session-footer-bar">
            <div class="session-footer-actions">
            <a
              href={`/projects/${project.id}/sessions/${session.id}/settings`}
              class="btn-secondary"
              data-help-id="session-detail-page-a"
            >
              Settings
            </a>
          </div>
          <div class="session-footer-secondary-actions">
            {session.status !== "closed" && (
              <a
                href={`/projects/${project.id}/sessions/${session.id}/close`}
                class="btn-secondary link-no-underline"
                data-help-id="session-detail-page-button"
              >
                Close Session
              </a>
            )}
            {canDelete && (
              <form
                method="POST"
                action={`/projects/${project.id}/sessions/${session.id}/delete`}
                class="inline-form"
              >
                <button
                  type="submit"
                  class="btn-danger"
                  data-help-id="session-detail-page-button"
                  onclick="return confirm('Delete this session? This cannot be undone.')"
                >
                  Delete Session
                </button>
              </form>
            )}
          </div>
        </div>
        )}

        {!embed && (
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
              {toEmacsNotation("Alt+Shift+C")}
            </span>
            <span class="session-shortcut-desc">Find content</span>
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
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.nextChange || "Alt+Shift+ArrowDown",
              )}
            </span>
            <span class="session-shortcut-desc">Next change</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                sessionKeybindings?.previousChange || "Alt+Shift+ArrowUp",
              )}
            </span>
            <span class="session-shortcut-desc">Prev change</span>
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
                globalKeybindings?.previousThread || "Control+Shift+ArrowLeft",
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
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">
              {toEmacsNotation(
                globalKeybindings?.openSessionFinder || "Control+Shift+3",
              )}
            </span>
            <span class="session-shortcut-desc">Find session (G)</span>
          </span>
          <span class="session-shortcut-item">
            <span class="session-shortcut-key">Alt+Shift+G</span>
            <span class="session-shortcut-desc">Close finder</span>
          </span>
        </div>
        )}
      </div>

      {/* File Finder Dialog */}
      <FileFinderDialog sessionId={session.id} />

      {/* Content Finder Dialog */}
      <ContentFinderDialog sessionId={session.id} />

      {/* Clone workspace command dialog */}
      {cloneWorkspaceCommand && (
        <div id="clone-workspace-dialog" class="modal hidden">
          <div class="modal-content clone-workspace-modal">
            <h3 class="modal-title mb-10">Clone Workspace Command</h3>
            <p class="clone-workspace-help">
              The purpose of this copy is to let you check changes locally.
              Changes made locally are not reflected in mimo-platform. If any
              changes are required, please use mimo-platform to make them.
            </p>
            <p class="clone-workspace-help">
              Copy and paste this command into your terminal to clone the
              repository. Later, you can resync changes by running 'fossil
              update'.
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
                data-help-id="session-detail-page-clone-workspace-close-button"
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
        .session-closed-banner {
          background: #5a2d2d;
          color: #ff6b6b;
          padding: 8px 16px;
          font-size: 13px;
          border-bottom: 1px solid #444;
        }
        .session-footer-bar {
          padding: 15px;
          border-top: 1px solid #444;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .session-footer-actions { display: flex; gap: 10px; }
        .session-footer-status {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }
        .session-footer-secondary-actions { display: flex; gap: 8px; }
        .modal-title { margin: 0; font-size: 16px; }
        .mb-15 { margin-bottom: 15px; }
        .mb-10 { margin-bottom: 10px; }
        .status-counter-pill { margin-left: auto; font-size: 12px; color: #888; }
        .clone-workspace-help { margin: 0 0 12px 0; color: #888; font-size: 12px; }
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
        .frame-buffer-panel.hidden {
          display: none;
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
        .permission-card {
          margin: 10px 0;
          padding: 12px;
          background: #252525;
          border: 1px solid #444;
          border-radius: 6px;
        }
        .permission-card__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-weight: 500;
        }
        .permission-kind {
          font-size: 11px;
          color: #888;
          text-transform: uppercase;
        }
        .permission-locations {
          margin: 8px 0;
          padding-left: 16px;
          font-size: 12px;
          color: #aaa;
        }
        .permission-card__actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }
        .permission-btn {
          padding: 6px 14px;
          border: 1px solid #555;
          border-radius: 4px;
          background: #2d2d2d;
          color: #ddd;
          cursor: pointer;
          font-size: 13px;
          transition: background-color 0.15s, border-color 0.15s;
        }
        .permission-btn:hover {
          background: #3d3d3d;
          border-color: #666;
        }
        .permission-btn:focus {
          outline: 2px solid #4dabf7;
          outline-offset: 2px;
        }
        .permission-btn--approve {
          border-color: #2b8a3e;
          color: #69db7c;
        }
        .permission-btn--approve:hover {
          background: #2b4a2e;
          border-color: #40c057;
        }
        .permission-btn--reject {
          border-color: #c92a2a;
          color: #ff6b6b;
        }
        .permission-btn--reject:hover {
          background: #4a2020;
          border-color: #ff6b6b;
        }
        .permission-card--auto-allowed {
          border-color: #7928ca;
          opacity: 0.75;
        }
        .permission-kind--auto-allowed {
          background: #7928ca;
          color: #e599f7;
          border: 1px solid #9c36b5;
        }
        .view-toggle-btn {
          background: none;
          border: 1px solid #555;
          color: #888;
          font-size: 11px;
          padding: 1px 6px;
          border-radius: 3px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .view-toggle-btn:hover {
          color: #d4d4d4;
          border-color: #888;
        }
        .view-toggle-btn.active {
          color: #bbb;
          border-color: #777;
        }
        .decorated-bold {
          font-weight: bold;
        }
        .decorated-italic {
          font-style: italic;
        }
        .decorated-code {
          font-family: monospace;
          background: #383838;
          padding: 1px 4px;
          border-radius: 3px;
        }
        .decorated-fence {
          background: #1e1e1e;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 8px;
          margin: 4px 0;
          font-family: monospace;
          white-space: pre;
          overflow-x: auto;
        }
        .decorated-link {
          color: #74c0fc;
          text-decoration: underline;
          cursor: pointer;
        }
        .decorated-heading {
          font-weight: bold;
          margin: 0.5em 0 0.25em;
          line-height: 1.3;
        }
        .decorated-heading-1 {
          font-size: 1.5em;
        }
        .decorated-heading-2 {
          font-size: 1.3em;
        }
        .decorated-heading-3 {
          font-size: 1.15em;
        }
        .decorated-heading-4 {
          font-size: 1.05em;
        }
        .decorated-heading-5 {
          font-size: 1em;
        }
        /* Markdown view mode: marked-rendered HTML inside message content */
        .message-content table {
          border-collapse: collapse;
          margin: 4px 0;
          font-size: 0.95em;
        }
        .message-content th,
        .message-content td {
          border: 1px solid #444;
          padding: 4px 8px;
          text-align: left;
        }
        .message-content th {
          background: #2d2d2d;
          font-weight: bold;
        }
        .message-content ul,
        .message-content ol {
          margin: 4px 0;
          padding-left: 1.5em;
        }
        .message-content li {
          margin: 2px 0;
        }
        .message-content blockquote {
          margin: 4px 0;
          padding: 0 0 0 10px;
          border-left: 3px solid #4f667f;
          color: #b5b5b5;
        }
        .message-content h1,
        .message-content h2,
        .message-content h3,
        .message-content h4,
        .message-content h5,
        .message-content h6 {
          font-weight: bold;
          margin: 0.5em 0 0.25em;
          line-height: 1.3;
        }
        .message-content h1 {
          font-size: 1.5em;
        }
        .message-content h2 {
          font-size: 1.3em;
        }
        .message-content h3 {
          font-size: 1.15em;
        }
        .message-content pre {
          background: #1e1e1e;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 8px;
          margin: 4px 0;
          overflow-x: auto;
        }
        .message-content pre code {
          background: transparent;
          padding: 0;
        }
        .message-content code {
          font-family: monospace;
          background: #383838;
          padding: 1px 4px;
          border-radius: 3px;
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
          user-select: text;
          -webkit-user-select: text;
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
        .modal.hidden {
          display: none;
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
        
        /* Commit Buffer Styles (replaces former commit modal) */
        .commit-buffer {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .commit-buffer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #252525;
          border-bottom: 1px solid #444;
          font-size: 13px;
          color: #fff;
          flex-shrink: 0;
        }
        .commit-buffer-title {
          font-weight: bold;
        }
        .commit-buffer-status-row {
          display: flex;
          gap: 12px;
          padding: 6px 12px;
          border-top: 1px solid #444;
          flex-shrink: 0;
        }
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
        .file-diff-body-wrap {
          display: flex;
          align-items: stretch;
        }
        .file-diff-body {
          flex: 1;
          overflow: auto;
          max-height: 360px;
          min-width: 0;
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

        /* Review Buffer Styles */
        .review-buffer {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .review-buffer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #252525;
          border-bottom: 1px solid #444;
          font-size: 13px;
          color: #fff;
          flex-shrink: 0;
        }
        .review-buffer-title {
          font-weight: bold;
        }
        .review-buffer-actions {
          display: flex;
          gap: 6px;
        }
        .review-refresh-btn {
          cursor: pointer;
        }
        .review-summary {
          display: flex;
          gap: 14px;
          padding: 6px 12px;
          background: #1f1f1f;
          border-bottom: 1px solid #333;
          font-size: 12px;
          color: #ccc;
          flex-shrink: 0;
        }
        .review-summary-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .review-compare {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          background: #1b1b1b;
          border-bottom: 1px solid #333;
          color: #9ecbff;
          font-family: monospace;
          font-size: 11px;
          flex-shrink: 0;
        }
        .review-compare-label {
          color: #888;
        }
        .review-compare-ref {
          color: #d4d4d4;
        }
        .review-compare-arrow {
          color: #74c0fc;
        }
        .review-split {
          display: flex;
          flex: 1;
          min-height: 0;
        }
        .review-tree-pane {
          flex: 0 0 260px;
          min-width: 180px;
          max-width: 320px;
          overflow-y: auto;
          border-right: 1px solid #333;
          padding: 6px 4px;
          font-size: 13px;
        }
        .review-tree-pane .tree-children {
          margin-left: 1ch;
        }
        .review-tree-pane .tree-node--file > .tree-node-row {
          padding-left: 1ch;
        }
        .review-tree-pane .tree-node-row {
          gap: 2px;
          padding: 1px 0;
        }
        .review-tree-pane .tree-toggle {
          width: 8px;
          height: 14px;
        }
        .review-tree-pane .tree-toggle--spacer {
          width: 0;
        }
        .review-tree-pane .file-status {
          min-width: 8px;
        }
        .review-diff-pane {
          flex: 1;
          overflow-y: auto;
          padding: 6px 8px;
          background: #1a1a1a;
        }
        .review-empty-state,
        .review-diff-empty {
          color: #888;
          font-size: 13px;
          padding: 12px;
        }
        .review-diff-empty {
          text-align: center;
          padding-top: 40px;
        }
        .review-buffer .diff-overview-track {
          position: fixed;
          right: 6px;
          width: 6px;
          cursor: pointer;
        }
      `}</style>
      {!embed && <script src="/js/pin-checkbox.js" defer></script>}
    </Layout>
  );
};
