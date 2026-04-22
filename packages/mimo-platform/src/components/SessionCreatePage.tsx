// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface Project {
  id: string;
  name: string;
  newBranch?: string;
}

interface McpServer {
  id: string;
  name: string;
  description?: string;
}

interface SessionCreateProps {
  project: Project;
  mcpServers: McpServer[];
  error?: string;
}

export const SessionCreatePage: FC<SessionCreateProps> = ({
  project,
  mcpServers,
  error,
}) => {
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
            <label>Priority</label>
            <select name="priority">
              <option value="high">High</option>
              <option value="medium" selected>
                Medium
              </option>
              <option value="low">Low</option>
            </select>
            <p class="form-help">
              Affects the order sessions appear in the list.
            </p>
          </div>

          <div class="form-group">
            <label>Session Type</label>
            <p style="color: #888; font-size: 14px;">
              Creates a worktree for isolated development. Changes will be
              tracked separately from the main branch.
            </p>
          </div>

          <div class="form-group">
            <label>Session TTL (days)</label>
            <select name="sessionTtlDays" required>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180" selected>
                180 days (Default)
              </option>
              <option value="365">365 days</option>
            </select>
            <p style="color: #888; font-size: 12px; margin-top: 5px;">
              Session is eligible for auto-delete after this age, only when
              inactive for at least 10 minutes.
            </p>
          </div>

          <div class="form-group">
            <label>Agent working directory (optional)</label>
            <input
              type="text"
              name="agentSubpath"
              placeholder="packages/backend"
            />
            <p style="color: #888; font-size: 12px; margin-top: 5px;">
              Relative path within the repository where the agent will start.
              Useful for monorepos.
            </p>
          </div>

          <div class="form-group">
            <label>Branch (optional)</label>
            <input
              type="text"
              name="branchName"
              placeholder="feature/my-session-work"
            />
            <p style="color: #888; font-size: 12px; margin-top: 5px;">
              Leave empty to use the project default
              {project.newBranch ? ` (${project.newBranch})` : " (none)"}.
            </p>

            <div style="margin-top: 10px;">
              <label style="display: block; margin-bottom: 4px; font-weight: normal;">
                <input
                  type="radio"
                  name="branchMode"
                  value="new"
                  checked
                  style="margin-right: 6px;"
                />
                Create new branch
                <span style="color: #888; font-size: 12px; margin-left: 4px;">
                  — clone project default, create this branch locally
                </span>
              </label>
              <label style="display: block; font-weight: normal;">
                <input
                  type="radio"
                  name="branchMode"
                  value="sync"
                  style="margin-right: 6px;"
                />
                Sync existing branch
                <span style="color: #888; font-size: 12px; margin-left: 4px;">
                  — branch already exists on remote; clone it directly
                </span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>MCP Servers</label>
            <div style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; max-height: 150px; overflow-y: auto;">
              {mcpServers.length === 0 ? (
                <p style="color: #888; font-size: 12px; margin: 0;">
                  No MCP servers configured.{" "}
                  <a href="/mcp-servers">Configure MCP servers</a>
                </p>
              ) : (
                mcpServers.map((server) => (
                  <label
                    key={server.id}
                    style={{
                      display: "block",
                      margin: "5px 0",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      name="mcpServerIds"
                      value={server.id}
                      style={{ marginRight: "8px" }}
                    />
                    <strong>{server.name}</strong>
                    {server.description && (
                      <span style="color: #888; font-size: 12px; margin-left: 8px;">
                        - {server.description}
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>
            <p style="color: #888; font-size: 12px; margin-top: 5px;">
              Select MCP servers to attach to this session. These provide tools
              and resources to the AI agent.
            </p>
          </div>

          <div class="actions">
            <button type="submit" class="btn">
              Create Session
            </button>
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
