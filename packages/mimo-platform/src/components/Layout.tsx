import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import type { SessionKeybindingsConfig } from "../config/service.js";

interface LayoutProps {
  title: string;
  children: any;
  showStatusLine?: boolean;
  sessionId?: string;
  streamingTimeoutMs?: number;
  sessionKeybindings?: SessionKeybindingsConfig;
  chatFileExtensions?: string[];
  sessionName?: string;
  sessionBranch?: string;
  projectId?: string;
  projectName?: string;
  fossilUrl?: string;
  agentId?: string;
  agentName?: string;
  cloneWorkspaceHtml?: any;
  backUrl?: string;
}

export const Layout: FC<LayoutProps> = ({
  title,
  children,
  showStatusLine = false,
  sessionId,
  streamingTimeoutMs,
  sessionKeybindings,
  chatFileExtensions,
  sessionName,
  sessionBranch,
  projectId,
  projectName,
  fossilUrl,
  agentId,
  agentName,
  cloneWorkspaceHtml,
  backUrl,
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
          <script
            dangerouslySetInnerHTML={{
              __html: `window.MIMO_SESSION_ID = "${sessionId || ""}";\nwindow.MIMO_STREAMING_TIMEOUT_MS = ${streamingTimeoutMs ?? 600000};\nwindow.MIMO_SESSION_KEYBINDINGS = ${JSON.stringify(sessionKeybindings || {})};\nwindow.MIMO_CHAT_FILE_EXTENSIONS = ${JSON.stringify(chatFileExtensions ?? [])};`,
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
          {sessionId && <script src="/js/diff.js" defer></script>}
          {sessionId && <script src="/js/expert-utils.js" defer></script>}
          {sessionId && <script src="/js/patch-buffer.js" defer></script>}
          {sessionId && <script src="/js/chat-token-utils.js" defer></script>}
          {sessionId && <script src="/js/chat.js" defer></script>}
          {sessionId && <script src="/js/chat-threads.js" defer></script>}
          {sessionId && <script src="/js/commit.js" defer></script>}
          {sessionId && <script src="/js/session-clone.js" defer></script>}
          {sessionId && <script src="/js/notes.js" defer></script>}
          {sessionId && <script src="/js/edit-buffer.js" defer></script>}
          {sessionId && (
            <script src="/js/session-keybindings.js" defer></script>
          )}
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
          `}</style>
        </head>
        <body>
          <nav class="top-nav">
            <div class="nav-brand">
              {backUrl && (
                <a href={backUrl} style="margin-right: 8px;" title="Back">
                  &lt;
                </a>
              )}
              <a href="/dashboard">MIMO</a>
              {(sessionName || projectName) && (
                <span style="margin-left: 10px; color: #888;">
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
                      <a href={`/projects/${projectId}`} style="color: #888;">
                        {projectName}
                      </a>
                      {fossilUrl && (
                        <a
                          href={`${fossilUrl}timeline`}
                          target="_blank"
                          title="View Fossil Repository"
                          style="margin-left: 4px;"
                        >
                          🌿
                        </a>
                      )}
                      {agentId && agentName && (
                        <span style="margin-left: 4px;">
                          |{" "}
                          <a href={`/agents/${agentId}`} style="color: #888;">
                            {agentName}
                          </a>
                        </span>
                      )}
                      {cloneWorkspaceHtml}
                    </span>
                  )}
                </span>
              )}
            </div>
            <div class="nav-links">
              <a href="/dashboard">Dashboard</a>
              <a href="/projects">Projects</a>
              <a href="/mcp-servers">MCP Servers</a>
              <a href="/credentials">Credentials</a>
              <a href="/agents">Agents</a>
              <a href="/auth/logout">Logout</a>
            </div>
          </nav>
          <main style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow-y: auto;">
            {children}
          </main>
          {showStatusLine && (
            <div class="status-line">
              <span class="status-line-message"></span>
            </div>
          )}
        </body>
      </html>
    </>
  );
};
