// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import type {
  SessionKeybindingsConfig,
  GlobalKeybindingsConfig,
} from "../../../domain/config/service.js";
import { SessionFinderDialog } from "../../features/sessions/components/SessionFinderDialog.js";
import { PinnedSessionsDrawer } from "../../features/pinned-sessions/components/PinnedSessionsDrawer.js";
import { buildFaviconDataUri, buildDefaultFaviconDataUri } from "../favicons.js";

interface LayoutProps {
  title: string;
  children: any;
  showStatusLine?: boolean;
  sessionId?: string;
  streamingTimeoutMs?: number;
  sessionKeybindings?: SessionKeybindingsConfig;
  globalKeybindings?: GlobalKeybindingsConfig;
  chatFileExtensions?: string[];
  sessionName?: string;
  sessionBranch?: string;
  projectId?: string;
  projectName?: string;
  projectColor?: string;
  projectIconGlyph?: string;
  cloneUrl?: string;
  agentId?: string;
  agentName?: string;
  cloneWorkspaceHtml?: any;
  backUrl?: string;
  showSessionFinder?: boolean;
  /** When true, suppresses top-nav, footer actions, shortcuts bar, pin slot,
   *  and the pinned-sessions side-menu button. Used by the embed-mode
   *  session page rendered inside same-origin iframes on `/pinned`. */
  embed?: boolean;
  /** Optional slot rendered next to the session name/branch in the top-nav.
   *  `SessionDetailPage` uses it to render the pin checkbox. Suppressed when
   *  `embed` is true. */
  pinSlot?: any;
  /** When true (default), render the global pinned-sessions side-menu button.
   *  Suppressed when `embed` is true. */
  showPinnedMenuButton?: boolean;
}

export const Layout: FC<LayoutProps> = ({
  title,
  children,
  showStatusLine = false,
  sessionId,
  streamingTimeoutMs,
  sessionKeybindings,
  globalKeybindings,
  chatFileExtensions,
  sessionName,
  sessionBranch,
  projectId,
  projectName,
  projectColor,
  projectIconGlyph,
  cloneUrl,
  agentId,
  agentName,
  cloneWorkspaceHtml,
  backUrl,
  showSessionFinder = false,
  embed = false,
  pinSlot,
  showPinnedMenuButton = true,
}) => {
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <title>{title} | MIMO</title>
          <link
            rel="icon"
            href={
              projectId && projectName
                ? buildFaviconDataUri({
                    id: projectId,
                    name: projectName,
                    color: projectColor,
                    iconGlyph: projectIconGlyph,
                  })
                : buildDefaultFaviconDataUri()
            }
          />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.MIMO_SESSION_ID = "${sessionId || ""}";\nwindow.MIMO_PROJECT_ID = "${projectId || ""}";\nwindow.MIMO_STREAMING_TIMEOUT_MS = ${streamingTimeoutMs ?? 600000};\nwindow.MIMO_SESSION_KEYBINDINGS = ${JSON.stringify(sessionKeybindings || {})};\nwindow.MIMO_GLOBAL_KEYBINDINGS = ${JSON.stringify(globalKeybindings || {})};\nwindow.MIMO_CHAT_FILE_EXTENSIONS = ${JSON.stringify(chatFileExtensions ?? [])};\nwindow.MIMO_EMBED = ${embed ? "true" : "false"};`,
            }}
          />
          {sessionId && (
            <link
              rel="stylesheet"
              href="/vendor/highlight/atom-one-dark.min.css"
            />
          )}
          {sessionId && (
            <script src="/vendor/highlight/highlight.min.js" defer></script>
          )}
          {sessionId && (
            <script src="/vendor/highlight/elixir.min.js" defer></script>
          )}
          {sessionId && (
            <link rel="stylesheet" href="/vendor/xterm/xterm.css" />
          )}
          {sessionId && (
            <script src="/vendor/xterm/xterm.js" defer></script>
          )}
          {sessionId && (
            <script src="/vendor/xterm/addon-fit.js" defer></script>
          )}
          {sessionId && <script src="/js/diff.js" defer></script>}
          {sessionId && <script src="/js/diff-overview.js" defer></script>}
          {sessionId && <script src="/js/expert-utils.js" defer></script>}
          {sessionId && <script src="/js/patch-buffer.js" defer></script>}
          {sessionId && <script src="/js/chat-token-utils.js" defer></script>}
          {sessionId && (
            <script src="/js/chat-decorated-utils.js" defer></script>
          )}
          {sessionId && <script src="/js/utils.js" defer></script>}
          {sessionId && <script src="/js/chat.js" defer></script>}
          {sessionId && <script src="/js/chat-threads.js" defer></script>}
          {sessionId && <script src="/js/commit-buffer.js" defer></script>}
          {sessionId && <script src="/js/review-buffer.js" defer></script>}
          {sessionId && <script src="/js/session-clone.js" defer></script>}
          {sessionId && <script src="/js/notes.js" defer></script>}
          {sessionId && <script src="/js/file-tree.js" defer></script>}
          {sessionId && <script src="/js/edit-buffer.js" defer></script>}
          {sessionId && <script src="/js/summary-buffer.js" defer></script>}
          {sessionId && <script src="/js/terminal.js" defer></script>}
          {sessionId && (
            <script src="/js/session-keybindings.js" defer></script>
          )}
          <script src="/vendor/marked.min.js" defer></script>
          <script src="/js/help-tooltip.js" defer></script>
          {showSessionFinder && <script src="/js/session-finder.js"></script>}
          <style>{`
           * { margin: 0; padding: 0; box-sizing: border-box; }
           html, body { 
             height: 100%;
             overflow: hidden;
           }
           body { 
             font-family: monospace; 
             background: #1a1a1a; 
             color: #d4d4d4; 
             display: flex;
             flex-direction: column;
           }
           .container { 
             max-width: 400px; 
             margin: 50px auto; 
             padding: 20px; 
           }
           .container-wide { 
             max-width: 100%; 
             padding: 20px; 
           }
          h1 { color: #fff; margin-bottom: 20px; }
          form { display: flex; flex-direction: column; gap: 15px; }
          label { color: #888; font-size: 12px; text-transform: uppercase; }
          input { 
            background: #2d2d2d; 
            border: 1px solid #444; 
            color: #d4d4d4; 
            padding: 10px; 
            font-family: monospace;
          }
          input:focus { outline: none; border-color: #666; }
          button { 
            background: #333; 
            border: 1px solid #555; 
            color: #d4d4d4; 
            padding: 10px; 
            cursor: pointer;
            font-family: monospace;
          }
          button:hover { background: #444; }
          .error { color: #ff6b6b; margin-top: 10px; }
          .success { color: #51cf66; margin-top: 10px; }
          a { color: #74c0fc; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .link { margin-top: 20px; text-align: center; }
          .btn { 
            display: inline-block;
            background: #333; 
            border: 1px solid #555; 
            color: #d4d4d4; 
            padding: 10px 20px; 
            cursor: pointer;
            font-family: monospace;
            text-decoration: none;
            font-size: 14px;
          }
          .btn:hover { background: #444; text-decoration: none; }
          .btn-secondary {
            display: inline-block;
            background: #2d2d2d; 
            border: 1px solid #444; 
            color: #888; 
            padding: 10px 20px; 
            cursor: pointer;
            font-family: monospace;
            text-decoration: none;
            font-size: 14px;
            margin-left: 10px;
          }
          .btn-secondary:hover { background: #333; text-decoration: none; }
          .btn-danger { 
            display: inline-block;
            background: #ff6b6b; 
            border: 1px solid #ff6b6b; 
            color: #1a1a1a; 
            padding: 10px 20px; 
            cursor: pointer;
            font-family: monospace;
            font-size: 14px;
            font-weight: bold;
          }
          .btn-danger:hover { background: #ff8585; }
          .form-group { margin-bottom: 20px; }
          .form-group label { display: block; margin-bottom: 5px; }
          .form-group input, .form-group select { width: 100%; }
          .form-group small { display: block; color: #888; margin-top: 5px; }
          .actions { margin-top: 30px; }
          .project-list { display: flex; flex-direction: column; gap: 15px; }
          .project-card { 
            background: #2d2d2d; 
            border: 1px solid #444; 
            padding: 15px; 
          }
          .project-header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            margin-bottom: 10px;
          }
          .project-name { 
            font-weight: bold; 
            font-size: 16px;
            color: #74c0fc;
          }
          .repo-type { 
            font-size: 12px; 
            text-transform: uppercase; 
            padding: 2px 8px; 
            background: #333; 
            border-radius: 3px;
          }
          .repo-type.git { background: #6c757d; }
          .repo-type.fossil { background: #9b59b6; }
          .project-meta { color: #888; font-size: 12px; }
          .empty-state { text-align: center; padding: 40px; }
          .empty-state p { margin-bottom: 20px; color: #888; }
          .project-details { background: #2d2d2d; border: 1px solid #444; padding: 20px; }
          .detail-row { margin-bottom: 15px; }
           .detail-row label { display: block; color: #888; margin-bottom: 5px; font-size: 12px; text-transform: uppercase; }
           
           .session-list { display: flex; flex-direction: column; gap: 10px; }
           .session-card { 
             background: #2d2d2d; 
             border: 1px solid #444; 
             padding: 12px;
             cursor: pointer;
           }
           .session-card:hover { background: #353535; }
           .session-header { 
             display: flex; 
             justify-content: space-between; 
             align-items: center;
             margin-bottom: 8px;
           }
           .session-name { 
             font-weight: bold; 
             font-size: 14px;
             color: #74c0fc;
             text-decoration: none;
           }
           .session-name:hover { text-decoration: underline; }
           .session-status { 
             font-size: 11px; 
             text-transform: uppercase; 
             padding: 2px 6px; 
             border-radius: 3px;
           }
           .session-status.active { background: #2d5a2d; color: #6bff6b; }
           .session-status.paused { background: #5a5a2d; color: #ffff6b; }
           .session-status.closed { background: #5a2d2d; color: #ff6b6b; }
            .session-meta { color: #888; font-size: 12px; }
            
            /* DataTable Styles */
            .data-table-container { display: flex; flex-direction: column; gap: 12px; }
            .data-table-search { display: flex; }
            .data-table-search-input {
               background: #1a1a1a;
               border: 1px solid #444;
               color: #d4d4d4;
               padding: 8px 12px;
               font-family: monospace;
               font-size: 13px;
               width: 100%;
             }
            .data-table-search-input:focus { outline: none; border-color: #666; }
            .data-table-wrap { overflow-x: auto; }
            .data-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 13px;
            }
            .data-table th,
            .data-table td {
              padding: 10px 12px;
              text-align: left;
              border-bottom: 1px solid #3a3a3a;
            }
            .data-table th {
              background: #252525;
              color: #888;
              font-size: 11px;
              text-transform: uppercase;
              font-weight: bold;
            }
            .data-table tr:hover { background: #2a2a2a; }
            .data-table .session-status,
            .data-table .status-badge {
              font-size: 11px;
              text-transform: uppercase;
              padding: 2px 6px;
              border-radius: 3px;
            }
            .data-table .session-status.active,
            .data-table .status-badge.active { background: #2d5a2d; color: #6bff6b; }
            .data-table .session-status.paused,
            .data-table .status-badge.paused { background: #5a5a2d; color: #ffff6b; }
            .data-table .session-status.closed,
            .data-table .status-badge.closed { background: #5a2d2d; color: #ff6b6b; }
            .data-table .session-status.online,
            .data-table .status-badge.online { background: #0b3d0b; color: #51cf66; }
            .data-table .session-status.offline,
            .data-table .status-badge.offline { background: #3d0b0b; color: #ff6b6b; }
            .data-table .session-time { color: #888; font-size: 12px; white-space: nowrap; }
            .data-table .session-project { color: #888; font-size: 12px; }
            .data-table-paginator {
              display: flex;
              justify-content: center;
              align-items: center;
              gap: 12px;
              padding: 10px 0;
            }
            .data-table-paginator .page-btn {
              background: #2d2d2d;
              border: 1px solid #444;
              color: #d4d4d4;
              padding: 6px 12px;
              font-family: monospace;
              font-size: 12px;
              cursor: pointer;
            }
            .data-table-paginator .page-btn:hover { background: #3d3d3d; }
            .data-table-paginator .page-info { color: #888; font-size: 12px; }
            
            /* Buffer Focus Styles */
           .buffer-focused {
             box-shadow: inset 0 0 0 2px #74c0fc;
           }
           
           /* Status Line Styles */
           .status-line {
             display: flex;
             align-items: center;
             padding: 8px 15px;
             background: #252525;
             border-top: 1px solid #444;
             font-size: 12px;
             color: #888;
           }
           
           .status-line-key {
             color: #d4d4d4;
             font-weight: bold;
           }
           
           .status-line-divider {
             margin: 0 10px;
             color: #555;
           }
           
           /* Modal Styles */
           .mimo-modal {
             position: fixed;
             top: 0;
             left: 0;
             width: 100%;
             height: 100%;
             background: rgba(0, 0, 0, 0.8);
             display: flex;
             align-items: center;
             justify-content: center;
             z-index: 1000;
           }
           
           .mimo-modal-content {
             background: #2d2d2d;
             border: 1px solid #444;
             padding: 20px;
             min-width: 400px;
             max-width: 600px;
           }
           
           .mimo-modal-header {
             font-size: 14px;
             color: #fff;
             margin-bottom: 15px;
             padding-bottom: 10px;
             border-bottom: 1px solid #444;
           }
           
           .mimo-modal-input {
             width: 100%;
             background: #1a1a1a;
             border: 1px solid #555;
             color: #d4d4d4;
             padding: 10px;
             font-family: monospace;
             font-size: 14px;
           }
           
            .mimo-modal-results {
              margin-top: 10px;
              max-height: 300px;
              overflow-y: auto;
            }
            
            /* Top Navigation */
            .top-nav {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 10px 20px;
              background: #252525;
              border-bottom: 1px solid #444;
            }
            .nav-brand a {
              font-size: 18px;
              font-weight: bold;
              color: #74c0fc;
              text-decoration: none;
            }
            .nav-brand a:hover {
              color: #a0d8ff;
            }
            .nav-links {
              display: flex;
              gap: 20px;
            }
            .nav-links a {
              color: #888;
              text-decoration: none;
              font-size: 14px;
            }
            .nav-links a:hover {
              color: #d4d4d4;
            }
            
            /* Model/Mode Selectors */
            .selector-container {
              display: flex;
              align-items: center;
              gap: 5px;
              background: #2d2d2d;
              border: 1px solid #444;
              padding: 4px 8px;
              border-radius: 4px;
            }
            .selector-label {
              color: #888;
              font-size: 11px;
              text-transform: uppercase;
            }
            .selector-dropdown {
              background: #1a1a1a;
              border: 1px solid #555;
              color: #d4d4d4;
              padding: 4px 8px;
              font-family: monospace;
              font-size: 12px;
              cursor: pointer;
              min-width: 120px;
            }
            .selector-dropdown:hover {
              border-color: #666;
            }
            .selector-dropdown:focus {
              outline: none;
              border-color: #888;
            }
            .selector-dropdown option {
              background: #2d2d2d;
              color: #d4d4d4;
              padding: 4px;
            }

            /* Help Tooltip Styles */
            .help-tooltip {
              position: absolute;
              z-index: 9999;
              max-width: 300px;
              padding: 12px 16px;
              background: #1a1a1a;
              border: 1px solid #444;
              border-radius: 4px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
              font-size: 13px;
              color: #d4d4d4;
              pointer-events: none;
              opacity: 0;
              transition: opacity 0.15s ease;
            }
            .help-tooltip.visible {
              opacity: 1;
            }
            .help-tooltip-title {
              font-weight: bold;
              color: #fff;
              margin-bottom: 8px;
              font-size: 14px;
            }
            .help-tooltip-content {
              line-height: 1.5;
            }
            .help-tooltip-content code {
              background: #333;
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 12px;
            }
            .help-tooltip-content a {
              color: #74c0fc;
            }
            .help-tooltip-content strong {
              color: #fff;
            }

            .dialog-overlay {
              position: fixed;
              inset: 0;
              z-index: 2000;
              background: rgba(0, 0, 0, 0.7);
              display: flex;
              justify-content: center;
              align-items: flex-start;
              padding-top: 80px;
            }

            .dialog-header {
              font-size: 13px;
              color: #888;
              margin-bottom: 10px;
              padding-bottom: 8px;
              border-bottom: 1px solid #444;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }

            .dialog-help {
              font-size: 11px;
            }

            .dialog-compact {
              width: 600px;
              max-width: 90%;
            }

            .dialog-wide {
              min-width: 600px;
              max-width: 95vw;
              width: auto;
            }

            .dialog-xwide {
              min-width: 700px;
              max-width: 95vw;
              width: auto;
            }

            .finder-results {
              margin-top: 8px;
              max-height: 320px;
              overflow-y: auto;
            }

            .finder-results.x-scroll {
              overflow-x: auto;
            }

            .finder-results.tall {
              max-height: 400px;
            }

            .finder-loading {
              padding: 8px 0;
            }

            .buffer-container {
              display: flex;
              flex-direction: column;
              height: 100%;
            }

            .tab-bar {
              display: flex;
            }

            .tab-bar-panel {
              background: #2d2d2d;
              border-bottom: 1px solid #444;
              overflow-x: auto;
              flex-shrink: 0;
            }

            .toolbar {
              display: flex;
            }

            .toolbar.hidden {
              display: none;
            }

            .text-primary {
              color: #d4d4d4;
            }

            .text-muted {
              color: #888;
            }

            .text-subtle {
              color: #666;
            }

            .text-small {
              font-size: 12px;
            }

            .text-xs {
              font-size: 11px;
            }

            .text-error {
              color: #ff6b6b;
            }

            .font-mono {
              font-family: monospace;
            }

            .status-bar {
              margin-top: 8px;
              padding-top: 8px;
              border-top: 1px solid #444;
            }

            .status-bar.hidden {
              display: none;
            }

            .page-header {
              font-size: 16px;
              color: #fff;
            }

            .page-description {
              color: #888;
              font-size: 12px;
            }

            .code-input {
              width: 100%;
              background: #1a1a1a;
              border: 1px solid #555;
              color: #d4d4d4;
              padding: 10px;
              font-family: monospace;
              font-size: 13px;
              outline: none;
              box-sizing: border-box;
            }

            .flex {
              display: flex;
            }

            .flex-col {
              flex-direction: column;
            }

            .flex-grow {
              flex: 1;
            }

            .hidden {
              display: none;
            }

            .mt-2 {
              margin-top: 2px;
            }

            .ml-1 {
              margin-left: 4px;
            }

            .ml-2 {
              margin-left: 8px;
            }

            .ml-3 {
              margin-left: 10px;
            }

            .mr-2 {
              margin-right: 8px;
            }

            .main-content {
              min-height: 0;
              overflow-y: auto;
            }

            .chat-empty-state {
              padding: 20px;
              text-align: center;
            }

            .chat-empty-hint {
              margin-top: 10px;
            }

            .chat-message-meta {
              font-size: 0.75em;
              color: #888;
              margin-left: 8px;
            }

            .chat-usage {
              font-size: 0.75em;
              color: #666;
              padding: 4px 10px;
              text-align: right;
              border-top: 1px solid #333;
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

            .chat-thread-tab.active {
              background: #1a1a1a;
              color: #d4d4d4;
            }

            .chat-thread-action-btn {
              padding: 8px 12px;
              border: none;
              border-right: 1px solid #444;
              background: transparent;
              color: #888;
              cursor: pointer;
              font-family: monospace;
              font-size: 12px;
              white-space: nowrap;
            }

            .thread-status-indicator {
              cursor: help;
            }

            .thread-context-bar {
              padding: 8px 12px;
              background: #252525;
              border-bottom: 1px solid #444;
              display: flex;
              gap: 15px;
              align-items: center;
              font-size: 12px;
            }

            .thread-context-item {
              white-space: nowrap;
            }

            .thread-selector {
              display: flex;
              align-items: center;
              gap: 6px;
              white-space: nowrap;
            }

            .thread-selector-label {
              font-size: 11px;
              color: #888;
              text-transform: uppercase;
            }

            .thread-selector-select {
              background: #2d2d2d;
              border: 1px solid #444;
              color: #d4d4d4;
              padding: 4px 8px;
              font-family: monospace;
              font-size: 11px;
              border-radius: 3px;
              cursor: pointer;
            }

            .thread-model-select {
              min-width: 120px;
            }

            .thread-mode-select {
              min-width: 100px;
            }

            .messages-wrapper {
              min-height: 0;
              overflow: hidden;
            }

            .thread-delete-btn,
            .buffer-close-btn {
              padding: 4px 8px;
              background: transparent;
              border: 1px solid #555;
              color: #888;
              font-family: monospace;
              font-size: 10px;
              cursor: pointer;
              border-radius: 3px;
              white-space: nowrap;
            }

            .edit-context-bar,
            .patch-context-bar,
            .expert-actions-bar {
              padding: 8px 12px;
              background: #252525;
              border-bottom: 1px solid #444;
              display: flex;
              flex-direction: row;
              gap: 12px;
              align-items: center;
              flex-shrink: 0;
              font-size: 12px;
              color: #888;
            }

            #edit-buffer-filepath {
              cursor: pointer;
              user-select: text;
              -webkit-user-select: text;
            }
            #edit-buffer-filepath:hover {
              color: #fff;
              text-decoration: underline;
            }

            .expert-actions-bar {
              border-bottom: none;
              border-top: 1px solid #444;
              justify-content: center;
            }

            .expert-toggle-btn,
            .expert-cancel-btn {
              padding: 4px 10px;
              background: #4a90e2;
              border: none;
              color: #fff;
              font-family: monospace;
              font-size: 11px;
              cursor: pointer;
              border-radius: 3px;
            }

            .expert-cancel-btn {
              padding: 6px 16px;
              background: #666;
              font-size: 12px;
            }

            .expert-select,
            .expert-pill,
            .expert-badge {
              background: #2a2a2a;
              border: 1px solid #444;
              border-radius: 3px;
              font-size: 11px;
            }

            .expert-select {
              padding: 4px 8px;
              color: #ddd;
              font-family: monospace;
              max-width: 200px;
            }

            .expert-pill {
              padding: 2px 8px;
              color: #888;
            }

            .expert-badge {
              padding: 2px 8px;
              color: #fff;
              background: #4a90e2;
              font-family: monospace;
              border: none;
            }

            .outdated-indicator {
              color: #ff9800;
              font-size: 11px;
              font-weight: 500;
            }

            .reload-file-btn {
              padding: 4px 10px;
              background: #3d3d3d;
              border: 1px solid #555;
              color: #ccc;
              font-family: monospace;
              font-size: 11px;
              cursor: pointer;
              border-radius: 3px;
              margin-left: 8px;
            }

            .edit-buffer-content {
              flex: 1;
              overflow-y: auto;
              background: #1a1a1a;
              font-family: monospace;
              font-size: 13px;
              line-height: 1.5;
              position: relative;
            }

            .edit-lines-table {
              width: 100%;
              border-collapse: collapse;
            }

            .expert-input-shell {
              flex-shrink: 0;
              background: #1a1a1a;
              border-top: 1px solid #3b3b3b;
            }

            .panel-divider {
              width: 1px;
              background: #444;
              flex-shrink: 0;
            }

            .patch-diff-container {
              overflow: hidden;
            }

            .pane-column {
              overflow: hidden;
            }

            .pane-header.with-divider {
              border-right: 1px solid #444;
            }

            .buffer-empty-centered {
              align-items: center;
              justify-content: center;
            }

            .error-panel {
              padding: 20px;
              color: #ff6b6b;
            }

            .mt-20 {
              margin-top: 20px;
            }

            .mb-16 {
              margin-bottom: 16px;
            }

            .label-strong {
              display: block;
              margin-bottom: 8px;
              font-weight: 500;
            }

            .textarea-dark {
              width: 100%;
              max-width: 500px;
              padding: 8px;
              border: 1px solid #444;
              background: #1a1a1a;
              color: #e0e0e0;
              border-radius: 4px;
              font-family: inherit;
            }

            .actions-row {
              display: flex;
              gap: 12px;
            }

            .link-no-underline {
              text-decoration: none;
            }

            .inline-flex-row {
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }

            .focus-guide-overlay {
              position: absolute;
              left: 0;
              right: 0;
              top: 0;
              bottom: 0;
              pointer-events: none;
              z-index: 10;
            }

            .buffer-empty-state {
              color: #555;
              font-size: 13px;
              text-align: center;
            }

            .buffer-empty-padded {
              padding: 40px;
            }

            .summary-buffer {
              display: flex;
              flex-direction: column;
              height: 100%;
              padding: 12px;
            }

            .summary-selectors {
              display: flex;
              gap: 8px;
              margin-bottom: 12px;
            }

            .summary-column {
              flex: 1;
            }

            .summary-label {
              display: block;
              font-size: 10px;
              color: #888;
              margin-bottom: 4px;
            }

            .summary-select {
              width: 100%;
              padding: 6px;
              background: #222;
              color: #ddd;
              border: 1px solid #444;
              border-radius: 4px;
            }

            .summary-refresh-btn {
              padding: 8px 16px;
              background: #4a5568;
              color: #fff;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              opacity: 0.9;
            }

            .summary-message {
              margin-top: 12px;
              padding: 8px;
              border-radius: 4px;
              font-size: 13px;
            }

            .summary-message.error {
              background: #2c1a1a;
              color: #f88;
            }

            .summary-message.success {
              background: #1a2a1a;
              color: #8f8;
            }

            .summary-content {
              margin-top: 12px;
              padding: 12px;
              background: #1a1a2a;
              color: #ddd;
              border-radius: 4px;
              font-size: 13px;
              white-space: pre-wrap;
              overflow-y: auto;
              flex: 1;
            }

            .summary-description {
              margin-top: 8px;
              font-size: 11px;
              color: #666;
            }

            .nav-subtle {
              margin-left: 10px;
              color: #888;
            }

            .nav-subtle-link {
              color: #888;
            }

            .pane-header {
              padding: 6px 12px;
              background: #2a2a2a;
              border-bottom: 1px solid #444;
              font-size: 12px;
              color: #888;
              flex-shrink: 0;
            }

            .mono-pane {
              flex: 1;
              overflow: auto;
              padding: 0;
              font-family: monospace;
              font-size: 12px;
              line-height: 20px;
            }

            .diff-overview-track {
              position: relative;
              width: 10px;
              flex-shrink: 0;
              align-self: stretch;
              background: #232323;
              border-left: 1px solid #444;
            }

            .diff-overview-tick {
              position: absolute;
              right: 0;
              width: 100%;
              border-radius: 2px;
              cursor: pointer;
              opacity: 0.85;
            }

            .diff-overview-tick:hover {
              opacity: 1;
            }

            .diff-overview-tick--added {
              background: #4caf50;
            }

            .diff-overview-tick--removed {
              background: #f44336;
            }

            .diff-overview-tick--mixed {
              background: linear-gradient(#4caf50, #f44336);
            }

            .diff-overview-thumb {
              position: absolute;
              right: 0;
              width: 100%;
              background: rgba(212, 212, 212, 0.12);
              border: 1px solid rgba(212, 212, 212, 0.3);
              border-radius: 2px;
              pointer-events: none;
            }

            .diff-change-counter {
              font-family: monospace;
              font-size: 11px;
              color: #888;
              padding: 0 8px;
              user-select: none;
            }

            /* Pinned-sessions side-menu button + drawer */
            .pinned-menu-btn {
              background: transparent;
              border: 1px solid #444;
              color: #d4d4d4;
              padding: 2px 10px;
              cursor: pointer;
              font-family: monospace;
              font-size: 14px;
              margin-right: 10px;
              border-radius: 3px;
            }
            .pinned-menu-btn:hover { background: #333; }

            .pinned-drawer-overlay {
              position: fixed;
              inset: 0;
              z-index: 1500;
              background: rgba(0, 0, 0, 0.5);
            }
            .pinned-drawer {
              position: fixed;
              top: 0;
              left: 0;
              bottom: 0;
              width: 320px;
              max-width: 85vw;
              background: #252525;
              border-right: 1px solid #444;
              display: flex;
              flex-direction: column;
              z-index: 1501;
              overflow-y: auto;
            }
            .pinned-drawer-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 12px 16px;
              border-bottom: 1px solid #444;
              font-size: 14px;
              color: #fff;
            }
            .pinned-drawer-close {
              background: transparent;
              border: none;
              color: #888;
              cursor: pointer;
              font-family: monospace;
              font-size: 18px;
            }
            .pinned-drawer-close:hover { color: #d4d4d4; }
            .pinned-drawer-list {
              flex: 1;
              overflow-y: auto;
              padding: 8px 0;
            }
            .pinned-drawer-entry {
              display: flex;
              align-items: flex-start;
              gap: 8px;
              padding: 10px 16px;
              cursor: default;
              border-bottom: 1px solid #333;
              color: #d4d4d4;
              text-decoration: none;
            }
            .pinned-drawer-entry:hover { background: #2d2d2d; }
            .pinned-drawer-entry-checkbox {
              margin-top: 2px;
              cursor: pointer;
              flex-shrink: 0;
            }
            .pinned-drawer-entry-text {
              flex: 1;
              min-width: 0;
              display: flex;
              flex-direction: column;
            }
            .pinned-drawer-entry-title {
              font-size: 13px;
              color: #74c0fc;
              flex: 1;
              min-width: 0;
              overflow-wrap: anywhere;
            }
            .pinned-drawer-entry-branch {
              font-size: 11px;
              color: #888;
              margin-top: 2px;
              display: block;
              width: 100%;
            }
            .pinned-drawer-entry-stale {
              font-size: 11px;
              color: #ff9800;
            }
            .pinned-drawer-entry-unpin {
              background: transparent;
              border: 1px solid #555;
              color: #888;
              font-family: monospace;
              font-size: 10px;
              padding: 2px 6px;
              cursor: pointer;
              border-radius: 3px;
              margin-top: 6px;
              align-self: flex-start;
            }
            .pinned-drawer-entry-unpin:hover { color: #ff6b6b; border-color: #ff6b6b; }
            .pinned-drawer-empty {
              padding: 30px 16px;
              text-align: center;
              color: #888;
              font-size: 13px;
            }
            .pinned-drawer-footer {
              padding: 12px 16px;
              border-top: 1px solid #444;
            }
            .pinned-drawer-parallel-btn {
              display: block;
              width: 100%;
              background: #333;
              border: 1px solid #555;
              color: #d4d4d4;
              padding: 10px;
              cursor: pointer;
              font-family: monospace;
              font-size: 13px;
              text-align: center;
              text-decoration: none;
              border-radius: 3px;
            }
            .pinned-drawer-parallel-btn:hover { background: #444; }

            /* Pin checkbox slot in the top-nav */
            .pin-checkbox {
              margin-left: 8px;
              cursor: pointer;
              vertical-align: middle;
            }
            .pin-checkbox-label {
              font-size: 11px;
              color: #888;
              margin-left: 2px;
              vertical-align: middle;
            }
            .pin-error-inline {
              color: #ff6b6b;
              font-size: 11px;
              margin-left: 6px;
            }

            /* Parallel /pinned page */
            .pinned-parallel-container {
              display: flex;
              flex-direction: column;
              height: 100vh;
              overflow: hidden;
            }
            .pinned-parallel-toolbar {
              display: flex;
              align-items: center;
              padding: 8px 16px;
              background: #252525;
              border-bottom: 1px solid #444;
              gap: 12px;
              flex-shrink: 0;
            }
            .pinned-parallel-toolbar a {
              color: #74c0fc;
              text-decoration: none;
              font-size: 14px;
            }
            .pinned-parallel-toolbar .pinned-parallel-title {
              font-size: 14px;
              color: #fff;
              font-weight: bold;
            }
            .pinned-parallel-columns {
              display: flex;
              flex: 1;
              overflow: hidden;
            }
            .pinned-parallel-column {
              flex: 1 1 0;
              min-width: 0;
              border-right: 1px solid #444;
              display: flex;
              flex-direction: column;
              background: #1a1a1a;
            }
            .pinned-parallel-column:last-child { border-right: none; }
            .pinned-parallel-column-header {
              padding: 6px 10px;
              background: #252525;
              border-bottom: 1px solid #444;
              font-size: 12px;
              color: #888;
              display: flex;
              justify-content: space-between;
              align-items: center;
              flex-shrink: 0;
            }
            .pinned-parallel-column-title {
              color: #74c0fc;
              font-size: 12px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .pinned-parallel-column-iframe {
              flex: 1;
              border: none;
              width: 100%;
              background: #1a1a1a;
            }
            .pinned-parallel-column.focused {
              box-shadow: inset 0 0 0 2px #74c0fc;
            }
            .pinned-parallel-column-stale {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 20px;
              text-align: center;
              color: #888;
              gap: 12px;
            }
            .pinned-parallel-empty {
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #888;
              font-size: 16px;
              text-align: center;
              flex-direction: column;
              gap: 16px;
            }
            .pinned-parallel-empty a {
              color: #74c0fc;
              text-decoration: none;
              font-size: 14px;
            }
          `}</style>
        </head>
        <body>
          {embed ? null : <PinnedSessionsDrawer />}
          {!embed && showPinnedMenuButton && (
            <button
              type="button"
              id="pinned-menu-btn"
              class="pinned-menu-btn"
              title="Pinned sessions"
              aria-label="Open pinned sessions drawer"
              data-help-id="layout-pinned-menu-btn"
              onclick="document.dispatchEvent(new CustomEvent('mimo:pinned-drawer-open'))"
            >
              &#9776;
            </button>
          )}
          {embed ? null : (
            <nav class="top-nav">
              <div class="nav-brand">
                {backUrl && (
                  <a
                    href={backUrl}
                    class="mr-2"
                    title="Back"
                    data-help-id="layout-a"
                  >
                    &lt;
                  </a>
                )}
                <a href="/dashboard" data-help-id="layout-a">
                  MIMO
                </a>
                {(sessionName || projectName) && (
                  <span class="nav-subtle">
                    {sessionName && (
                      <span>
                        | {sessionName}
                        {sessionBranch && (
                          <span title="Branch"> | ⎇ {sessionBranch}</span>
                        )}
                      </span>
                    )}
                    {projectName && (
                      <span>
                        {sessionName ? " | " : "| "}
                        <a
                          href={`/projects/${projectId}`}
                          class="nav-subtle-link"
                          data-help-id="layout-a"
                        >
                          {projectName}
                        </a>
                        {cloneUrl && (
                          <a
                            href={`${cloneUrl}timeline`}
                            target="_blank"
                            title="View Fossil Repository"
                            class="ml-1"
                            data-help-id="layout-a"
                          >
                            🌿
                          </a>
                        )}
                        {agentId && agentName && (
                          <span class="ml-1">
                            |{" "}
                            <a
                              href={`/agents/${agentId}`}
                              class="nav-subtle-link"
                              data-help-id="layout-a"
                            >
                              {agentName}
                            </a>
                          </span>
                        )}
                        {cloneWorkspaceHtml}
                      </span>
                    )}
                  </span>
                )}
                {pinSlot}
              </div>
              <div class="nav-links">
                <a href="/dashboard" data-help-id="layout-a">
                  Dashboard
                </a>
                <a href="/projects" data-help-id="layout-a">
                  Projects
                </a>
                <a href="/mcp-servers" data-help-id="layout-a">
                  MCP Servers
                </a>
                <a href="/credentials" data-help-id="layout-a">
                  Credentials
                </a>
                <a href="/agents" data-help-id="layout-a">
                  Agents
                </a>
                <a href="/auth/logout" data-help-id="layout-a">
                  Logout
                </a>
              </div>
            </nav>
          )}
          <main class="flex flex-col flex-grow main-content">{children}</main>
          {showStatusLine && !embed && (
            <div class="status-line">
              <span class="status-line-message"></span>
            </div>
          )}
          {showSessionFinder && !embed && <SessionFinderDialog />}
          {!embed && <script src="/js/pinned-sessions-drawer.js" defer></script>}
        </body>
      </html>
    </>
  );
};
