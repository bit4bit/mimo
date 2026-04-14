/** @jsx jsx */
import { jsx } from "hono/jsx";
import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import type { McpServer } from "../mcp-servers/types.js";

interface McpServerListPageProps {
  servers: McpServer[];
}

export const McpServerListPage: FC<McpServerListPageProps> = ({ servers }) => {
  return (
    <Layout title="MCP Servers">
      <div class="container" style="max-width: 800px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1>MCP Servers</h1>
          <a href="/mcp-servers/new" class="btn">New MCP Server</a>
        </div>
        
        {servers.length === 0 ? (
          <div class="empty-state">
            <p>No MCP servers configured yet.</p>
            <p>MCP servers extend your AI agent's capabilities with tools and resources.</p>
            <a href="/mcp-servers/new" class="btn" style="margin-top: 20px;">Create your first MCP server</a>
          </div>
        ) : (
          <div class="mcp-servers-list">
            {servers.map((server) => (
              <div key={server.id} class="mcp-server-card">
                <div class="mcp-server-header">
                  <div class="mcp-server-name">{server.name}</div>
                  <div class="mcp-server-id">ID: {server.id}</div>
                </div>
                
                {server.description && (
                  <div class="mcp-server-description">{server.description}</div>
                )}
                
                <div class="mcp-server-command">
                  <code>{server.command} {server.args.join(' ')}</code>
                </div>
                
                <div class="mcp-server-actions">
                  <a href={`/mcp-servers/${server.id}/edit`} class="btn-secondary">Edit</a>
                  <form method="post" action={`/mcp-servers/${server.id}/delete`} style="display: inline;" 
                        onsubmit="return confirm('Are you sure you want to delete this MCP server? Sessions using it may fail to start.')">
                    <button type="submit" class="btn-danger">Delete</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <style>{`
        .mcp-servers-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }
        
        .mcp-server-card {
          background: #2d2d2d;
          border: 1px solid #444;
          padding: 15px;
          border-radius: 4px;
        }
        
        .mcp-server-card:hover {
          border-color: #555;
        }
        
        .mcp-server-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .mcp-server-name {
          font-weight: bold;
          font-size: 16px;
          color: #74c0fc;
        }
        
        .mcp-server-id {
          font-size: 12px;
          color: #666;
          font-family: monospace;
        }
        
        .mcp-server-description {
          color: #888;
          font-size: 14px;
          margin-bottom: 10px;
        }
        
        .mcp-server-command {
          background: #1a1a1a;
          border: 1px solid #333;
          padding: 10px;
          border-radius: 3px;
          margin-bottom: 15px;
          overflow-x: auto;
        }
        
        .mcp-server-command code {
          font-family: monospace;
          font-size: 13px;
          color: #d4d4d4;
          white-space: pre-wrap;
          word-break: break-all;
        }
        
        .mcp-server-actions {
          display: flex;
          gap: 10px;
        }
        
        .mcp-server-actions form {
          margin: 0;
        }
      `}</style>
    </Layout>
  );
};
