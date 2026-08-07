// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import { Layout } from "../../../shared/components/Layout.js";
import { RepositoryPicker, type PickerRepository } from "./RepositoryPicker.js";

interface ProjectCreateProps {
  error?: string;
  repositories?: PickerRepository[];
  defaultInstructions?: string;
}

export const ProjectCreatePage: FC<ProjectCreateProps> = ({
  error,
  repositories = [],
  defaultInstructions = "Before performing any task, try to locate and read the file `AGENTS.md` if not found inform the user and continue.",
}) => {
  return (
    <Layout title="Create Project">
      <div class="container">
        <h1>Create New Project</h1>
        <form method="POST" action="/projects">
          <div class="form-group">
            <label>Project Name</label>
            <input
              type="text"
              name="name"
              required
              placeholder="My Awesome Project"
              data-help-id="project-create-page-name-input"
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
              data-help-id="project-create-page-description-textarea"
            ></textarea>
          </div>

          <div class="form-group">
            <label>Instructions (optional)</label>
            <textarea
              name="instructions"
              rows="4"
              placeholder="Behavior instructions for the AI agent (e.g., You are a Python expert. Focus on clean code.)"
              class="project-textarea"
              data-help-id="project-create-page-instructions-textarea"
            >
              {defaultInstructions}
            </textarea>
            <small class="form-help">
              These instructions will be used as a default for all sessions and
              threads in this project. Can be overridden at the session or
              thread level.
            </small>
          </div>

          <RepositoryPicker repositories={repositories} />

          <div class="form-group">
            <label>Agent Working Directory (optional)</label>
            <input
              type="text"
              name="agentSubpath"
              placeholder="packages/backend"
              data-help-id="project-create-page-agent-subpath-input"
            />
            <small class="form-help">
              Relative path within the repository where agent sessions will
              start. Useful for monorepos.
            </small>
          </div>

          <div class="actions">
            <button
              type="submit"
              class="btn"
              data-help-id="project-create-page-button"
            >
              Create Project
            </button>
            <a
              href="/projects"
              class="btn-secondary"
              data-help-id="project-create-page-a"
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
