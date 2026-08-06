// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import { Layout } from "../../../shared/components/Layout.js";
import type { CredentialListResponse } from "../../../../api/rest/credentials/types.js";

interface RepositoryCreatePageProps {
  credentials: CredentialListResponse[];
  error?: string;
}

export const RepositoryCreatePage: FC<RepositoryCreatePageProps> = ({
  credentials,
  error,
}) => {
  return (
    <Layout title="New Repository">
      <div class="container">
        <h1>New Repository</h1>

        {error && <div class="error-message">{error}</div>}

        <form method="post" action="/repositories" class="repository-form">
          <div class="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              name="name"
              placeholder="e.g., backend"
              required
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label htmlFor="repoUrl">Repository URL</label>
            <input
              type="text"
              id="repoUrl"
              name="repoUrl"
              placeholder="https://github.com/user/repo.git"
              required
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label htmlFor="repoType">Type</label>
            <select id="repoType" name="repoType" required class="form-select">
              <option value="git">Git</option>
              <option value="fossil">Fossil</option>
            </select>
          </div>

          <div class="form-group">
            <label htmlFor="credentialId">Credential</label>
            <select id="credentialId" name="credentialId" class="form-select">
              <option value="">None (public repository)</option>
              {credentials.map((credential) => (
                <option value={credential.id}>{credential.name}</option>
              ))}
            </select>
          </div>

          <div class="form-group">
            <label htmlFor="clonePort">Clone SSH Port (optional)</label>
            <input
              type="number"
              id="clonePort"
              name="clonePort"
              min={1}
              max={65535}
              placeholder="22"
              class="form-input"
            />
          </div>

          <div class="form-actions">
            <button type="submit" class="btn">
              Create Repository
            </button>
            <a href="/repositories" class="btn-secondary">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </Layout>
  );
};
