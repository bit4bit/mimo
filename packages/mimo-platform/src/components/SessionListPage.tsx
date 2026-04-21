import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import { DataTable, type DataTableColumn } from "./DataTable.js";

interface Project {
  id: string;
  name: string;
}

interface Session {
  id: string;
  name: string;
  status: "active" | "paused" | "closed";
  createdAt: Date;
  priority: "high" | "medium" | "low";
  sessionTtlDays: number;
  lastActivityAt: string | null;
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

interface SessionListProps {
  project: Project;
  sessions: Session[];
}

export const SessionListPage: FC<SessionListProps> = ({
  project,
  sessions,
}) => {
  const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedSessions = [...sessions].sort((a, b) => {
    const aClosed = a.status === "closed" ? 1 : 0;
    const bClosed = b.status === "closed" ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;
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
              action={`/projects/${project.id}/sessions/${session.id}/close`}
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
            action={`/projects/${project.id}/sessions/${session.id}/delete`}
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
    <Layout title={`Sessions - ${project.name}`}>
      <div class="container-wide">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1>Sessions: {project.name}</h1>
          <a href={`/projects/${project.id}/sessions/new`} class="btn">
            New Session
          </a>
        </div>

        <DataTable
          rows={sortedSessions}
          columns={columns}
          searchFields={["name"]}
          pageSize={10}
          emptyMessage="No sessions yet."
          emptyAction={
            <a href={`/projects/${project.id}/sessions/new`} class="btn">
              Create your first session
            </a>
          }
        />

        <div style="margin-top: 30px;">
          <a href={`/projects/${project.id}`} class="btn-secondary">
            Back to Project
          </a>
        </div>
      </div>
      <style>{`
        .btn-sm {
          padding: 3px 8px;
          font-size: 11px;
        }
      `}</style>
    </Layout>
  );
};
