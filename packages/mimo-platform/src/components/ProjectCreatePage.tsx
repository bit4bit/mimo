import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import type { Credential } from "../credentials/repository";

interface ProjectCreateProps {
  error?: string;
  credentials?: Credential[];
}

export const ProjectCreatePage: FC<ProjectCreateProps> = ({ error, credentials = [] }) => {
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
            <input type="text" name="repoUrl" required placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git" />
            <small>Git or Fossil repository URL. Supports HTTPS and SSH formats.</small>
          </div>

          <div class="form-group">
            <label>Repository Type</label>
            <select name="repoType">
              <option value="git">Git</option>
              <option value="fossil">Fossil</option>
            </select>
          </div>

          <div class="form-group">
            <label>Credential (optional)</label>
            <select name="credentialId" id="credentialSelect">
              <option value="">None (public repository)</option>
              {credentials.map((cred) => (
                <option key={cred.id} value={cred.id} data-type={cred.type}>
                  {cred.name} ({cred.type.toUpperCase()})
                </option>
              ))}
            </select>
            <small>Select a credential for private repositories. Type must match URL (HTTPS for https://, SSH for git@).</small>
          </div>

          <div class="form-group">
            <label>Source Branch (optional)</label>
            <input type="text" name="sourceBranch" placeholder="main" />
            <small class="form-help">Leave empty to use repository default branch</small>
          </div>

          <div class="form-group">
            <label>New Branch (optional)</label>
            <input type="text" name="newBranch" placeholder="ai-session-my-feature" />
            <small class="form-help">Create a dedicated branch for AI sessions</small>
          </div>

          <div class="form-group">
            <label>Local Development Mirror (optional)</label>
            <input type="text" name="defaultLocalDevMirrorPath" placeholder="/home/user/myproject-dev" />
            <small class="form-help">Absolute path where agent changes will be synced in real-time for immediate testing</small>
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
