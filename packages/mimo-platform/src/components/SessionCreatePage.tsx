import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface Project {
  id: string;
  name: string;
}

interface Agent {
  id: string;
  status: "online" | "offline";
  startedAt: Date;
}

interface SessionCreateProps {
  project: Project;
  agents: Agent[];
  error?: string;
}

export const SessionCreatePage: FC<SessionCreateProps> = ({ project, agents, error }) => {
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
              name="name"
              required
              placeholder="Feature implementation"
            />
          </div>

          <div class="form-group">
            <label>Agent (optional)</label>
            <select name="assignedAgentId">
              <option value="">None</option>
              {agents.map((agent) => (
                <option value={agent.id}>
                  {agent.id.slice(0, 8)}... ({agent.status === "online" ? "🟢 online" : "🔴 offline"})
                </option>
              ))}
            </select>
            <p style="color: #888; font-size: 12px; margin-top: 5px;">
              Select an agent to work on this session. You can assign one later if needed.
            </p>
          </div>

          <div class="form-group">
            <label>Session Type</label>
            <p style="color: #888; font-size: 14px;">
              Creates a worktree for isolated development. Changes will be tracked separately from the main branch.
            </p>
          </div>

          <div class="actions">
            <button type="submit" class="btn">Create Session</button>
            <a href={`/projects/${project.id}/sessions`} class="btn-secondary">
              Cancel
            </a>
          </div>

          {error && <div class="error">{error}</div>}
        </form>
      </div>
    </Layout>
  );
};