import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import { DataTable, type DataTableColumn } from "./DataTable.js";
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
  status: "active" | "paused" | "closed";
  createdAt: Date;
  updatedAt: Date;
  priority: "high" | "medium" | "low";
}

interface ProjectDetailProps {
  project: Project;
  sessions: Session[];
  credential?: Credential | null;
}

export const ProjectDetailPage: FC<ProjectDetailProps> = ({
  project,
  sessions,
  credential,
}) => {
  const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedSessions = [...sessions].sort((a, b) => {
    const pw =
      (priorityWeight[a.priority] ?? 1) - (priorityWeight[b.priority] ?? 1);
    if (pw !== 0) return pw;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const columns: DataTableColumn<Session>[] = [
    {
      key: "name",
      label: "Name",
      render: (session) => (
        <a
          href={`/projects/${project.id}/sessions/${session.id}`}
          class="session-name"
        >
          {session.name}
        </a>
      ),
    },
    {
      key: "priority",
      label: "Priority",
      render: (session) => (
        <span class={`session-priority ${session.priority}`}>
          {session.priority}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (session) => (
        <span class={`session-status ${session.status}`}>{session.status}</span>
      ),
    },
    {
      key: "createdAt",
      label: "Created",
      render: (session) => (
        <span class="session-time">
          {new Date(session.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <Layout title={project.name}>
      <div class="container-wide">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1>{project.name}</h1>
          <div style="display: flex; gap: 10px;">
            <a href={`/projects/${project.id}/edit`} class="btn">
              Edit
            </a>
            <a href="/projects" class="btn-secondary">
              Back to Projects
            </a>
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
                <span>
                  {credential.name} ({credential.type.toUpperCase()})
                </span>
              ) : (
                <span style="color: #888;">
                  Public repository (no authentication)
                </span>
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
            <a href={`/projects/${project.id}/sessions/new`} class="btn">
              New Session
            </a>
          </div>

          <DataTable
            rows={sortedSessions}
            columns={columns}
            searchFields={["name"]}
            pageSize={10}
            emptyMessage="No sessions yet. Create one to start development."
          />
        </div>

        <div class="actions" style="margin-top: 30px;">
          <h2>Actions</h2>
          <div style="display: flex; gap: 10px; margin-top: 15px;">
            <a href={`/projects/${project.id}/impacts`} class="btn-secondary">
              Impact History
            </a>
            <form method="POST" action={`/projects/${project.id}/delete`}>
              <button
                type="submit"
                class="btn-danger"
                onclick="return confirm('Are you sure you want to delete this project? This action cannot be undone.');"
              >
                Delete Project
              </button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};
