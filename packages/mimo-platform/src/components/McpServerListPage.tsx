/** @jsx jsx */
import { jsx } from "hono/jsx";
import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import { DataTable, type DataTableColumn } from "./DataTable.js";
import type { McpServer } from "../mcp-servers/types.js";

interface McpServerListPageProps {
  servers: McpServer[];
}

const truncate = (text: string, max: number) =>
  text.length <= max ? text : text.substring(0, max) + "...";

export const McpServerListPage: FC<McpServerListPageProps> = ({ servers }) => {
  const columns: DataTableColumn<McpServer>[] = [
    {
      key: "name",
      label: "Name",
      render: (server) => (
        <a href={`/mcp-servers/${server.id}/edit`}>{server.name}</a>
      ),
    },
    {
      key: "transport",
      label: "Transport",
      render: (server) => (
        <span class={`transport-badge transport-${server.transport}`}>
          {server.transport.toUpperCase()}
        </span>
      ),
    },
    {
      key: "description",
      label: "Description",
      render: (server) =>
        server.description ? (
          truncate(server.description, 60)
        ) : (
          <span style="color: #666;">No description</span>
        ),
    },
    {
      key: "endpoint",
      label: "Endpoint",
      render: (server) =>
        server.transport === "stdio" ? (
          <code>
            {truncate(`${server.command} ${server.args?.join(" ") || ""}`, 40)}
          </code>
        ) : (
          <code>{truncate(server.url || "", 40)}</code>
        ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (server) => (
        <div>
          <a href={`/mcp-servers/${server.id}/edit`} class="btn-secondary">
            Edit
          </a>
          <form
            method="post"
            action={`/mcp-servers/${server.id}/delete`}
            style="display: inline;"
            onsubmit="return confirm('Are you sure you want to delete this MCP server? Sessions using it may fail to start.')"
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
    <Layout title="MCP Servers">
      <div class="container-wide">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1>MCP Servers</h1>
          <a href="/mcp-servers/new" class="btn">
            New MCP Server
          </a>
        </div>

        <DataTable
          rows={servers}
          columns={columns}
          searchFields={["name"]}
          pageSize={10}
          emptyMessage="No MCP servers configured yet."
          emptyAction={
            <div>
              <p>
                MCP servers extend your AI agent's capabilities with tools and
                resources.
              </p>
              <a href="/mcp-servers/new" class="btn" style="margin-top: 20px;">
                Create your first MCP server
              </a>
            </div>
          }
        />
      </div>

      <style>{`
        .transport-badge {
          font-size: 10px;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: bold;
        }
        .transport-badge.transport-stdio {
          background: #2d5a2d;
          color: #6bff6b;
        }
        .transport-badge.transport-http {
          background: #5a4a2d;
          color: #ffd46b;
        }
        .transport-badge.transport-sse {
          background: #2d4a5a;
          color: #6bafff;
        }
      `}</style>
    </Layout>
  );
};
