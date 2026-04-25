import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface SessionSettingsPageProps {
  session: {
    id: string;
    name: string;
    idleTimeoutMs: number;
    sessionTtlDays: number;
    acpStatus: string;
    priority: "high" | "medium" | "low";
  };
  project: {
    id: string;
    name: string;
  };
  creationSettings?: {
    sessionName: string;
    assignedAgentName: string | null;
    agentSubpath: string | null;
    branch: string | null;
    mcpServerNames: string[];
    sessionType: string;
  };
  streamingTimeoutMs?: number;
}

export const SessionSettingsPage: FC<SessionSettingsPageProps> = ({
  session,
  project,
  creationSettings,
  streamingTimeoutMs,
}) => {
  // Format timeout for display
  const formatTimeout = (ms: number) => {
    if (ms === 0) return "Never (Disabled)";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    if (minutes > 0) {
      return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes} minutes`;
    }
    return `${seconds} seconds`;
  };

  return (
    <Layout
      title={`Settings - ${session.name}`}
      showStatusLine={true}
      sessionId={session.id}
      streamingTimeoutMs={streamingTimeoutMs}
      sessionName={session.name}
    >
      <div class="container" style="max-width: 600px;">
        <h1>Session Settings</h1>
        <p style="color: #888; margin-bottom: 20px;">
          {session.name} · {project.name}
        </p>

        {creationSettings && (
          <div
            style={{
              background: "#0f1419",
              padding: "15px",
              borderRadius: "4px",
              marginBottom: "30px",
              borderLeft: "3px solid #4caf50",
            }}
          >
            <h2
              style={{
                marginTop: "0",
                marginBottom: "15px",
                color: "#d4d4d4",
                fontSize: "16px",
              }}
            >
              Creation Settings
            </h2>
            <div style={{ color: "#ccc", fontSize: "14px" }}>
              <div style={{ marginBottom: "12px" }}>
                <span style={{ color: "#888", fontSize: "12px" }}>
                  Session Name
                </span>
                <div style={{ color: "#d4d4d4", marginTop: "4px" }}>
                  {creationSettings.sessionName}
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <span style={{ color: "#888", fontSize: "12px" }}>
                  Assigned Agent
                </span>
                <div style={{ color: "#d4d4d4", marginTop: "4px" }}>
                  {creationSettings.assignedAgentName || "None"}
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <span style={{ color: "#888", fontSize: "12px" }}>
                  Agent working directory
                </span>
                <div style={{ color: "#d4d4d4", marginTop: "4px" }}>
                  {creationSettings.agentSubpath || "Repository root"}
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <span style={{ color: "#888", fontSize: "12px" }}>Branch</span>
                <div style={{ color: "#d4d4d4", marginTop: "4px" }}>
                  {creationSettings.branch || "Not set"}
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <span style={{ color: "#888", fontSize: "12px" }}>
                  MCP Servers
                </span>
                <div style={{ color: "#d4d4d4", marginTop: "4px" }}>
                  {creationSettings.mcpServerNames.length > 0
                    ? creationSettings.mcpServerNames.join(", ")
                    : "None attached"}
                </div>
              </div>
              <div>
                <span style={{ color: "#888", fontSize: "12px" }}>
                  Session Type
                </span>
                <div style={{ color: "#d4d4d4", marginTop: "4px" }}>
                  {creationSettings.sessionType}
                </div>
              </div>
            </div>
          </div>
        )}

        <h2
          style={{
            color: "#d4d4d4",
            fontSize: "16px",
            marginTop: "30px",
            marginBottom: "15px",
          }}
        >
          Runtime Settings
        </h2>

        <form
          method="POST"
          action={`/projects/${project.id}/sessions/${session.id}/settings/priority`}
        >
          <div class="form-group">
            <label>Priority</label>
            <select
              name="priority"
              required
              data-help-id="session-settings-page-priority-select"
            >
              <option value="high" selected={session.priority === "high"}>
                High
              </option>
              <option value="medium" selected={session.priority === "medium"}>
                Medium
              </option>
              <option value="low" selected={session.priority === "low"}>
                Low
              </option>
            </select>
            <p class="form-help">
              Affects the order this session appears in the list.
            </p>
          </div>
          <div class="actions">
            <button
              type="submit"
              class="btn"
              data-help-id="session-settings-page-button"
            >
              Update Priority
            </button>
          </div>
        </form>

        <form
          method="POST"
          action={`/projects/${project.id}/sessions/${session.id}/settings/timeout`}
        >
          <div class="form-group">
            <label>
              Idle Timeout
              <span
                style={{
                  display: "inline-block",
                  marginLeft: "10px",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 500,
                  ...(session.acpStatus === "active"
                    ? { background: "#1e4620", color: "#4caf50" }
                    : session.acpStatus === "parked"
                      ? { background: "#332d1a", color: "#ffc107" }
                      : { background: "#333", color: "#888" }),
                }}
              >
                {session.acpStatus === "active"
                  ? "● Active"
                  : session.acpStatus === "parked"
                    ? "💤 Parked"
                    : "○ Unknown"}
              </span>
            </label>

            <select
              name="idleTimeoutMs"
              required
              data-help-id="session-settings-page-idle-timeout-ms-select"
            >
              <option value="0" selected={session.idleTimeoutMs === 0}>
                Never (Always Active)
              </option>
              <option value="60000" selected={session.idleTimeoutMs === 60000}>
                1 minute
              </option>
              <option
                value="120000"
                selected={session.idleTimeoutMs === 120000}
              >
                2 minutes
              </option>
              <option
                value="300000"
                selected={session.idleTimeoutMs === 300000}
              >
                5 minutes
              </option>
              <option
                value="600000"
                selected={session.idleTimeoutMs === 600000}
              >
                10 minutes (Default)
              </option>
              <option
                value="900000"
                selected={session.idleTimeoutMs === 900000}
              >
                15 minutes
              </option>
              <option
                value="1800000"
                selected={session.idleTimeoutMs === 1800000}
              >
                30 minutes
              </option>
            </select>

            <p class="form-help">
              When inactive for this duration, the ACP agent will automatically
              "park" to save resources. The agent will wake up when you send a
              new message.
            </p>
          </div>

          <div class="form-group">
            <label>Session TTL (days)</label>
            <select
              name="sessionTtlDays"
              required
              data-help-id="session-settings-page-session-ttl-days-select"
            >
              <option value="30" selected={session.sessionTtlDays === 30}>
                30 days
              </option>
              <option value="90" selected={session.sessionTtlDays === 90}>
                90 days
              </option>
              <option value="180" selected={session.sessionTtlDays === 180}>
                180 days (Default)
              </option>
              <option value="365" selected={session.sessionTtlDays === 365}>
                365 days
              </option>
            </select>
            <p class="form-help">
              Session is eligible for auto-delete after this age, only when
              inactive for at least 10 minutes.
            </p>
          </div>

          <div
            class="form-group"
            style="background: '#1e1e1e', padding: '15px', borderRadius: '4px', borderLeft: '3px solid #007acc'"
          >
            <label style="font-weight: 'normal', color: '#888', fontSize: '12px', marginBottom: '5px'">
              Current Setting
            </label>
            <div style="color: '#d4d4d4', fontSize: '14px'">
              {formatTimeout(session.idleTimeoutMs)}
            </div>
          </div>

          <div class="form-group">
            <label>ACP Session Information</label>

            <div style="background: '#1e1e1e', padding: '15px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px'">
              <div style="margin-bottom: '8px'">
                <span style="color: '#888'">Session ID: </span>
                <span style="color: '#d4d4d4'">{session.id}</span>
              </div>
              <div>
                <span style="color: '#888'">Auto-park: </span>
                <span style="color: '#d4d4d4'">
                  {session.idleTimeoutMs === 0
                    ? "Disabled"
                    : `After ${formatTimeout(session.idleTimeoutMs)} of inactivity`}
                </span>
              </div>
              <div style="margin-top: '8px'">
                <span style="color: '#888'">Auto-delete TTL: </span>
                <span style="color: '#d4d4d4'">
                  {session.sessionTtlDays} days
                </span>
              </div>
            </div>
          </div>

          <div
            class="form-group"
            style="background: '#2d2d2d', padding: '15px', borderRadius: '4px', borderLeft: '3px solid #ffc107'"
          >
            <label style="margin: '0 0 10px 0', color: '#ffc107', fontSize: '14px'">
              💡 Tips
            </label>
            <ul style="margin: '0', paddingLeft: '20px', color: '#ccc', fontSize: '13px'">
              <li style="margin-bottom: '8px'">
                <strong>Short timeouts (1-2 min):</strong> Good for quick tasks.
                Saves resources but may have 1-2s wake-up delay.
              </li>
              <li style="margin-bottom: '8px'">
                <strong>Medium timeouts (5-10 min):</strong> Good for focused
                work. Balances responsiveness and resource usage.
              </li>
              <li>
                <strong>Always active:</strong> Best for critical workflows
                requiring immediate response. Uses more resources.
              </li>
            </ul>
          </div>

          <div class="actions">
            <button
              type="submit"
              class="btn"
              data-help-id="session-settings-page-button"
            >
              Update Settings
            </button>
            <a
              href={`/projects/${project.id}/sessions/${session.id}`}
              class="btn-secondary"
              data-help-id="session-settings-page-a"
            >
              Cancel
            </a>
          </div>
        </form>
      </div>
    </Layout>
  );
};
