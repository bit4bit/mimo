import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import { DataTable, type DataTableColumn } from "./DataTable.js";

interface Project {
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  sourceBranch?: string;
  newBranch?: string;
}

interface Session {
  id: string;
  name: string;
  status: "active" | "paused" | "closed";
  createdAt: Date;
  priority: "high" | "medium" | "low";
  sessionTtlDays: number;
}

interface SelectedCredential {
  name: string;
}

interface ProjectsSessionsPageProps {
  projects: Project[];
  selectedProject: Project | null;
  selectedProjectId?: string;
  selectedProjectSessions: Session[];
  selectedCredential: SelectedCredential | null;
}

function expiresInDays(createdAt: Date, sessionTtlDays: number): number {
  const expiresAt = new Date(createdAt).getTime() + sessionTtlDays * 86400000;
  return Math.ceil((expiresAt - Date.now()) / 86400000);
}

function expiresLabel(createdAt: Date, sessionTtlDays: number): string {
  const days = expiresInDays(createdAt, sessionTtlDays);
  if (days <= 0) return "expired";
  if (days === 1) return "in 1d";
  return `in ${days}d`;
}

function expiresFullDate(createdAt: Date, sessionTtlDays: number): string {
  const expiresAt = new Date(
    new Date(createdAt).getTime() + sessionTtlDays * 86400000,
  );
  return expiresAt.toLocaleDateString();
}

function expiresColor(createdAt: Date, sessionTtlDays: number): string {
  const days = expiresInDays(createdAt, sessionTtlDays);
  if (days <= 7) return "#ff6b6b";
  if (days <= 14) return "#ffd43b";
  return "#888";
}

export const ProjectsSessionsPage: FC<ProjectsSessionsPageProps> = ({
  projects,
  selectedProject,
  selectedProjectId,
  selectedProjectSessions,
  selectedCredential,
}) => {
  const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedSessions = [...selectedProjectSessions].sort((a, b) => {
    const aClosed = a.status === "closed" ? 1 : 0;
    const bClosed = b.status === "closed" ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;
    const pw =
      (priorityWeight[a.priority] ?? 1) - (priorityWeight[b.priority] ?? 1);
    if (pw !== 0) return pw;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const selectedProjectBranch =
    selectedProject?.sourceBranch ?? selectedProject?.newBranch ?? null;

  const columns: DataTableColumn<Session>[] = [
    {
      key: "name",
      label: "Name",
      render: (session) => (
        <a
          href={`/projects/${selectedProject?.id}/sessions/${session.id}`}
          class="session-name"
          target={`session-${session.id}`}
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
          {new Date(session.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: "expires",
      label: "Expires",
      render: (session) => (
        <span
          class="session-time"
          title={`Expires on ${expiresFullDate(session.createdAt, session.sessionTtlDays)}`}
          style={`color: ${expiresColor(session.createdAt, session.sessionTtlDays)}`}
        >
          {expiresLabel(session.createdAt, session.sessionTtlDays)}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (session) => (
        <div style="display: flex; gap: 6px;">
          {session.status !== "closed" && (
            <form
              method="POST"
              action={`/projects/${selectedProject?.id}/sessions/${session.id}/close`}
              style="display: inline;"
              onsubmit={`return confirm('Close session "${session.name}"? It will become read-only.')`}
            >
              <button type="submit" class="btn-secondary btn-sm">
                Close
              </button>
            </form>
          )}
          <form
            method="POST"
            action={`/projects/${selectedProject?.id}/sessions/${session.id}/delete`}
            style="display: inline;"
            onsubmit={`return confirm('Delete session "${session.name}"? This cannot be undone.')`}
          >
            <button type="submit" class="btn-danger btn-sm">
              Delete
            </button>
          </form>
        </div>
      ),
    },
  ];

  return (
    <Layout title="Projects">
      <div class="container-wide projects-sessions-page">
        <aside class="projects-pane">
          <div class="pane-header">
            <h1>Projects</h1>
            <a href="/projects/new" class="btn-secondary pane-btn">
              Create Project
            </a>
          </div>

          {projects.length === 0 ? (
            <div class="empty-state">
              <p>No projects yet.</p>
              <a href="/projects/new" class="btn-secondary pane-btn">
                Create your first project
              </a>
            </div>
          ) : (
            <div class="project-list-pane">
              {projects.map((project) => {
                const isSelected = project.id === selectedProjectId;
                return (
                  <div
                    key={project.id}
                    class={`project-row ${isSelected ? "selected" : ""}`}
                  >
                    <a href={`/projects?selected=${project.id}`} class="project-row-name">
                      {project.name}
                    </a>
                    <div class="project-row-actions">
                      <a href={`/projects/${project.id}/edit`} title="Edit project">
                        ✎
                      </a>
                      <a
                        href={`/projects/${project.id}/impacts`}
                        title="View impact history"
                      >
                        📊
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        <section class="sessions-pane">
          {!selectedProject ? (
            <div class="empty-selection-state">
              <h2>Select a project</h2>
              <p>Choose a project from the left panel to view sessions.</p>
            </div>
          ) : (
            <>
              <div class="pane-header sessions-header">
                <div>
                  <h2>Sessions for {selectedProject.name}</h2>
                  <div class="project-metadata">
                    <span>{selectedProject.repoType.toUpperCase()}</span>
                    <span>{selectedProject.repoUrl}</span>
                    <span>{selectedProjectBranch || "No branch"}</span>
                    <span>
                      {selectedCredential
                        ? `Credential: ${selectedCredential.name}`
                        : "Credential: none"}
                    </span>
                  </div>
                </div>
                <div class="sessions-header-actions">
                  <a href={`/projects/${selectedProject.id}/edit`} title="Edit project">
                    ✎
                  </a>
                  <a
                    href={`/projects/${selectedProject.id}/impacts`}
                    title="View impact history"
                  >
                    📊
                  </a>
                  <a
                    href={`/projects/${selectedProject.id}/sessions/new`}
                    class="btn-secondary pane-btn"
                  >
                    + New Session
                  </a>
                </div>
              </div>

              <DataTable
                rows={sortedSessions}
                columns={columns}
                searchFields={["name"]}
                pageSize={10}
                emptyMessage="No sessions yet."
                emptyAction={
                  <a
                    href={`/projects/${selectedProject.id}/sessions/new`}
                    class="btn-secondary pane-btn"
                  >
                    Create your first session
                  </a>
                }
              />
            </>
          )}
        </section>
      </div>

      <style>{`
        .projects-sessions-page {
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 16px;
          min-height: calc(100vh - 85px);
          overflow: hidden;
        }
        .projects-pane,
        .sessions-pane {
          background: #202020;
          border: 1px solid #3a3a3a;
          border-radius: 4px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .pane-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .pane-header h1,
        .pane-header h2 {
          margin: 0;
        }
        .project-list-pane {
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .project-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border: 1px solid #3a3a3a;
          border-radius: 4px;
          background: #262626;
        }
        .project-row.selected {
          border-color: #74c0fc;
          background: #1f2b34;
        }
        .project-row-name {
          flex: 1;
          font-weight: bold;
          color: #d4d4d4;
        }
        .project-row-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }
        .sessions-header {
          align-items: flex-start;
        }
        .sessions-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 15px;
        }
        .project-metadata {
          margin-top: 6px;
          color: #999;
          font-size: 12px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .project-metadata span::after {
          content: "\00b7";
          margin-left: 10px;
          color: #666;
        }
        .project-metadata span:last-child::after {
          content: "";
          margin: 0;
        }
        .empty-selection-state {
          text-align: center;
          margin: auto 0;
          color: #999;
        }
        .btn-sm {
          padding: 3px 8px;
          font-size: 11px;
        }
        .pane-btn {
          padding: 6px 12px;
          font-size: 12px;
          margin-left: 0;
        }
      `}</style>
    </Layout>
  );
};
