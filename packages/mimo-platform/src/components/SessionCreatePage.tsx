import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface Project {
  id: string;
  name: string;
  newBranch?: string;
  agentSubpath?: string;
}

interface McpServer {
  id: string;
  name: string;
  description?: string;
}

interface SessionCreateProps {
  project: Project;
  mcpServers: McpServer[];
  error?: string;
}

export const SessionCreatePage: FC<SessionCreateProps> = ({
  project,
  mcpServers,
  error,
}) => {
  return (
    <Layout title={`New Session - ${project.name}`}>
      <div class="container" style="max-width: 600px;">
        <h1>Create New Session</h1>
        <p style="color: #888; margin-bottom: 20px;">Project: {project.name}</p>

        <form method="POST" action={`/projects/${project.id}/sessions`}>
          <div class="form-group">
            <label>Session Name</label>
            <input
              type="text"
              id="session-name-input"
              name="name"
              required
              placeholder="Feature implementation"
              data-help-id="session-create-page-session-name-input-input"
            />
          </div>

          <div class="form-group">
            <label>Priority</label>
            <select
              name="priority"
              data-help-id="session-create-page-priority-select"
            >
              <option value="high">High</option>
              <option value="medium" selected>
                Medium
              </option>
              <option value="low">Low</option>
            </select>
            <p class="form-help">
              Affects the order sessions appear in the list.
            </p>
          </div>

          <div class="form-group">
            <label>Session Type</label>
            <p style="color: #888; font-size: 14px;">
              Creates a worktree for isolated development. Changes will be
              tracked separately from the main branch.
            </p>
          </div>

          <div class="form-group">
            <label>Session TTL (days)</label>
            <select
              name="sessionTtlDays"
              required
              data-help-id="session-create-page-session-ttl-days-select"
            >
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180" selected>
                180 days (Default)
              </option>
              <option value="365">365 days</option>
            </select>
            <p style="color: #888; font-size: 12px; margin-top: 5px;">
              Session is eligible for auto-delete after this age, only when
              inactive for at least 10 minutes.
            </p>
          </div>

          <div class="form-group">
            <label>Agent working directory (optional)</label>
            <input
              type="text"
              name="agentSubpath"
              placeholder="packages/backend"
              value={project.agentSubpath ?? ""}
              data-help-id="session-create-page-agent-subpath-input"
            />
            <p style="color: #888; font-size: 12px; margin-top: 5px;">
              Relative path within the repository where the agent will start.
              {project.agentSubpath
                ? ` Currently defaults to: ${project.agentSubpath}`
                : " Useful for monorepos."}
            </p>
          </div>

          <div class="form-group">
            <label>Branch (optional)</label>
            <input
              type="text"
              id="branch-name-input"
              name="branchName"
              placeholder="auto: uses session name"
              data-help-id="session-create-page-branch-name-input-input"
            />
            <p style="color: #888; font-size: 12px; margin-top: 5px;">
              Defaults to the session name (slugified). Edit to override, or
              clear to use the project default
              {project.newBranch ? ` (${project.newBranch})` : " (none)"}.
            </p>

            <div style="margin-top: 10px;">
              <label style="display: block; margin-bottom: 4px; font-weight: normal;">
                <input
                  type="radio"
                  name="branchMode"
                  value="new"
                  checked
                  style="margin-right: 6px;"
                  data-help-id="session-create-page-branch-mode-input"
                />
                Create new branch
                <span style="color: #888; font-size: 12px; margin-left: 4px;">
                  — clone project default, create this branch locally
                </span>
              </label>
              <label style="display: block; font-weight: normal;">
                <input
                  type="radio"
                  name="branchMode"
                  value="sync"
                  style="margin-right: 6px;"
                  data-help-id="session-create-page-branch-mode-input"
                />
                Sync existing branch
                <span style="color: #888; font-size: 12px; margin-left: 4px;">
                  — branch already exists on remote; clone it directly
                </span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>MCP Servers</label>
            <div style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; max-height: 150px; overflow-y: auto;">
              {mcpServers.length === 0 ? (
                <p style="color: #888; font-size: 12px; margin: 0;">
                  No MCP servers configured.{" "}
                  <a href="/mcp-servers" data-help-id="session-create-page-a">
                    Configure MCP servers
                  </a>
                </p>
              ) : (
                mcpServers.map((server) => (
                  <label
                    key={server.id}
                    style={{
                      display: "block",
                      margin: "5px 0",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      name="mcpServerIds"
                      value={server.id}
                      style={{ marginRight: "8px" }}
                      data-help-id="session-create-page-mcp-server-ids-input"
                    />
                    <strong>{server.name}</strong>
                    {server.description && (
                      <span style="color: #888; font-size: 12px; margin-left: 8px;">
                        - {server.description}
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>
            <p style="color: #888; font-size: 12px; margin-top: 5px;">
              Select MCP servers to attach to this session. These provide tools
              and resources to the AI agent.
            </p>
          </div>

          <div class="actions">
            <button
              type="submit"
              class="btn"
              data-help-id="session-create-page-button"
            >
              Create Session
            </button>
            <a
              href={`/projects/${project.id}/sessions`}
              class="btn-secondary"
              data-help-id="session-create-page-a"
            >
              Cancel
            </a>
          </div>

          {error && <div class="error">{error}</div>}
        </form>

        <script
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  var nameInput = document.getElementById('session-name-input');
  var branchInput = document.getElementById('branch-name-input');
  var branchManuallyEdited = false;

  if (nameInput) {
    nameInput.focus();
  }

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  branchInput.addEventListener('input', function () {
    branchManuallyEdited = true;
  });

  nameInput.addEventListener('input', function () {
    if (!branchManuallyEdited) {
      branchInput.value = slugify(nameInput.value);
    }
  });
})();
`,
          }}
        />
      </div>
    </Layout>
  );
};
