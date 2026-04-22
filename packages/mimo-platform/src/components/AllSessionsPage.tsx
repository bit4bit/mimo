// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import { DataTable, type DataTableColumn } from "./DataTable.js";

interface EnrichedSession {
  id: string;
  projectId: string;
  projectName: string;
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

interface AllSessionsProps {
  sessions: EnrichedSession[];
}

export const AllSessionsPage: FC<AllSessionsProps> = ({ sessions }) => {
  const activeCount = sessions.filter((s) => s.status !== "closed").length;

  const columns: DataTableColumn<EnrichedSession>[] = [
    {
      key: "name",
      label: "Name",
      render: (session) => (
        <a
          href={`/projects/${session.projectId}/sessions/${session.id}`}
          class="session-name"
        >
          {session.name}
        </a>
      ),
    },
    {
      key: "projectName",
      label: "Project",
      render: (session) => (
        <a href={`/projects/${session.projectId}`} class="session-project">
          {session.projectName}
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
  ];

  return (
    <Layout title="Sessions">
      <div class="container-wide">
        <div
          style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;"
        >
          <div>
            <h1>Sessions</h1>
            {activeCount > 0 && (
              <span style="color: #888; font-size: 13px;">
                {activeCount} active
              </span>
            )}
          </div>
          <a href="/projects" class="btn-secondary">
            Browse Projects
          </a>
        </div>

        <DataTable
          rows={sessions}
          columns={columns}
          searchFields={["Name", "Project"]}
          pageSize={20}
          emptyMessage="No sessions yet."
          emptyAction={
            <a href="/projects/new" class="btn">
              Create a project to get started
            </a>
          }
        />
      </div>
      <style>{`
        .session-project {
          color: #888;
          text-decoration: none;
        }
        .session-project:hover {
          color: #ccc;
        }
      `}</style>
    </Layout>
  );
};
