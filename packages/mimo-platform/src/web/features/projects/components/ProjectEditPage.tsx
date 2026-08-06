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
}

export const ProjectEditPage: FC<ProjectEditProps> = ({
  project,
  repositories = [],
  error,
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
        <style>{`
          .project-textarea {
            background: #2d2d2d;
            border: 1px solid #444;
            color: #d4d4d4;
            padding: 10px;
            font-family: monospace;
            width: 100%;
          }
        `}</style>
      </div>
    </Layout>
  );
};
