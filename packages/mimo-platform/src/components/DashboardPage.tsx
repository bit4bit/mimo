// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface Project {
  id: string;
  name: string;
  description?: string;
  repoUrl: string;
  owner: string;
  isPublic: boolean;
}

interface Agent {
  id: string;
  name: string;
  status: "online" | "offline";
  startedAt: Date;
  lastActivityAt?: Date;
}

interface Session {
  id: string;
  name: string;
  projectId: string;
  assignedAgentId?: string;
  status: "active" | "paused" | "closed";
  createdAt: Date;
}

interface DashboardProps {
  username: string;
  projects: Project[];
  agents: Agent[];
  sessions: Session[];
}

export const DashboardPage: FC<DashboardProps> = ({
  username,
  projects,
  agents,
  sessions,
}) => {
  const onlineAgents = agents.filter((a) => a.status === "online").length;
  const offlineAgents = agents.filter((a) => a.status === "offline").length;
  const activeSessions = sessions.filter((s) => s.status === "active").length;

  return (
    <Layout title="Dashboard">
      <div class="dashboard">
        <div class="dashboard-header">
          <h1>Dashboard</h1>
          <p style="color: #888;">Welcome back, {username}</p>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{projects.length}</div>
            <div class="stat-label">Projects</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{activeSessions}</div>
            <div class="stat-label">Active Sessions</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">
              <span class="online-dot">🟢</span> {onlineAgents}
              <span style="margin-left: 10px;">
                <span class="offline-dot">🔴</span> {offlineAgents}
              </span>
            </div>
            <div class="stat-label">Agents</div>
          </div>
        </div>

        <div class="dashboard-grid">
          <div class="dashboard-section">
            <div class="section-header">
              <h2>Projects</h2>
              <a href="/projects/new" class="btn-small">
                + New Project
              </a>
            </div>
            {projects.length === 0 ? (
              <div class="empty-state">
                <p>No projects yet.</p>
                <a href="/projects/new" class="btn-primary">
                  Create your first project
                </a>
              </div>
            ) : (
              <ul class="item-list">
                {projects.slice(0, 5).map((project) => (
                  <li key={project.id}>
                    <a href={`/projects/${project.id}`} class="item-link">
                      <span class="item-name">{project.name}</span>
                      <span class="item-meta">
                        {project.isPublic ? "Public" : "Private"}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {projects.length > 5 && (
              <a href="/projects" class="view-all">
                View all {projects.length} projects
              </a>
            )}
          </div>

          <div class="dashboard-section">
            <div class="section-header">
              <h2>Agents</h2>
              <a href="/agents/new" class="btn-small">
                + New Agent
              </a>
            </div>
            {agents.length === 0 ? (
              <div class="empty-state">
                <p>No agents yet.</p>
                <a href="/agents/new" class="btn-primary">
                  Create your first agent
                </a>
              </div>
            ) : (
              <ul class="item-list">
                {agents.slice(0, 5).map((agent) => (
                  <li key={agent.id}>
                    <a href={`/agents/${agent.id}`} class="item-link">
                      <span class="item-name">{agent.name}</span>
                      <span class={`status-badge status-${agent.status}`}>
                        {agent.status === "online" ? "🟢" : "🔴"} {agent.status}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {agents.length > 5 && (
              <a href="/agents" class="view-all">
                View all {agents.length} agents
              </a>
            )}
          </div>

          <div class="dashboard-section">
            <div class="section-header">
              <h2>Recent Sessions</h2>
              <a href="/sessions" class="btn-small">
                View All
              </a>
            </div>
            {sessions.length === 0 ? (
              <div class="empty-state">
                <p>No sessions yet.</p>
                <p style="color: #666; font-size: 12px;">
                  Create a project first, then add sessions.
                </p>
              </div>
            ) : (
              <ul class="item-list">
                {sessions.slice(0, 5).map((session) => {
                  const project = projects.find(
                    (p) => p.id === session.projectId,
                  );
                  return (
                    <li key={session.id}>
                      <a
                        href={`/projects/${session.projectId}/sessions/${session.id}`}
                        class="item-link"
                      >
                        <span class="item-name">{session.name}</span>
                        <span class="item-meta">
                          {project?.name || "Unknown"}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .dashboard {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .dashboard-header {
          margin-bottom: 30px;
        }
        .dashboard-header h1 {
          margin: 0 0 5px 0;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-bottom: 30px;
        }
        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
        }
        .stat-card {
          background: #2d2d2d;
          border: 1px solid #444;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
        }
        .stat-value {
          font-size: 32px;
          font-weight: bold;
          color: #74c0fc;
          margin-bottom: 5px;
        }
        .stat-label {
          color: #888;
          font-size: 14px;
          text-transform: uppercase;
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        @media (max-width: 900px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }
        .dashboard-section {
          background: #2d2d2d;
          border: 1px solid #444;
          border-radius: 8px;
          padding: 15px;
        }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 1px solid #444;
        }
        .section-header h2 {
          margin: 0;
          font-size: 16px;
        }
        .btn-small {
          background: #74c0fc;
          color: #1a1a1a;
          padding: 4px 10px;
          text-decoration: none;
          border-radius: 3px;
          font-size: 12px;
        }
        .btn-primary {
          background: #74c0fc;
          color: #1a1a1a;
          padding: 8px 16px;
          text-decoration: none;
          border-radius: 4px;
          display: inline-block;
        }
        .empty-state {
          text-align: center;
          padding: 20px;
          color: #888;
        }
        .item-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .item-list li {
          border-bottom: 1px solid #3a3a3a;
        }
        .item-list li:last-child {
          border-bottom: none;
        }
        .item-link {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 5px;
          color: #d4d4d4;
          text-decoration: none;
        }
        .item-link:hover {
          background: #363636;
        }
        .item-name {
          font-family: monospace;
        }
        .item-meta {
          color: #888;
          font-size: 12px;
        }
        .status-badge {
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          text-transform: uppercase;
        }
        .status-online {
          background: #0b3d0b;
          color: #51cf66;
        }
        .status-offline {
          background: #3d0b0b;
          color: #ff6b6b;
        }
        .view-all {
          display: block;
          text-align: center;
          padding: 10px;
          color: #888;
          text-decoration: none;
          font-size: 12px;
        }
        .view-all:hover {
          color: #d4d4d4;
        }
      `}</style>
    </Layout>
  );
};
