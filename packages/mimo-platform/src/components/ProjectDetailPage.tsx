import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import type { Credential } from "../credentials/repository";

interface Project {
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: Date;
  description?: string;
  credentialId?: string;
  sourceBranch?: string;
  newBranch?: string;
}

interface Session {
  id: string;
  name: string;
  projectId: string;
  owner: string;
  upstreamPath: string;
  agentWorkspacePath: string;
  status: "active" | "paused" | "closed" | "frozen";
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectDetailProps {
  project: Project;
  sessions: Session[];
  credential?: Credential | null;
}

export const ProjectDetailPage: FC<ProjectDetailProps> = ({ project, sessions, credential }) => {
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
          <div class="detail-row">
            <label>Credential:</label>
            <div>
              {credential ? (
                <span>{credential.name} ({credential.type.toUpperCase()})</span>
              ) : (
                <span style="color: #888;">Public repository (no authentication)</span>
              )}
            </div>
          </div>
          {project.sourceBranch && (
            <div class="detail-row">
              <label>Source Branch:</label>
              <div>{project.sourceBranch}</div>
            </div>
          )}
          {project.newBranch && (
            <div class="detail-row">
              <label>Working Branch:</label>
              <div>{project.newBranch}</div>
            </div>
          )}
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
          <div style="display: flex; gap: 10px; margin-top: 15px;">
            <a href={`/projects/${project.id}/impacts`} class="btn-secondary">
              Impact History
            </a>
            <form method="POST" action={`/projects/${project.id}/freeze`}>
              <button type="submit" class="btn-secondary">Freeze Project</button>
            </form>
            <form method="POST" action={`/projects/${project.id}/delete`}>
              <button type="submit" class="btn-danger">Delete Project</button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};
