// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import { Layout } from "../../../shared/components/Layout.js";
import type {
  RepositoryResponse,
  ReferencingProject,
} from "../../../../api/rest/repositories/types.js";
import type { CredentialListResponse } from "../../../../api/rest/credentials/types.js";

interface RepositoryEditPageProps {
  repository: RepositoryResponse;
  credentials: CredentialListResponse[];
  referencingProjects: ReferencingProject[];
  error?: string;
}

export const RepositoryEditPage: FC<RepositoryEditPageProps> = ({
  repository,
  credentials,
  referencingProjects,
  error,
}) => {
  return (
    <Layout title={`Edit ${repository.name}`}>
      <div class="container">
        <h1>Edit Repository</h1>

        {error && <div class="error-message">{error}</div>}

        {referencingProjects.length > 0 && (
          <div class="referencing-projects">
            <p>
              This repository is used by {referencingProjects.length}{" "}
              project(s). Changes to its URL, credential, or port apply to all
              of them:
            </p>
            <ul>
              {referencingProjects.map((project) => (
                <li>{project.name}</li>
              ))}
            </ul>
          </div>
        )}

        <form
          method="post"
          action={`/repositories/${repository.id}/edit`}
          class="repository-form"
        >
          <div class="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={repository.name}
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
              value={repository.repoUrl}
              required
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label htmlFor="repoType">Type</label>
            <select id="repoType" name="repoType" required class="form-select">
              <option value="git" selected={repository.repoType === "git"}>
                Git
              </option>
              <option
                value="fossil"
                selected={repository.repoType === "fossil"}
              >
                Fossil
              </option>
            </select>
          </div>

          <div class="form-group">
            <label htmlFor="credentialId">Credential</label>
            <select id="credentialId" name="credentialId" class="form-select">
              <option value="" selected={!repository.credentialId}>
                None (public repository)
              </option>
              {credentials.map((credential) => (
                <option
                  value={credential.id}
                  selected={repository.credentialId === credential.id}
                >
                  {credential.name}
                </option>
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
              value={repository.clonePort ?? ""}
              class="form-input"
            />
          </div>

          <div class="form-actions">
            <button type="submit" class="btn">
              Save Changes
            </button>
            <a href="/repositories" class="btn-secondary">
              Cancel
            </a>
          </div>
        </form>
      </div>

      <style>{`
        .referencing-projects {
          border: 1px solid #5a4a2d;
          background: #2d2a1e;
          padding: 12px 16px;
          border-radius: 4px;
          margin-bottom: 16px;
        }
        .referencing-projects ul {
          margin: 8px 0 0;
        }
      `}</style>
    </Layout>
  );
};
