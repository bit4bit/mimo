/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { agentService, AgentTokenPayload } from "./service.js";
import { agentRepository } from "./repository.js";
import { sessionRepository } from "../sessions/repository.js";
import { Layout } from "../components/Layout.js";
import { authMiddleware } from "../auth/middleware.js";
import type { Context } from "hono";

const router = new Hono();

// Agent API endpoint - uses agent JWT, not user auth
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
  
  return c.json(sessions.map(session => ({
    sessionId: session.id,
    projectId: session.projectId,
    sessionName: session.name,
    status: session.status,
    port: session.port,
  })));
});

router.use("/*", authMiddleware);

router.get("/", async (c: Context) => {
  const user = c.get("user") as { username: string };
  const username = user.username;

  const agents = await agentService.listAgentsByOwner(username);
  
  const agentsWithDetails = await Promise.all(
    agents.map(async (agent) => {
      const sessions = await sessionRepository.findByAssignedAgentId(agent.id);
      return {
        ...agent,
        sessionCount: sessions.length,
        status: agent.status,
      };
    })
  );

  const statusFilter = c.req.query("status");
  const filteredAgents = statusFilter
    ? agentsWithDetails.filter((agent) => agent.status === statusFilter)
    : agentsWithDetails;

  return c.html(
    <Layout title="Agents">
      <div class="agents-container">
        <h1>Agents</h1>
        
        <div style="margin: 20px 0;">
          <a href="/agents/new" class="btn-primary">Create Agent</a>
        </div>

        <div class="filters">
          <span>Filter by status: </span>
          <a href="/agents" class={!statusFilter ? "filter-link active" : "filter-link"}>All</a>
          <a href="/agents?status=online" class={statusFilter === "online" ? "filter-link active" : "filter-link"}>Online</a>
          <a href="/agents?status=offline" class={statusFilter === "offline" ? "filter-link active" : "filter-link"}>Offline</a>
        </div>

        {filteredAgents.length === 0 ? (
          <p>No agents found. Create an agent to get started.</p>
        ) : (
          <table class="agents-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Sessions</th>
                <th>Created</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => (
                <tr key={agent.id}>
                  <td>
                    <a href={`/agents/${agent.id}`}>{agent.id.slice(0, 8)}...</a>
                  </td>
                  <td>
                    <span class={`status-badge status-${agent.status}`}>
                      {agent.status === "online" ? "🟢" : "🔴"} {agent.status}
                    </span>
                  </td>
                  <td>{agent.sessionCount}</td>
                  <td>{new Date(agent.startedAt).toLocaleString()}</td>
                  <td>{agent.lastActivityAt ? new Date(agent.lastActivityAt).toLocaleString() : "-"}</td>
                  <td>
                    <a href={`/agents/${agent.id}`} class="btn-secondary">View</a>
                    <form method="POST" action={`/agents/${agent.id}/delete`} style="display: inline;">
                      <button type="submit" class="btn-danger">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
        .agents-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        .agents-table th,
        .agents-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #444;
        }
        .agents-table th {
          background: #2d2d2d;
          font-weight: bold;
          text-transform: uppercase;
          font-size: 12px;
          color: #888;
        }
        .status-badge {
          padding: 4px 8px;
          border-radius: 3px;
          font-size: 11px;
          text-transform: uppercase;
        }
        .status-online {
          background: #0b3d0b;
          color: #51cf66;
        }
        .status-offline {
          background: #3d0b0b;
          color: #ff6b6b;
        }
      `}</style>
    </Layout>
  );
});

router.get("/new", async (c: Context) => {
  return c.html(
    <Layout title="Create Agent">
      <div class="agent-create-container">
        <h1>Create Agent</h1>
        <p style="color: #888; margin-bottom: 20px;">
          Create an agent to run mimo-agent locally. After creation, you'll receive a token
          to use when running <code>mimo-agent --token=XXX</code>.
        </p>
        
        <form method="POST" action="/agents">
          <button type="submit" class="btn-primary">Create Agent</button>
        </form>
        
        <a href="/agents" class="btn-secondary" style="display: inline-block; margin-left: 10px;">Cancel</a>
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
    </Layout>
  );
});

router.post("/", async (c: Context) => {
  const user = c.get("user") as { username: string };
  const username = user.username;

  const agent = await agentService.createAgent({ owner: username });

  return c.redirect(`/agents/${agent.id}?created=1`);
});

router.get("/:id", async (c: Context) => {
  const user = c.get("user") as { username: string };
  const username = user.username;
  const agentId = c.req.param("id");
  const showToken = c.req.query("created") === "1";

  const agent = await agentRepository.findById(agentId);
  if (!agent || agent.owner !== username) {
    return c.text("Agent not found", 404);
  }

  const sessions = await sessionRepository.findByAssignedAgentId(agentId);

  return c.html(
    <Layout title={`Agent ${agentId.slice(0, 8)}`}>
      <div class="agent-detail-container">
        <div class="agent-header">
          <h1>Agent: {agentId.slice(0, 8)}...</h1>
          <span class={`status-badge status-${agent.status}`}>
            {agent.status === "online" ? "🟢" : "🔴"} {agent.status}
          </span>
        </div>

        {showToken && (
          <div class="token-notice">
            <strong>Agent created!</strong> Copy the token below. You won't be able to see it again without visiting this page.
          </div>
        )}

        <div class="agent-info">
          <div class="info-row">
            <label>Agent ID:</label>
            <code>{agent.id}</code>
          </div>
          <div class="info-row">
            <label>Status:</label>
            <span>{agent.status}</span>
          </div>
          <div class="info-row">
            <label>Created:</label>
            <span>{new Date(agent.startedAt).toLocaleString()}</span>
          </div>
          <div class="info-row">
            <label>Last Active:</label>
            <span>{agent.lastActivityAt ? new Date(agent.lastActivityAt).toLocaleString() : "Never"}</span>
          </div>
          
          <div class="token-section">
            <label>Token:</label>
            <div class="token-box">
              <code id="agent-token">{agent.token}</code>
              <button type="button" onclick="copyToken()" class="btn-secondary">Copy Token</button>
            </div>
          </div>
        </div>

        <div class="sessions-section">
          <h2>Sessions using this agent ({sessions.length})</h2>
          {sessions.length === 0 ? (
            <p style="color: #888;">No sessions are using this agent yet.</p>
          ) : (
            <table class="sessions-table">
              <thead>
                <tr>
                  <th>Session Name</th>
                  <th>Project</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <a href={`/projects/${session.projectId}/sessions/${session.id}`}>
                        {session.name}
                      </a>
                    </td>
                    <td>{session.projectId.slice(0, 8)}...</td>
                    <td>{session.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style="margin-top: 30px;">
          <a href="/agents" class="btn-secondary">Back to Agents</a>
          <form method="POST" action={`/agents/${agent.id}/delete`} style="display: inline; margin-left: 10px;">
            <button type="submit" class="btn-danger">Delete Agent</button>
          </form>
        </div>
      </div>

      <script>{`
        function copyToken() {
          const token = document.getElementById('agent-token').textContent;
          navigator.clipboard.writeText(token);
          alert('Token copied to clipboard!');
        }
      `}</script>

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
        .agent-info { background: #2d2d2d; padding: 20px; border-radius: 4px; margin-bottom: 20px; }
        .info-row { display: flex; gap: 10px; margin-bottom: 10px; }
        .info-row label { min-width: 120px; color: #888; }
        .info-row code { background: #1a1a1a; padding: 2px 6px; border-radius: 3px; }
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
        .sessions-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .sessions-table th, .sessions-table td { padding: 10px; text-align: left; border-bottom: 1px solid #444; }
        .sessions-table th { background: #2d2d2d; color: #888; text-transform: uppercase; font-size: 11px; }
      `}</style>
    </Layout>
  );
});

router.post("/:id/delete", async (c: Context) => {
  const user = c.get("user") as { username: string };
  const username = user.username;
  const agentId = c.req.param("id");

  const agent = await agentRepository.findById(agentId);
  if (!agent || agent.owner !== username) {
    return c.text("Agent not found", 404);
  }

  await agentService.deleteAgent(agentId);
  return c.redirect("/agents");
});

export default router;