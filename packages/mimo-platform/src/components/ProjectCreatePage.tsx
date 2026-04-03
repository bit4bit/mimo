import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface ProjectCreateProps {
  error?: string;
}

export const ProjectCreatePage: FC<ProjectCreateProps> = ({ error }) => {
  return (
    <Layout title="Create Project">
      <div class="container">
        <h1>Create New Project</h1>
        <form method="POST" action="/projects">
          <div class="form-group">
            <label>Project Name</label>
            <input type="text" name="name" required placeholder="My Awesome Project" />
          </div>

          <div class="form-group">
            <label>Description (optional, max 500 chars, recommended ~200)</label>
            <textarea name="description" rows="3" placeholder="Describe your project..." style="background: #2d2d2d; border: 1px solid #444; color: #d4d4d4; padding: 10px; font-family: monospace; width: 100%;"></textarea>
          </div>

          <div class="form-group">
            <label>Repository URL</label>
            <input type="url" name="repoUrl" required placeholder="https://github.com/user/repo.git" />
            <small>Git or Fossil repository URL</small>
          </div>

          <div class="form-group">
            <label>Repository Type</label>
            <select name="repoType">
              <option value="git">Git</option>
              <option value="fossil">Fossil</option>
            </select>
          </div>

          <div class="actions">
            <button type="submit" class="btn">Create Project</button>
            <a href="/projects" class="btn-secondary">Cancel</a>
          </div>

          {error && <div class="error">{error}</div>}
        </form>
      </div>
    </Layout>
  );
};
