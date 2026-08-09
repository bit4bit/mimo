// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import { Layout } from "../../../shared/components/Layout.js";
import {
  RepositoryPicker,
  type PickerRepository,
  type PickerExistingEntry,
} from "./RepositoryPicker.js";

interface Project {
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: Date;
  repositories?: PickerExistingEntry[];
  description?: string;
  credentialId?: string;
  instructions?: string;
  color?: string;
  iconGlyph?: string;
}

interface ProjectEditProps {
  project: Project;
  repositories?: PickerRepository[];
  error?: string;
  sessionCount?: number;
  activeAgentCount?: number;
}

export const ProjectEditPage: FC<ProjectEditProps> = ({
  project,
  repositories = [],
  error,
  sessionCount = 0,
  activeAgentCount = 0,
}) => {
  return (
    <Layout
      title={`Edit ${project.name}`}
      projectId={project.id}
      projectName={project.name}
      projectColor={project.color}
      projectIconGlyph={project.iconGlyph}
    >
      <div class="container">
        <h1>Edit Project</h1>
        <form method="POST" action={`/projects/${project.id}/edit`}>
          <div class="form-group">
            <label>Project Name</label>
            <input
              type="text"
              name="name"
              required
              value={project.name}
              data-help-id="project-edit-page-name-input"
            />
          </div>

          <div class="form-group">
            <label>
              Description (optional, max 500 chars, recommended ~200)
            </label>
            <textarea
              name="description"
              rows="3"
              placeholder="Describe your project..."
              class="project-textarea"
              data-help-id="project-edit-page-description-textarea"
            >
              {project.description || ""}
            </textarea>
          </div>

          <div class="form-group">
            <label>Instructions (optional)</label>
            <textarea
              name="instructions"
              rows="4"
              placeholder="Behavior instructions for the AI agent..."
              class="project-textarea"
              data-help-id="project-edit-page-instructions-textarea"
            >
              {project.instructions || ""}
            </textarea>
            <small class="form-help">
              These instructions will be used as a default for all sessions and
              threads in this project. Can be overridden at the session or
              thread level.
            </small>
          </div>

          <RepositoryPicker
            repositories={repositories}
            existing={project.repositories ?? []}
          />

          <div class="actions">
            <button
              type="submit"
              class="btn"
              data-help-id="project-edit-page-button"
            >
              Save Changes
            </button>
            <a
              href={`/projects/${project.id}`}
              class="btn-secondary"
              data-help-id="project-edit-page-a"
            >
              Cancel
            </a>
          </div>

          {error && <div class="error">{error}</div>}
        </form>

        <div class="danger-zone">
          <h2 class="danger-zone-title">Danger Zone</h2>
          <div class="danger-zone-row">
            <div class="danger-zone-info">
              <strong>Delete this project</strong>
              <p>
                Removes the project, all {sessionCount} session(s), and
                disconnects {activeAgentCount} active agent(s). This cannot be
                undone.
              </p>
            </div>
            <form
              method="POST"
              action={`/projects/${project.id}/delete`}
              onsubmit={`return confirm("Delete project \\"${project.name}"?\n\nThis will remove ${sessionCount} session(s) and disconnect ${activeAgentCount} active agent(s).\nThis action cannot be undone.");`}
            >
              <button
                type="submit"
                class="btn-danger"
                data-help-id="project-edit-page-delete-button"
              >
                Delete project
              </button>
            </form>
          </div>
        </div>

        <style>{`
          .project-textarea {
            background: #2d2d2d;
            border: 1px solid #444;
            color: #d4d4d4;
            padding: 10px;
            font-family: monospace;
            width: 100%;
          }
          .danger-zone {
            margin-top: 32px;
            padding: 16px;
            border: 1px solid #ff4444;
            border-radius: 6px;
            background: rgba(255, 68, 68, 0.05);
          }
          .danger-zone-title {
            margin: 0 0 12px 0;
            color: #ff6b6b;
            font-size: 1.1em;
          }
          .danger-zone-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
          }
          .danger-zone-info p {
            margin: 4px 0 0 0;
            color: #999;
            font-size: 0.9em;
          }
          .btn-danger {
            background: #ff4444;
            color: #fff;
            border: 1px solid #ff4444;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            white-space: nowrap;
          }
          .btn-danger:hover {
            background: #cc3333;
          }
        `}</style>
      </div>
    </Layout>
  );
};
