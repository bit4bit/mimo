/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import type { MimoContext } from "../context/mimo-context.js";
import type { Context } from "hono";
import { DEFAULT_MIMO_HOST } from "../context/mimo-context.js";

import { Layout } from "../components/Layout.js";
import { DataTable, type DataTableColumn } from "../components/DataTable.js";
import { createAuthMiddleware } from "../auth/middleware.js";
import { createInternalApiClient } from "../api/internal/index.js";
import type {
  ListAgentsResponse,
  GetAgentResponse,
  CreateAgentResponse,
  GetCapabilitiesResponse,
  RefreshCapabilitiesResponse,
} from "../api/internal/agents/types.js";

type AgentsRoutesContext = Pick<MimoContext, "services" | "repos" | "env">;

interface AgentsRoutesDeps {
  fetchFn?: typeof fetch;
}

export function createAgentsRoutes(
  mimoContext: AgentsRoutesContext,
  deps: AgentsRoutesDeps = {},
) {
  const router = new Hono();
  const agentService = mimoContext.services.agents;
  const agentRepository = mimoContext.repos.agents;
  const sessionRepository = mimoContext.repos.sessions;
  const authMiddlewareWithContext = createAuthMiddleware(
    mimoContext.services.auth,
  );
  const platformUrl =
    mimoContext.env?.PLATFORM_URL ??
    `http://${mimoContext.env?.MIMO_HOST ?? DEFAULT_MIMO_HOST}:3000`;

  function createApiClient(c: Context) {
    return createInternalApiClient(c, mimoContext as MimoContext, {
      fetchFn: deps.fetchFn,
    });
  }

  // Agent API endpoint - uses agent JWT, not user auth
  // This endpoint is kept separate from internal API (per task 2.9)
  router.get("/me/sessions", async (c: Context) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing token" }, 401);
    }

    const token = authHeader.slice(7); // Remove "Bearer "
    const payload = await agentService.verifyAgentToken(token);
    if (!payload) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const agent = await agentRepository.findById(payload.agentId);
    if (!agent) {
      return c.json({ error: "Agent not found" }, 404);
    }

    // Get all sessions assigned to this agent
    const sessions = await sessionRepository.findByAssignedAgentId(agent.id);

    return c.json(
      sessions.map((session) => ({
        sessionId: session.id,
        projectId: session.projectId,
        sessionName: session.name,
        status: session.status,
        port: session.port,
      })),
    );
  });

  // List agents (JSON endpoint) - proxies to internal API
  router.get("/list", authMiddlewareWithContext, async (c: Context) => {
    const apiClient = createApiClient(c);
    const result = await apiClient.get<ListAgentsResponse>("/agents");

    if (result.success === false) {
      return c.json(
        { error: result.error },
        result.status as 400 | 401 | 403 | 404 | 500,
      );
    }

    return c.json(
      result.data.agents.map((a: any) => ({
        id: a.id,
        name: a.name,
        status: a.status,
      })),
    );
  });

  router.use("/*", authMiddlewareWithContext);

  // List agents (HTML page) - proxies to internal API
  router.get("/", async (c: Context) => {
    const apiClient = createApiClient(c);
    const result = await apiClient.get<ListAgentsResponse>("/agents");

    if (result.success === false) {
      return c.text(
        `Error: ${result.error}`,
        result.status as 400 | 401 | 403 | 404 | 500,
      );
    }

    const agents = result.data.agents;
    const statusFilter = c.req.query("status");
    const filteredAgents = statusFilter
      ? agents.filter((agent: any) => agent.status === statusFilter)
      : agents;

    // Fetch session counts for each agent
    const agentsWithSessionCounts = await Promise.all(
      filteredAgents.map(async (agent: any) => {
        const sessions = await sessionRepository.findByAssignedAgentId(
          agent.id,
        );
        return {
          ...agent,
          sessionCount: sessions.length,
          startedAt: new Date(agent.startedAt),
          lastActivityAt: agent.lastActivityAt
            ? new Date(agent.lastActivityAt)
            : undefined,
        };
      }),
    );

    const agentColumns: DataTableColumn<any>[] = [
      {
        key: "name",
        label: "Name",
        render: (agent) => <a href={`/agents/${agent.id}`}>{agent.name}</a>,
      },
      {
        key: "id",
        label: "ID",
        render: (agent) => (
          <span class="agent-id">{agent.id.slice(0, 8)}...</span>
        ),
      },
      {
        key: "status",
        label: "Status",
        render: (agent) => (
          <span class={`status-badge status-${agent.status}`}>
            {agent.status === "online" ? "🟢" : "🔴"} {agent.status}
          </span>
        ),
      },
      {
        key: "provider",
        label: "Provider",
        render: (agent) => agent.provider || "opencode",
      },
      {
        key: "sessionCount",
        label: "Sessions",
        render: (agent) => agent.sessionCount,
      },
      {
        key: "startedAt",
        label: "Created",
        render: (agent) => agent.startedAt.toLocaleString(),
      },
      {
        key: "lastActivityAt",
        label: "Last Active",
        render: (agent) =>
          agent.lastActivityAt ? agent.lastActivityAt.toLocaleString() : "-",
      },
      {
        key: "actions",
        label: "Actions",
        render: (agent) => (
          <div>
            <a href={`/agents/${agent.id}`} class="btn-secondary">
              View
            </a>
            <form
              method="POST"
              action={`/agents/${agent.id}/delete`}
              style="display: inline;"
            >
              <button type="submit" class="btn-danger">
                Delete
              </button>
            </form>
          </div>
        ),
      },
    ];

    return c.html(
      <Layout title="Agents">
        <div class="agents-container">
          <h1>Agents</h1>

          <div style="margin: 20px 0;">
            <a href="/agents/new" class="btn-primary">
              Create Agent
            </a>
          </div>

          <div class="filters">
            <span>Filter by status: </span>
            <a
              href="/agents"
              class={!statusFilter ? "filter-link active" : "filter-link"}
            >
              All
            </a>
            <a
              href="/agents?status=online"
              class={
                statusFilter === "online" ? "filter-link active" : "filter-link"
              }
            >
              Online
            </a>
            <a
              href="/agents?status=offline"
              class={
                statusFilter === "offline"
                  ? "filter-link active"
                  : "filter-link"
              }
            >
              Offline
            </a>
          </div>

          <DataTable
            rows={agentsWithSessionCounts}
            columns={agentColumns}
            searchFields={["name"]}
            pageSize={10}
            emptyMessage="No agents found. Create an agent to get started."
            sortBy="startedAt"
            sortDesc={true}
          />
        </div>

        <style>{`
        .agents-container { padding: 20px; }
        .btn-primary {
          background: #74c0fc;
          color: #1a1a1a;
          padding: 8px 16px;
          text-decoration: none;
          border-radius: 4px;
          font-family: monospace;
        }
        .btn-secondary {
          background: #3d3d3d;
          color: #d4d4d4;
          padding: 6px 12px;
          text-decoration: none;
          border-radius: 3px;
          margin-right: 8px;
          font-family: monospace;
        }
        .btn-danger {
          background: #ff6b6b;
          color: #1a1a1a;
          padding: 6px 12px;
          border: none;
          cursor: pointer;
          border-radius: 3px;
          font-family: monospace;
        }
        .filters { margin: 20px 0; }
        .filter-link { 
          margin-right: 15px; 
          padding: 5px 10px;
          text-decoration: none;
          color: #888;
          border: 1px solid #444;
          border-radius: 3px;
        }
        .filter-link.active { 
          background: #333; 
          color: #d4d4d4;
        }
        .filter-link:hover { background: #2d2d2d; }
        .agent-id {
          font-size: 11px;
          color: #888;
          font-family: monospace;
        }
      `}</style>
      </Layout>,
    );
  });

  // New agent form (no proxy needed - just renders form)
  router.get("/new", async (c: Context) => {
    return c.html(
      <Layout title="Create Agent">
        <div class="agent-create-container">
          <h1>Create Agent</h1>
          <p style="color: #888; margin-bottom: 20px;">
            Create an agent to run mimo-agent locally. After creation, you'll
            receive a token to use when running{" "}
            <code>mimo-agent --token=XXX --provider=PROVIDER</code>.
          </p>

          <form method="POST" action="/agents">
            <div class="form-group">
              <label for="name">Agent Name:</label>
              <input
                type="text"
                id="name"
                name="name"
                required
                maxlength="64"
                placeholder="e.g., MacBook Pro Dev"
              />
              <span class="form-help">
                A descriptive name to identify this agent
              </span>
            </div>
            <div class="form-group">
              <label for="provider">Provider:</label>
              <select id="provider" name="provider" required>
                <option value="opencode">Opencode</option>
                <option value="claude">Claude</option>
              </select>
              <span class="form-help">
                Select the AI provider this agent will use
              </span>
            </div>
            <button type="submit" class="btn-primary">
              Create Agent
            </button>
          </form>

          <a
            href="/agents"
            class="btn-secondary"
            style="display: inline-block; margin-left: 10px;"
          >
            Cancel
          </a>
        </div>

        <style>{`
        .agent-create-container { padding: 20px; max-width: 600px; }
        code {
          background: #2d2d2d;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: monospace;
        }
      `}</style>
      </Layout>,
    );
  });

  // Create agent - proxies to internal API
  router.post("/", async (c: Context) => {
    const body = await c.req.parseBody();
    const name = body.name as string;
    const provider = body.provider as "opencode" | "claude";

    if (!name || name.trim().length === 0) {
      return c.html(
        <Layout title="Create Agent">
          <div class="agent-create-container">
            <h1>Create Agent</h1>
            <div class="error-message">Name is required</div>
            <form method="POST" action="/agents">
              <div class="form-group">
                <label for="name">Agent Name:</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  maxlength="64"
                  placeholder="e.g., MacBook Pro Dev"
                />
                <span class="form-help">
                  A descriptive name to identify this agent
                </span>
              </div>
              <div class="form-group">
                <label for="provider">Provider:</label>
                <select id="provider" name="provider" required>
                  <option value="opencode">Opencode</option>
                  <option value="claude">Claude</option>
                </select>
                <span class="form-help">
                  Select the AI provider this agent will use
                </span>
              </div>
              <button type="submit" class="btn-primary">
                Create Agent
              </button>
            </form>
            <a
              href="/agents"
              class="btn-secondary"
              style="display: inline-block; margin-left: 10px;"
            >
              Cancel
            </a>
          </div>
        </Layout>,
      );
    }

    // Call internal API to create agent
    const apiClient = createApiClient(c);
    const result = await apiClient.post<CreateAgentResponse>("/agents", {
      name: name.trim(),
      provider,
    });

    if (result.success === false) {
      const errorMessage = result.error;
      return c.html(
        <Layout title="Create Agent">
          <div class="agent-create-container">
            <h1>Create Agent</h1>
            <div class="error-message">{errorMessage}</div>
            <form method="POST" action="/agents">
              <div class="form-group">
                <label for="name">Agent Name:</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  maxlength="64"
                  placeholder="e.g., MacBook Pro Dev"
                  value={name}
                />
                <span class="form-help">
                  A descriptive name to identify this agent
                </span>
              </div>
              <div class="form-group">
                <label for="provider">Provider:</label>
                <select id="provider" name="provider" required>
                  <option value="opencode" selected={provider === "opencode"}>
                    Opencode
                  </option>
                  <option value="claude" selected={provider === "claude"}>
                    Claude
                  </option>
                </select>
                <span class="form-help">
                  Select the AI provider this agent will use
                </span>
              </div>
              <button type="submit" class="btn-primary">
                Create Agent
              </button>
            </form>
            <a
              href="/agents"
              class="btn-secondary"
              style="display: inline-block; margin-left: 10px;"
            >
              Cancel
            </a>
          </div>
        </Layout>,
      );
    }

    return c.redirect(`/agents/${result.data.agent.id}?created=1`);
  });

  // Get agent - proxies to internal API
  router.get("/:id", async (c: Context) => {
    const agentId = c.req.param("id");
    const showToken = c.req.query("created") === "1";
    const showRefreshed = c.req.query("refreshed") === "1";
    const agentOffline = c.req.query("offline") === "1";

    const apiClient = createApiClient(c);
    const result = await apiClient.get<GetAgentResponse>(`/agents/${agentId}`);

    if (result.success === false) {
      return c.text(
        `Error: ${result.error}`,
        result.status === 404 ? 404 : result.status,
      );
    }

    const agent = result.data.agent;
    const sessions = await sessionRepository.findByAssignedAgentId(agentId);

    const sessionColumns: DataTableColumn<any>[] = [
      {
        key: "name",
        label: "Session Name",
        render: (session) => (
          <a href={`/projects/${session.projectId}/sessions/${session.id}`}>
            {session.name}
          </a>
        ),
      },
      {
        key: "projectId",
        label: "Project",
        render: (session) => (
          <span class="agent-id">{session.projectId.slice(0, 8)}...</span>
        ),
      },
      {
        key: "status",
        label: "Status",
        render: (session) => (
          <span class={`session-status ${session.status}`}>
            {session.status}
          </span>
        ),
      },
    ];

    return c.html(
      <Layout title={`Agent ${agent.name}`}>
        <div class="agent-detail-container">
          <div class="agent-header">
            <h1>Agent: {agent.name}</h1>
            <span class={`status-badge status-${agent.status}`}>
              {agent.status === "online" ? "🟢" : "🔴"} {agent.status}
            </span>
          </div>

          {showToken && (
            <div class="token-notice">
              <strong>Agent created!</strong> Copy the token below. You won't be
              able to see it again without visiting this page.
            </div>
          )}

          {showRefreshed && (
            <div class="refresh-notice">
              {agentOffline ? (
                <>
                  <strong>Capabilities cache cleared!</strong> Agent is
                  currently offline. New capabilities will be cached when the
                  agent reconnects.
                </>
              ) : (
                <>
                  <strong>Capabilities refreshed!</strong> Request sent to
                  agent. New capabilities will appear shortly.
                </>
              )}
            </div>
          )}

          <div class="agent-info">
            <div class="info-row">
              <label>Name:</label>
              <span class="agent-name-display">{agent.name}</span>
            </div>
            <div class="info-row">
              <label>Agent ID:</label>
              <code>{agent.id}</code>
            </div>
            <div class="info-row">
              <label>Status:</label>
              <span>{agent.status}</span>
            </div>
            <div class="info-row">
              <label>Provider:</label>
              <span>{agent.provider || "opencode"}</span>
            </div>
            <div class="info-row">
              <label>Created:</label>
              <span>{new Date(agent.startedAt).toLocaleString()}</span>
            </div>
            <div class="info-row">
              <label>Last Active:</label>
              <span>
                {agent.lastActivityAt
                  ? new Date(agent.lastActivityAt).toLocaleString()
                  : "Never"}
              </span>
            </div>

            <div class="token-section">
              <label>Token:</label>
              <div class="token-box">
                <code id="agent-token">{result.data.token}</code>
                <button
                  type="button"
                  onclick="copyToken()"
                  class="btn-secondary"
                >
                  Copy Token
                </button>
              </div>
            </div>

            <div class="capabilities-section">
              <label>Cached Capabilities:</label>
              {agent.capabilities ? (
                <div class="capabilities-box">
                  <div class="cap-row">
                    <span class="cap-label">Default Model:</span>
                    <code>{agent.capabilities.defaultModelId}</code>
                  </div>
                  <div class="cap-row">
                    <span class="cap-label">Available Models:</span>
                    <span>
                      {agent.capabilities.availableModels
                        .map((m: any) => m.name)
                        .join(", ")}
                    </span>
                  </div>
                  <div class="cap-row">
                    <span class="cap-label">Default Mode:</span>
                    <code>{agent.capabilities.defaultModeId}</code>
                  </div>
                  <div class="cap-row">
                    <span class="cap-label">Available Modes:</span>
                    <span>
                      {agent.capabilities.availableModes
                        .map((m: any) => m.name)
                        .join(", ")}
                    </span>
                  </div>
                </div>
              ) : (
                <p style="color: #888; margin: 10px 0;">
                  No capabilities cached. Agent will advertise capabilities on
                  next connection.
                </p>
              )}
            </div>
          </div>

          <div class="sessions-section">
            <h2>Sessions using this agent ({sessions.length})</h2>
            <DataTable
              rows={sessions}
              columns={sessionColumns}
              searchFields={["name"]}
              pageSize={10}
              emptyMessage="No sessions are using this agent yet."
              sortBy="createdAt"
              sortDesc={true}
            />
          </div>

          <div style="margin-top: 30px;">
            <a href="/agents" class="btn-secondary">
              Back to Agents
            </a>{" "}
            <form
              method="POST"
              action={`/agents/${agent.id}/capabilities/refresh`}
              style="display: inline; margin-left: 10px;"
            >
              <button type="submit" class="btn-secondary">
                Refresh Capabilities
              </button>
            </form>
            <form
              method="POST"
              action={`/agents/${agent.id}/delete`}
              style="display: inline; margin-left: 10px;"
            >
              <button type="submit" class="btn-danger">
                Delete Agent
              </button>
            </form>
          </div>
        </div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
        function copyToken() {
          const token = document.getElementById('agent-token').textContent;
          navigator.clipboard.writeText(token);
          alert('Token copied to clipboard!');
        }
      `,
          }}
        />

        <style>{`
        .agent-detail-container { padding: 20px; max-width: 900px; }
        .agent-header { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
        .agent-header h1 { margin: 0; }
        .status-badge {
          padding: 4px 8px;
          border-radius: 3px;
          font-size: 11px;
          text-transform: uppercase;
        }
        .status-online { background: #0b3d0b; color: #51cf66; }
        .status-offline { background: #3d0b0b; color: #ff6b6b; }
        .token-notice {
          background: #1a3d0b;
          border: 1px solid #51cf66;
          color: #51cf66;
          padding: 10px 15px;
          border-radius: 4px;
          margin-bottom: 20px;
        }
        .refresh-notice {
          background: #1a3d0b;
          border: 1px solid #51cf66;
          color: #51cf66;
          padding: 10px 15px;
          border-radius: 4px;
          margin-bottom: 20px;
        }
        .agent-info { background: #2d2d2d; padding: 20px; border-radius: 4px; margin-bottom: 20px; }
        .info-row { display: flex; gap: 10px; margin-bottom: 10px; }
        .info-row label { min-width: 120px; color: #888; }
        .info-row code { background: #1a1a1a; padding: 2px 6px; border-radius: 3px; }
        .agent-name-display { font-weight: bold; font-size: 16px; }
        .token-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid #444; }
        .token-box { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
        .token-box code {
          background: #1a1a1a;
          padding: 8px 12px;
          border-radius: 3px;
          font-size: 12px;
          word-break: break-all;
          flex: 1;
        }
        .btn-primary, .btn-secondary { padding: 8px 16px; text-decoration: none; border-radius: 4px; font-family: monospace; }
        .btn-primary { background: #74c0fc; color: #1a1a1a; border: none; cursor: pointer; }
        .btn-secondary { background: #3d3d3d; color: #d4d4d4; border: none; cursor: pointer; }
        .btn-danger { background: #ff6b6b; color: #1a1a1a; padding: 6px 12px; border: none; cursor: pointer; border-radius: 3px; }
.sessions-section { margin-top: 30px; }
.capabilities-section { margin-top: 20px; padding-top: 20px; border-top: 1px solid #444; }
.capabilities-section label { color: #888; font-weight: bold; }
.capabilities-box { margin-top: 10px; }
.cap-row { display: flex; gap: 10px; margin-bottom: 8px; }
.cap-label { min-width: 140px; color: #888; font-size: 12px; }
.cap-row code { background: #1a1a1a; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
.cap-row span { color: #d4d4d4; }
      `}</style>
      </Layout>,
    );
  });

  // Delete agent - proxies to internal API
  router.post("/:id/delete", async (c: Context) => {
    const agentId = c.req.param("id");

    const apiClient = createApiClient(c);
    const result = await apiClient.delete<unknown>(`/agents/${agentId}`);

    if (result.success === false) {
      return c.text(
        `Error: ${result.error}`,
        result.status === 404 ? 404 : result.status,
      );
    }

    return c.redirect("/agents");
  });

  // Get capabilities - proxies to internal API (JSON endpoint)
  router.get("/:id/capabilities", async (c: Context) => {
    const agentId = c.req.param("id");

    const apiClient = createApiClient(c);
    const result = await apiClient.get<GetCapabilitiesResponse>(
      `/agents/${agentId}/capabilities`,
    );

    if (result.success === false) {
      return c.json(
        { error: result.error },
        result.status as 400 | 401 | 403 | 404 | 500,
      );
    }

    return c.json(result.data.capabilities);
  });

  // Refresh capabilities - proxies to internal API
  router.post("/:id/capabilities/refresh", async (c: Context) => {
    const agentId = c.req.param("id");

    const apiClient = createApiClient(c);
    const result = await apiClient.post<RefreshCapabilitiesResponse>(
      `/agents/${agentId}/capabilities/refresh`,
      {},
    );

    if (result.success === false) {
      return c.json(
        { error: result.error },
        result.status as 400 | 401 | 403 | 404 | 500,
      );
    }

    // Redirect with appropriate message
    const requested = result.data.requested;
    const redirectUrl = requested
      ? `/agents/${agentId}?refreshed=1`
      : `/agents/${agentId}?refreshed=1&offline=1`;
    return c.redirect(redirectUrl);
  });

  return router;
}
