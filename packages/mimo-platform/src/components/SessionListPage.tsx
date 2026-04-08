import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface Project {
  id: string;
  name: string;
}

interface Session {
  id: string;
  name: string;
  status: "active" | "paused" | "closed" | "frozen";
  createdAt: Date;
}

interface SessionListProps {
  project: Project;
  sessions: Session[];
}

export const SessionListPage: FC<SessionListProps> = ({ project, sessions }) => {
  return (
    <Layout title={`Sessions - ${project.name}`}>
      <div class="container" style="max-width: 800px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1>Sessions: {project.name}</h1>
          <a href={`/projects/${project.id}/sessions/new`} class="btn">New Session</a>
        </div>

        {sessions.length === 0 ? (
          <div class="empty-state">
            <p>No sessions yet.</p>
            <a href={`/projects/${project.id}/sessions/new`} class="btn">Create your first session</a>
          </div>
        ) : (
          <div class="session-list">
            {sessions.map((session) => (
              <div key={session.id} class="session-card">
                <div class="session-header">
                  <a href={`/projects/${project.id}/sessions/${session.id}`} class="session-name">
                    {session.name}
                  </a>
                  <span class={`status-badge ${session.status}`}>{session.status}</span>
                </div>
                <div class="session-meta">
                  <span>Created: {new Date(session.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style="margin-top: 30px;">
          <a href={`/projects/${project.id}`} class="btn-secondary">Back to Project</a>
        </div>
      </div>
    </Layout>
  );
};
