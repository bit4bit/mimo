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
    const pw = (priorityWeight[a.priority] ?? 1) - (priorityWeight[b.priority] ?? 1);
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
        <span class={`session-status ${session.status}`}>
          {session.status}
        </span>
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
    </Layout>
  );
};
