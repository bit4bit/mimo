import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import { ImpactBuffer } from "./ImpactBuffer.js";

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

interface ImpactMetrics {
  files: {
    new: number;
    changed: number;
    deleted: number;
  };
  linesOfCode: {
    added: number;
    removed: number;
    net: number;
  };
  complexity: {
    cyclomatic: number;
    cognitive: number;
    estimatedMinutes: number;
  };
  byLanguage: Array<{
    language: string;
    files: number;
    linesAdded: number;
    linesRemoved: number;
    complexityDelta: number;
  }>;
}

interface ImpactTrend {
  files: { new: string; changed: string; deleted: string };
  linesOfCode: { added: string; removed: string; net: string };
  complexity: { cyclomatic: string; cognitive: string };
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
  fossilPort?: number;
}

export const SessionDetailPage: FC<SessionDetailProps> = ({
  project,
  session,
  chatHistory,
  agent,
  modelState,
  modeState,
  fossilPort,
}) => {
  const fossilUrl = fossilPort ? `http://localhost:${fossilPort}` : undefined;

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
          <div style="display: flex; gap: 10px; align-items: center;">
            {/* Model Selector - always visible with placeholder */}
            <div 
              id="model-selector-container" 
              class="selector-container" 
              style="opacity: 0.5;"
              title="Waiting for ACP server to provide model options..."
            >
              <label class="selector-label">Model:</label>
              <select
                id="model-selector"
                class="selector-dropdown"
                disabled
              >
                <option>Not configured</option>
              </select>
            </div>

            {/* Mode Selector - always visible with placeholder */}
            <div 
              id="mode-selector-container" 
              class="selector-container"
              style="opacity: 0.5;"
              title="Waiting for ACP server to provide mode options..."
            >
              <label class="selector-label">Mode:</label>
              <select
                id="mode-selector"
                class="selector-dropdown"
                disabled
              >
                <option>Not configured</option>
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
          {/* Chat Buffer - Center */}
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
              <div id="chat-usage" class="chat-usage" style="display: none; font-size: 0.75em; color: #666; margin-top: 4px; text-align: right;"></div>
            </div>
          </div>

          {/* Impact Buffer - Right */}
          <ImpactBuffer 
            sessionId={session.id}
            fossilUrl={fossilUrl}
          />
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

      {/* Impact Polling Script */}
      <script dangerouslySetInnerHTML={{ __html: `
        // Impact metrics polling
        (function() {
          const sessionId = '${session.id}';
          let lastMetrics = null;
          
          async function fetchImpact() {
            try {
              const response = await fetch(\`/sessions/\${sessionId}/impact\`);
              if (!response.ok) throw new Error('Failed to fetch impact');
              
              const data = await response.json();
              updateImpactUI(data);
            } catch (error) {
              console.error('[impact] Polling error:', error);
            }
          }
          
          function updateImpactUI(data) {
            const content = document.getElementById('impact-content');
            if (!content || data.error) return;
            
            // Calculate trends if we have previous data
            let trends = null;
            if (lastMetrics) {
              trends = {
                files: {
                  new: data.files.new > lastMetrics.files.new ? '↑' : data.files.new < lastMetrics.files.new ? '↓' : '→',
                  changed: data.files.changed > lastMetrics.files.changed ? '↑' : data.files.changed < lastMetrics.files.changed ? '↓' : '→',
                  deleted: data.files.deleted > lastMetrics.files.deleted ? '↑' : data.files.deleted < lastMetrics.files.deleted ? '↓' : '→',
                },
                linesOfCode: {
                  added: data.linesOfCode.added > lastMetrics.linesOfCode.added ? '↑' : data.linesOfCode.added < lastMetrics.linesOfCode.added ? '↓' : '→',
                  removed: data.linesOfCode.removed > lastMetrics.linesOfCode.removed ? '↑' : data.linesOfCode.removed < lastMetrics.linesOfCode.removed ? '↓' : '→',
                  net: data.linesOfCode.net > lastMetrics.linesOfCode.net ? '↑' : data.linesOfCode.net < lastMetrics.linesOfCode.net ? '↓' : '→',
                },
                complexity: {
                  cyclomatic: data.complexity.cyclomatic > lastMetrics.complexity.cyclomatic ? '↑' : data.complexity.cyclomatic < lastMetrics.complexity.cyclomatic ? '↓' : '→',
                  cognitive: data.complexity.cognitive > lastMetrics.complexity.cognitive ? '↑' : data.complexity.cognitive < lastMetrics.complexity.cognitive ? '↓' : '→',
                }
              };
            }
            
            lastMetrics = data;
            
            // Update UI elements (simplified - full implementation would update all sections)
            // For now, trigger a page refresh or use the data directly
            window.__impactData = data;
            window.__impactTrends = trends;
          }
          
          // Poll every 5 seconds
          setInterval(fetchImpact, 5000);
          
          // Initial fetch
          fetchImpact();
          
          // Install scc handler
          window.installScc = async function() {
            const btn = document.getElementById('install-scc-btn');
            if (btn) {
              btn.textContent = 'Installing...';
              btn.disabled = true;
            }
            
            try {
              const response = await fetch('/impact/install-scc', { method: 'POST' });
              const result = await response.json();
              
              if (result.success) {
                window.location.reload();
              } else {
                alert('Failed to install scc: ' + (result.error || 'Unknown error'));
                if (btn) {
                  btn.textContent = 'Install scc';
                  btn.disabled = false;
                }
              }
            } catch (error) {
              alert('Failed to install scc: ' + error.message);
              if (btn) {
                btn.textContent = 'Install scc';
                btn.disabled = false;
              }
            }
          };
        })();
      `}} />

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
