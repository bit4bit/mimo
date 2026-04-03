/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { agentService } from "./service.js";
import { agentRepository } from "./repository.js";
import { sessionRepository } from "../sessions/repository.js";
import { projectRepository } from "../projects/repository.js";
import { Layout } from "../components/Layout.js";
import { authMiddleware } from "../auth/middleware.js";
import type { Context } from "hono";

const router = new Hono();

// Apply auth middleware to all routes
router.use("/*", authMiddleware);

// GET /agents - List all agents for current user
router.get("/", async (c: Context) => {
  const user = c.get("user") as { username: string };
  const username = user.username;

  const agents = await agentService.listAgentsByOwner(username);
  
  // Get session and project names for each agent
  const agentsWithDetails = await Promise.all(
    agents.map(async (agent) => {
      const session = await sessionRepository.findById(agent.sessionId);
      const project = await projectRepository.findById(agent.projectId);
      return {
        ...agent,
        sessionName: session?.name || "Unknown",
        projectName: project?.name || "Unknown",
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
        
        <div class="filters">
          <span>Filter by status: </span>
          <a href="/agents" class={!statusFilter ? "filter-link active" : "filter-link"}>All</a>
          <a href="/agents?status=connected" class={statusFilter === "connected" ? "filter-link active" : "filter-link"}>Connected</a>
          <a href="/agents?status=starting" class={statusFilter === "starting" ? "filter-link active" : "filter-link"}>Starting</a>
          <a href="/agents?status=failed" class={statusFilter === "failed" ? "filter-link active" : "filter-link"}>Failed</a>
        </div>

        {filteredAgents.length === 0 ? (
          <p>No agents found. Start an agent from a session.</p>
        ) : (
          <table class="agents-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Project</th>
                <th>Status</th>
                <th>PID</th>
                <th>Started</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.map((agent) => (
                <tr key={agent.id}>
                  <td>{agent.sessionName}</td>
                  <td>{agent.projectName}</td>
                  <td>
                    <span class={`status-badge status-${agent.status}`}>
                      {agent.status}
                    </span>
                  </td>
                  <td>{agent.pid || "-"}</td>
                  <td>{new Date(agent.startedAt).toLocaleString()}</td>
                  <td>
                    {(agent.status === "connected" || agent.status === "starting") && (
                      <form method="POST" action={`/agents/${agent.id}/kill`} style="display: inline;">
                        <button type="submit" class="btn btn-danger">Kill</button>
                      </form>
                    )}
                    {agent.status === "failed" && (
                      <form method="POST" action={`/agents/${agent.id}/restart`} style="display: inline;">
                        <button type="submit" class="btn btn-primary">Retry</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        .agents-container { padding: 20px; }
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
        .status-starting {
          background: #665c00;
          color: #ffd43b;
        }
        .status-connected {
          background: #0b3d0b;
          color: #51cf66;
        }
        .status-failed, .status-died {
          background: #3d0b0b;
          color: #ff6b6b;
        }
        .status-killed {
          background: #3d3d3d;
          color: #888;
        }
        .btn {
          padding: 6px 12px;
          border: none;
          cursor: pointer;
          font-family: monospace;
          font-size: 12px;
        }
        .btn-danger {
          background: #ff6b6b;
          color: #1a1a1a;
        }
        .btn-primary {
          background: #74c0fc;
          color: #1a1a1a;
        }
      `}</style>
    </Layout>
  );
});

// POST /agents/:id/kill - Terminate an agent
router.post("/:id/kill", async (c: Context) => {
  const user = c.get("user") as { username: string };
  const username = user.username;

  const agentId = c.req.param("id");
  const agent = await agentRepository.findById(agentId);
  
  if (!agent || agent.owner !== username) {
    return c.text("Agent not found", 404);
  }

  await agentService.killAgent(agentId);
  return c.redirect("/agents");
});

// POST /agents/:id/restart - Restart a failed agent
router.post("/:id/restart", async (c: Context) => {
  const user = c.get("user") as { username: string };
  const username = user.username;

  const agentId = c.req.param("id");
  const agent = await agentRepository.findById(agentId);
  
  if (!agent || agent.owner !== username) {
    return c.text("Agent not found", 404);
  }

  // Update status to allow restart
  await agentRepository.updateStatus(agentId, "starting");
  
  // Get session info for respawn
  const session = await sessionRepository.findById(agent.sessionId);
  if (!session) {
    return c.text("Session not found", 404);
  }

  // Respawn the agent
  try {
    await agentService.spawnAgent({
      sessionId: agent.sessionId,
      projectId: agent.projectId,
      owner: username,
    });
  } catch (error) {
    return c.text(`Failed to restart agent: ${(error as Error).message}`, 500);
  }

  return c.redirect("/agents");
});

export default router;
