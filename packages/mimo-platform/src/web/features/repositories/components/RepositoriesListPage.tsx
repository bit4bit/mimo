// SPDX-License-Identifier: AGPL-3.0-only
import type { FC } from "hono/jsx";
import { Layout } from "../../../shared/components/Layout.js";
import {
  DataTable,
  type DataTableColumn,
} from "../../agents/components/DataTable.js";
import type { RepositoryResponse } from "../../../../api/rest/repositories/types.js";
import type { CredentialListResponse } from "../../../../api/rest/credentials/types.js";

interface RepositoriesListPageProps {
  repositories: RepositoryResponse[];
  credentials: CredentialListResponse[];
  error?: string;
}

export const RepositoriesListPage: FC<RepositoriesListPageProps> = ({
  repositories,
  credentials,
  error,
}) => {
  const credentialName = (credentialId?: string) => {
    if (!credentialId) {
      return <span class="public-indicator">Public repository</span>;
    }
    const credential = credentials.find((cred) => cred.id === credentialId);
    return <span>{credential ? credential.name : "Unknown credential"}</span>;
  };

  const columns: DataTableColumn<RepositoryResponse>[] = [
    {
      key: "name",
      label: "Name",
      render: (repo) => (
        <a href={`/repositories/${repo.id}/edit`}>{repo.name}</a>
      ),
    },
    {
      key: "repoUrl",
      label: "URL",
      render: (repo) => <span class="repo-url">{repo.repoUrl}</span>,
    },
    {
      key: "repoType",
      label: "Type",
      render: (repo) => (
        <span class={`repo-type type-${repo.repoType}`}>
          {repo.repoType.toUpperCase()}
        </span>
      ),
    },
    {
      key: "credential",
      label: "Credential",
      render: (repo) => credentialName(repo.credentialId),
    },
    {
      key: "actions",
      label: "Actions",
      render: (repo) => (
        <div>
          <a href={`/repositories/${repo.id}/edit`} class="btn-secondary">
            Edit
          </a>
          <form
            method="post"
            action={`/repositories/${repo.id}/delete`}
            class="inline-form"
          >
            <button type="submit" class="btn-danger">
              Delete
            </button>
          </form>
        </div>
      ),
    },
  ];

  return (
    <Layout title="Repositories">
      <div class="container-wide">
        <div class="repositories-header-row">
          <h1>Repositories</h1>
          <a href="/repositories/new" class="btn">
            New Repository
          </a>
        </div>

        {error && <div class="error-message">{error}</div>}

        <DataTable
          rows={repositories}
          columns={columns}
          searchFields={["name", "repoUrl"]}
          pageSize={10}
          emptyMessage="No repositories configured yet."
          emptyAction={
            <p>Create repositories to pick them in your projects.</p>
          }
        />
      </div>

      <style>{`
        .repo-type {
          font-size: 10px;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: bold;
        }
        .repo-type.type-git {
          background: #2d5a2d;
          color: #6bff6b;
        }
        .repo-type.type-fossil {
          background: #2d4a5a;
          color: #6bafff;
        }
        .repo-url {
          font-family: monospace;
          font-size: 12px;
          word-break: break-all;
        }
        .public-indicator {
          opacity: 0.7;
          font-style: italic;
        }
        .inline-form { display: inline; }
        .repositories-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
      `}</style>
    </Layout>
  );
};
