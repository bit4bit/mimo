// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import { Layout } from "../../../shared/components/Layout.js";

interface Project {
  id: string;
  name: string;
  newBranch?: string;
  agentSubpath?: string;
  repositories: Array<{
    id: string;
    name: string;
    mountPath: string;
    repoType?: "git" | "fossil";
    newBranch?: string;
  }>;
  instructions?: string;
  color?: string;
  iconGlyph?: string;
}

interface McpServer {
  id: string;
  name: string;
  description?: string;
}

interface AgentOption {
  id: string;
  name: string;
  status: string;
}

interface SessionCreateProps {
  project: Project;
  mcpServers: McpServer[];
  agents: AgentOption[];
  error?: string;
  /** Optional verbatim session name prefill (from ?name=). */
  prefillName?: string;
  /** Optional verbatim branch name prefill (from ?branchName=). */
  prefillBranchName?: string;
  /** Optional plain-text notes prefill (from ?notes=). */
  prefillNotes?: string;
}

export const SessionCreatePage: FC<SessionCreateProps> = ({
  project,
  mcpServers,
  agents,
  error,
  prefillName,
  prefillBranchName,
  prefillNotes,
}) => {
  return (
    <Layout
      title={`New Session - ${project.name}`}
      projectId={project.id}
      projectName={project.name}
      projectColor={project.color}
      projectIconGlyph={project.iconGlyph}
    >
      <div class="container session-create-container">
        <h1>Create New Session</h1>
        <p class="text-muted session-create-project">Project: {project.name}</p>

        <form method="POST" action={`/projects/${project.id}/sessions`}>
          <div class="form-group">
            <label>Session Name</label>
            <input
              type="text"
              id="session-name-input"
              name="name"
              required
              placeholder="Feature implementation"
              value={prefillName ?? ""}
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
            <label>Instructions (optional)</label>
            <textarea
              name="instructions"
              rows="4"
              placeholder="Behavior instructions for this session (e.g., Focus on Django ORM. Review all models.)"
              class="session-create-textarea"
              data-help-id="session-create-page-instructions-textarea"
            >
              {project.instructions || ""}
            </textarea>
            <p class="session-create-help">
              These instructions will override project-level instructions for
              all threads in this session.
            </p>
          </div>

          <div class="form-group">
            <label>Session Type</label>
            <p class="text-muted">
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
            <p class="session-create-help">
              Session is eligible for auto-delete after this age, only when
              inactive for at least 10 minutes.
            </p>
          </div>

          <div class="form-group">
            <label>Idle Timeout</label>
            <select
              name="idleTimeoutMs"
              required
              data-help-id="session-create-page-idle-timeout-ms-select"
            >
              <option value="0">Never (Always Active)</option>
              <option value="60000">1 minute</option>
              <option value="120000">2 minutes</option>
              <option value="300000">5 minutes</option>
              <option value="600000" selected>
                10 minutes (Default)
              </option>
              <option value="900000">15 minutes</option>
              <option value="1800000">30 minutes</option>
            </select>
            <p class="session-create-help">
              When inactive for this duration, the ACP agent will automatically
              "park" to save resources. The agent will wake up when you send a
              new message.
            </p>
          </div>

          <div class="form-group">
            <label>Working directory (optional)</label>
            <input
              type="text"
              name="workingDirectory"
              placeholder={
                project.repositories.length > 1 ||
                (project.repositories[0] &&
                  project.repositories[0]!.mountPath !== ".")
                  ? `${project.repositories[0]!.mountPath}/packages/app`
                  : "packages/backend"
              }
              value={
                project.agentSubpath ??
                (project.repositories.length === 1
                  ? project.repositories[0]!.name
                  : "") ??
                ""
              }
              data-help-id="session-create-page-working-directory-input"
            />
            <p class="session-create-help">
              {project.repositories.length > 1 ||
              (project.repositories[0] &&
                project.repositories[0]!.mountPath !== ".")
                ? `Workspace-relative directory where the agent will start. Include the repository mount path (available: ${project.repositories.map((repo) => repo.mountPath).join(", ")}).`
                : "Relative path within the repository where the agent will start. Useful for monorepos."}
              {project.agentSubpath
                ? ` Currently defaults to: ${project.agentSubpath}`
                : ""}
            </p>
          </div>

          <div class="form-group">
            <label>Clone Port override (optional)</label>
            <input
              type="number"
              name="clonePort"
              placeholder="inherits from project"
              min="1"
              max="65535"
              data-help-id="session-create-page-clone-port-input"
            />
            <p class="session-create-help">
              Override the project's clone port for this session only (1–65535).
              Leave empty to use the project default.
            </p>
          </div>

          <div class="form-group">
            <label>Branches (optional)</label>
            <p class="session-create-help">
              Choose per repository whether to create a new branch or sync an
              existing remote branch. Leave the name empty in "new" mode to use
              the repository's project default.
            </p>

            {prefillNotes !== undefined && (
              <input type="hidden" name="notes" value={prefillNotes} />
            )}

            <div class="repo-branch-list">
              {project.repositories.map((repo) => {
                const isFossil = repo.repoType === "fossil";
                return (
                  <div
                    key={repo.id}
                    class="repo-branch-card"
                    data-repo-id={repo.id}
                  >
                    <div class="repo-branch-header">
                      <strong>{repo.name}</strong>
                      <span class="text-muted text-small">
                        {repo.mountPath}
                        {repo.repoType ? ` · ${repo.repoType}` : ""}
                      </span>
                    </div>
                    <label class="branch-mode-option mb-4">
                      <input
                        type="radio"
                        name={`branchMode_${repo.id}`}
                        value="new"
                        checked
                        class="mr-6"
                        data-help-id="session-create-page-branch-mode-input"
                      />
                      Create new branch
                      <span class="text-muted text-small ml-4">
                        — clone project default, create this branch locally
                      </span>
                    </label>
                    <label class="branch-mode-option">
                      <input
                        type="radio"
                        name={`branchMode_${repo.id}`}
                        value="sync"
                        disabled={isFossil}
                        class="mr-6"
                        data-help-id="session-create-page-branch-mode-input"
                      />
                      Sync existing branch
                      <span class="text-muted text-small ml-4">
                        {isFossil
                          ? "— not yet supported for fossil repositories"
                          : "— branch already exists on remote; clone it directly"}
                      </span>
                    </label>
                    <input
                      type="text"
                      name={`branchName_${repo.id}`}
                      class="repo-branch-input"
                      placeholder="auto: uses session name"
                      value={prefillBranchName ?? ""}
                      data-help-id="session-create-page-branch-name-input-input"
                    />
                    <p class="session-create-help repo-branch-help">
                      {repo.newBranch
                        ? `Defaults to the session name (slugified). Clear to use the project default (${repo.newBranch}).`
                        : "Defaults to the session name (slugified). Clear to use the project default."}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div class="form-group">
            <label>MCP Servers</label>
            <div class="mcp-server-list-box">
              {mcpServers.length === 0 ? (
                <p class="text-muted text-small no-margin">
                  No MCP servers configured.{" "}
                  <a href="/mcp-servers" data-help-id="session-create-page-a">
                    Configure MCP servers
                  </a>
                </p>
              ) : (
                mcpServers.map((server) => (
                  <label key={server.id} class="mcp-server-option">
                    <input
                      type="checkbox"
                      name="mcpServerIds"
                      value={server.id}
                      class="mr-8"
                      data-help-id="session-create-page-mcp-server-ids-input"
                    />
                    <strong>{server.name}</strong>
                    {server.description && (
                      <span class="text-muted text-small ml-8">
                        - {server.description}
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>
            <p class="session-create-help">
              Select MCP servers to attach to this session. These provide tools
              and resources to the AI agent.
            </p>
          </div>

          <div class="form-group">
            <label>Expert Mode (optional)</label>
            <p class="session-create-help">
              Pre-select an agent and model for the expert-mode thread. If the
              agent is online at creation time, a thread named "Expert" is
              auto-created for expert mode. Leave blank to set up expert mode
              later.
            </p>
            <label class="text-small text-muted">Agent</label>
            <select
              name="expertAgentId"
              data-help-id="session-create-page-expert-agent-id-select"
            >
              <option value="">— none —</option>
              {agents.map((agent) => (
                <option value={agent.id} disabled={agent.status !== "online"}>
                  {agent.name} ({agent.status})
                </option>
              ))}
            </select>
            <label class="text-small text-muted mt-8">Model</label>
            <select
              name="expertModelId"
              data-help-id="session-create-page-expert-model-id-select"
            >
              <option value="">— auto (agent default) —</option>
            </select>
            <p class="session-create-help">
              The model list populates from the selected agent's capabilities
              when the agent is online. The mode is auto-derived from the
              agent's default.
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
  var cards = Array.prototype.slice.call(document.querySelectorAll('.repo-branch-card'));

  if (nameInput) {
    nameInput.focus();
  }

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  var HELP_NEW_SUFFIX = 'Defaults to the session name (slugified).';
  var cardsState = cards.map(function (card) {
    var input = card.querySelector('.repo-branch-input');
    var help = card.querySelector('.repo-branch-help');
    var radios = Array.prototype.slice.call(
      card.querySelectorAll('input[type="radio"]')
    );
    // When the branch name is prefilled (e.g. from a feature's "Create
    // session" hand-off), treat it as manually edited so typing a session
    // name does not clobber the prefill.
    var state = { input: input, manuallyEdited: !!(input && input.value) };

    function currentMode() {
      var checked = card.querySelector('input[type="radio"]:checked');
      return checked ? checked.value : 'new';
    }

    radios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (!input) return;
        if (currentMode() === 'sync') {
          input.placeholder = 'e.g. main';
          if (help) help.textContent = 'Branch already exists on the remote; it is cloned directly and pushed back to.';
        } else {
          input.placeholder = 'auto: uses session name';
          if (help) help.textContent = HELP_NEW_SUFFIX;
        }
      });
    });

    if (input) {
      input.addEventListener('input', function () {
        state.manuallyEdited = true;
      });
    }
    state.currentMode = currentMode;
    return state;
  });

  if (nameInput) {
    nameInput.addEventListener('input', function () {
      var slug = slugify(nameInput.value);
      cardsState.forEach(function (state) {
        if (state.input && state.currentMode() === 'new' && !state.manuallyEdited) {
          state.input.value = slug;
        }
      });
    });
  }
})();
`,
          }}
        />
        <style>{`
          .session-create-container { max-width: 600px; }
          .session-create-project { margin-bottom: 20px; }
          .session-create-textarea { background: #2d2d2d; border: 1px solid #444; color: #d4d4d4; padding: 10px; font-family: monospace; width: 100%; }
          .session-create-help { color: #888; font-size: 12px; margin-top: 5px; }
          .branch-mode-group { margin-top: 10px; }
          .branch-mode-option { display: block; font-weight: normal; }
          .repo-branch-list { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
          .repo-branch-card { border: 1px solid #444; border-radius: 4px; padding: 10px 12px; }
          .repo-branch-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
          .repo-branch-input { margin-top: 8px; width: 100%; box-sizing: border-box; }
          .mb-4 { margin-bottom: 4px; }
          .mr-6 { margin-right: 6px; }
          .ml-4 { margin-left: 4px; }
          .ml-8 { margin-left: 8px; }
          .mr-8 { margin-right: 8px; }
          .mcp-server-list-box { border: 1px solid #ddd; border-radius: 4px; padding: 10px; max-height: 150px; overflow-y: auto; }
          .mcp-server-option { display: block; margin: 5px 0; cursor: pointer; }
          .no-margin { margin: 0; }
          .mt-8 { margin-top: 8px; }
        `}</style>
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  var agentSelect = document.querySelector('select[name="expertAgentId"]');
  var modelSelect = document.querySelector('select[name="expertModelId"]');
  if (!agentSelect || !modelSelect) return;

  function clearModels() {
    while (modelSelect.options.length > 1) modelSelect.remove(1);
    modelSelect.selectedIndex = 0;
  }

  agentSelect.addEventListener('change', function () {
    clearModels();
    var agentId = agentSelect.value;
    if (!agentId) return;
    fetch('/api/internal/agents/' + encodeURIComponent(agentId) + '/capabilities')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) {
        if (!body || !body.success || !body.data || !body.data.capabilities) return;
        var caps = body.data.capabilities;
        var models = caps.availableModels || [];
        models.forEach(function (m) {
          var opt = document.createElement('option');
          opt.value = m.value;
          opt.textContent = m.name || m.value;
          modelSelect.appendChild(opt);
        });
        if (caps.defaultModelId) modelSelect.value = caps.defaultModelId;
      })
      .catch(function () { /* ignore — leave model list empty */ });
  });
})();
`,
          }}
        />
      </div>
    </Layout>
  );
};
