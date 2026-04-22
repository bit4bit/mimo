// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

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
}

interface ProjectEditProps {
  project: Project;
  credentials?: Credential[];
  error?: string;
}

export const ProjectEditPage: FC<ProjectEditProps> = ({
  project,
  credentials = [],
  error,
}) => {
  return (
    <Layout title={`Edit ${project.name}`}>
      <div class="container">
        <h1>Edit Project</h1>
        <form method="POST" action={`/projects/${project.id}/edit`}>
          <div class="form-group">
            <label>Project Name</label>
            <input type="text" name="name" required value={project.name} />
          </div>

          <div class="form-group">
            <label>
              Description (optional, max 500 chars, recommended ~200)
            </label>
            <textarea
              name="description"
              rows="3"
              placeholder="Describe your project..."
              style="background: #2d2d2d; border: 1px solid #444; color: #d4d4d4; padding: 10px; font-family: monospace; width: 100%;"
            >
              {project.description || ""}
            </textarea>
          </div>

          <div class="form-group">
            <label>Repository URL</label>
            <input
              type="text"
              name="repoUrl"
              required
              value={project.repoUrl}
            />
            <small>
              Git or Fossil repository URL. Supports HTTPS and SSH formats.
            </small>
          </div>

          <div class="form-group">
            <label>Repository Type</label>
            <select name="repoType">
              <option value="git" selected={project.repoType === "git"}>
                Git
              </option>
              <option value="fossil" selected={project.repoType === "fossil"}>
                Fossil
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Credential (optional)</label>
            <select name="credentialId" id="credentialSelect">
              <option value="" selected={!project.credentialId}>
                None (public repository)
              </option>
              {credentials.map((cred) => (
                <option
                  key={cred.id}
                  value={cred.id}
                  data-type={cred.type}
                  selected={project.credentialId === cred.id}
                >
                  {cred.name} ({cred.type.toUpperCase()})
                </option>
              ))}
            </select>
            <small>
              Select a credential for private repositories. Type must match URL
              (HTTPS for https://, SSH for git@).
            </small>
          </div>

          <div class="actions">
            <button type="submit" class="btn">
              Save Changes
            </button>
            <a href={`/projects/${project.id}`} class="btn-secondary">
              Cancel
            </a>
          </div>

          {error && <div class="error">{error}</div>}
        </form>
      </div>
    </Layout>
  );
};
