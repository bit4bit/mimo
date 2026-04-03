import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface Project {
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: Date;
  description?: string;
}

interface Session {
  id: string;
  name: string;
  projectId: string;
  owner: string;
  upstreamPath: string;
  checkoutPath: string;
  status: "active" | "paused" | "closed";
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectDetailProps {
  project: Project;
  sessions: Session[];
}

export const ProjectDetailPage: FC<ProjectDetailProps> = ({ project, sessions }) => {
  const sortedSessions = sessions.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <Layout title={project.name}>
      <div class="container" style="max-width: 800px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1>{project.name}</h1>
          <div style="display: flex; gap: 10px;">
            <a href={`/projects/${project.id}/edit`} class="btn">Edit</a>
            <a href="/projects" class="btn-secondary">Back to Projects</a>
          </div>
        </div>

        <div class="project-details">
          {project.description && (
            <div class="detail-row">
              <label>Description:</label>
              <div style="line-height: 1.6;">{project.description}</div>
            </div>
          )}
          <div class="detail-row">
            <label>Repository URL:</label>
            <div>{project.repoUrl}</div>
          </div>
          <div class="detail-row">
            <label>Repository Type:</label>
            <div>{project.repoType}</div>
          </div>
          <div class="detail-row">
            <label>Owner:</label>
            <div>{project.owner}</div>
          </div>
          <div class="detail-row">
            <label>Created:</label>
            <div>{new Date(project.createdAt).toLocaleString()}</div>
          </div>
        </div>

        <div style="margin-top: 30px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h2 style="margin: 0;">Sessions</h2>
            <a href={`/projects/${project.id}/sessions/new`} class="btn">New Session</a>
          </div>
          
          {sortedSessions.length === 0 ? (
            <div class="empty-state">
              <p>No sessions yet. Create one to start development.</p>
            </div>
          ) : (
            <div class="session-list">
              {sortedSessions.map((session) => (
                <div key={session.id} class="session-card">
                  <div class="session-header">
                    <a href={`/projects/${project.id}/sessions/${session.id}`} class="session-name">
                      {session.name}
                    </a>
                    <span class={`session-status ${session.status}`}>{session.status}</span>
                  </div>
                  <div class="session-meta">
                    <span>Created: {new Date(session.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div class="actions" style="margin-top: 30px;">
          <h2>Actions</h2>
          <form method="POST" action={`/projects/${project.id}/delete`} style="margin-top: 15px;">
            <button type="submit" class="btn-danger">Delete Project</button>
          </form>
        </div>
      </div>
    </Layout>
  );
};
