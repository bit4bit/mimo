import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import { DataTable, type DataTableColumn } from "./DataTable.js";
import type { Credential } from "../credentials/repository";

interface CredentialsListPageProps {
  credentials: Credential[];
}

export const CredentialsListPage: FC<CredentialsListPageProps> = ({
  credentials,
}) => {
  const columns: DataTableColumn<Credential>[] = [
    {
      key: "name",
      label: "Name",
      render: (cred) => (
        <a href={`/credentials/${cred.id}/edit`} data-help-id="credentials-list-page-a">{cred.name}</a>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (cred) => (
        <span class={`credential-type type-${cred.type}`}>
          {cred.type.toUpperCase()}
        </span>
      ),
    },
    {
      key: "details",
      label: "Details",
      render: (cred) =>
        cred.type === "https" ? (
          <span>{cred.username} / ********</span>
        ) : (
          <span>SSH Key: ********</span>
        ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (cred) => (
        <div>
          <a href={`/credentials/${cred.id}/edit`} class="btn-secondary" data-help-id="credentials-list-page-a">
            Edit
          </a>
          <form
            method="post"
            action={`/credentials/${cred.id}/delete`}
            style="display: inline;"
          >
            <button type="submit" class="btn-danger" data-help-id="credentials-list-page-button">
              Delete
            </button>
          </form>
        </div>
      ),
    },
  ];

  return (
    <Layout title="Credentials">
      <div class="container-wide">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1>Credentials</h1>
          <a href="/credentials/new" class="btn" data-help-id="credentials-list-page-a">
            New Credential
          </a>
        </div>

        <DataTable
          rows={credentials}
          columns={columns}
          searchFields={["name"]}
          pageSize={10}
          emptyMessage="No credentials configured yet."
          emptyAction={
            <p>Create credentials to authenticate with private repositories.</p>
          }
        />
      </div>

      <style>{`
        .credential-type {
          font-size: 10px;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: bold;
        }
        .credential-type.type-https {
          background: #2d5a2d;
          color: #6bff6b;
        }
        .credential-type.type-ssh {
          background: #2d4a5a;
          color: #6bafff;
        }
      `}</style>
    </Layout>
  );
};
