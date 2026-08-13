// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import { Layout } from "../../../shared/components/Layout.js";

interface SessionSettingsPageProps {
  session: {
    id: string;
    name: string;
    idleTimeoutMs: number;
    sessionTtlDays: number;
    acpStatus: string;
    priority: "high" | "medium" | "low";
    browserNotificationsEnabled?: boolean;
  };
  project: {
    id: string;
    name: string;
    color?: string;
    iconGlyph?: string;
  };
  creationSettings?: {
    sessionName: string;
    assignedAgentName: string | null;
    agentSubpath: string | null;
    relativeDir?: string | null;
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
      projectId={project.id}
      projectName={project.name}
      projectColor={project.color}
      projectIconGlyph={project.iconGlyph}
    >
      <div class="container session-settings-container">
        <h1>Session Settings</h1>
        <p class="text-muted session-settings-subtitle">
          {session.name} · {project.name}
        </p>

        {creationSettings && (
          <div class="creation-settings-box">
            <h2 class="creation-settings-title">Creation Settings</h2>
            <div class="creation-settings-content">
              <div class="settings-row">
                <span class="settings-label">Session Name</span>
                <div class="settings-value">{creationSettings.sessionName}</div>
              </div>
              <div class="settings-row">
                <span class="settings-label">Assigned Agent</span>
                <div class="settings-value">
                  {creationSettings.assignedAgentName || "None"}
                </div>
              </div>
              <div class="settings-row">
                <span class="settings-label">Working directory</span>
                <div class="settings-value">
                  {creationSettings.relativeDir ||
                    creationSettings.agentSubpath ||
                    "Repository root"}
                </div>
              </div>
              <div class="settings-row">
                <span class="settings-label">Branch</span>
                <div class="settings-value">
                  {creationSettings.branch || "Not set"}
                </div>
              </div>
              <div class="settings-row">
                <span class="settings-label">MCP Servers</span>
                <div class="settings-value">
                  {creationSettings.mcpServerNames.length > 0
                    ? creationSettings.mcpServerNames.join(", ")
                    : "None attached"}
                </div>
              </div>
              <div>
                <span class="settings-label">Session Type</span>
                <div class="settings-value">{creationSettings.sessionType}</div>
              </div>
            </div>
          </div>
        )}

        <h2 class="runtime-settings-title">Runtime Settings</h2>

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
                class={`acp-badge ${session.acpStatus === "active" ? "active" : session.acpStatus === "parked" ? "parked" : "unknown"}`}
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

          <div class="form-group current-setting-box">
            <label class="current-setting-label">Current Setting</label>
            <div class="current-setting-value">
              {formatTimeout(session.idleTimeoutMs)}
            </div>
          </div>

          <div class="form-group">
            <label>ACP Session Information</label>

            <div class="session-info-box">
              <div class="mb-8">
                <span class="text-muted">Session ID: </span>
                <span class="text-primary">{session.id}</span>
              </div>
              <div>
                <span class="text-muted">Auto-park: </span>
                <span class="text-primary">
                  {session.idleTimeoutMs === 0
                    ? "Disabled"
                    : `After ${formatTimeout(session.idleTimeoutMs)} of inactivity`}
                </span>
              </div>
              <div class="mt-8">
                <span class="text-muted">Auto-delete TTL: </span>
                <span class="text-primary">{session.sessionTtlDays} days</span>
              </div>
            </div>
          </div>

          <div class="form-group tips-box">
            <label class="tips-label">💡 Tips</label>
            <ul class="tips-list">
              <li class="mb-8">
                <strong>Short timeouts (1-2 min):</strong> Good for quick tasks.
                Saves resources but may have 1-2s wake-up delay.
              </li>
              <li class="mb-8">
                <strong>Medium timeouts (5-10 min):</strong> Good for focused
                work. Balances responsiveness and resource usage.
              </li>
              <li>
                <strong>Always active:</strong> Best for critical workflows
                requiring immediate response. Uses more resources.
              </li>
            </ul>
          </div>

          <div class="form-group">
            <label>
              <input
                type="checkbox"
                id="browser-notifications-toggle"
                checked={!!session.browserNotificationsEnabled}
                style="margin-right: 8px;"
              />
              Browser notifications
            </label>
            <p class="form-help">
              Show a desktop notification when the agent responds while this tab
              is not visible.
            </p>
            <p
              id="browser-notifications-permission-msg"
              class="form-help"
              style={{ color: "#888", display: "none" }}
            ></p>
          </div>

          <script
            dangerouslySetInnerHTML={{
              __html: `
            (function () {
              const toggle = document.getElementById('browser-notifications-toggle');
              const msg = document.getElementById('browser-notifications-permission-msg');
              if (!toggle) return;

              async function requestPermission() {
                if (!('Notification' in window)) return 'unsupported';
                if (Notification.permission === 'granted') return 'granted';
                if (Notification.permission === 'denied') return 'denied';
                return await Notification.requestPermission();
              }

              toggle.addEventListener('change', async function () {
                const sessionId = '${session.id}';
                const enabled = toggle.checked;

                // When enabling, request browser permission first
                if (enabled) {
                  const result = await requestPermission();
                  if (result === 'denied') {
                    toggle.checked = false;
                    if (msg) {
                      msg.textContent = 'Notification permission was denied. You can re-enable it in your browser settings.';
                      msg.style.display = 'block';
                    }
                    return;
                  }
                  if (result === 'unsupported') {
                    toggle.checked = false;
                    if (msg) {
                      msg.textContent = 'This browser does not support notifications.';
                      msg.style.display = 'block';
                    }
                    return;
                  }
                }

                if (msg) {
                  msg.style.display = 'none';
                  msg.textContent = '';
                }

                try {
                  const res = await fetch('/sessions/' + sessionId + '/config', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ browserNotificationsEnabled: enabled }),
                  });
                  if (!res.ok) {
                    console.error('Failed to update notification preference:', await res.text());
                    toggle.checked = !enabled;
                  }
                } catch (err) {
                  console.error('Failed to update notification preference:', err);
                  toggle.checked = !enabled;
                }
              });
            })();
          `,
            }}
          />

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
        <style>{`
          .session-settings-container { max-width: 600px; }
          .session-settings-subtitle { margin-bottom: 20px; }
          .creation-settings-box { background: #0f1419; padding: 15px; border-radius: 4px; margin-bottom: 30px; border-left: 3px solid #4caf50; }
          .creation-settings-title { margin-top: 0; margin-bottom: 15px; color: #d4d4d4; font-size: 16px; }
          .creation-settings-content { color: #ccc; font-size: 14px; }
          .settings-row { margin-bottom: 12px; }
          .settings-label { color: #888; font-size: 12px; }
          .settings-value { color: #d4d4d4; margin-top: 4px; }
          .runtime-settings-title { color: #d4d4d4; font-size: 16px; margin-top: 30px; margin-bottom: 15px; }
          .acp-badge { display: inline-block; margin-left: 10px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
          .acp-badge.active { background: #1e4620; color: #4caf50; }
          .acp-badge.parked { background: #332d1a; color: #ffc107; }
          .acp-badge.unknown { background: #333; color: #888; }
          .current-setting-box { background: #1e1e1e; padding: 15px; border-radius: 4px; border-left: 3px solid #007acc; }
          .current-setting-label { font-weight: normal; color: #888; font-size: 12px; margin-bottom: 5px; }
          .current-setting-value { color: #d4d4d4; font-size: 14px; }
          .session-info-box { background: #1e1e1e; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 12px; }
          .tips-box { background: #2d2d2d; padding: 15px; border-radius: 4px; border-left: 3px solid #ffc107; }
          .tips-label { margin: 0 0 10px 0; color: #ffc107; font-size: 14px; }
          .tips-list { margin: 0; padding-left: 20px; color: #ccc; font-size: 13px; }
          .mb-8 { margin-bottom: 8px; }
          .mt-8 { margin-top: 8px; }
        `}</style>
      </div>
    </Layout>
  );
};
