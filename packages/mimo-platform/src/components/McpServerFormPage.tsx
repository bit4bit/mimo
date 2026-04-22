// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

/** @jsx jsx */
import { jsx } from "hono/jsx";
import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import type { McpServer, TransportType } from "../mcp-servers/types.js";

interface McpServerFormPageProps {
  server?: McpServer;
  error?: string;
  isEditing?: boolean;
}

export const McpServerFormPage: FC<McpServerFormPageProps> = ({
  server,
  error,
  isEditing = false,
}) => {
  const title = isEditing ? `Edit ${server?.name}` : "New MCP Server";
  const action = isEditing ? `/mcp-servers/${server?.id}` : "/mcp-servers";
  const transport: TransportType = server?.transport || "stdio";

  return (
    <Layout title={title}>
      <div class="container" style="max-width: 600px;">
        <h1>{title}</h1>

        {error && (
          <div
            class="error-message"
            style="background: #5a2d2d; border: 1px solid #ff6b6b; color: #ff6b6b; padding: 10px; margin-bottom: 20px; border-radius: 4px;"
          >
            {error}
          </div>
        )}

        <form method="post" action={action} class="mcp-server-form">
          {isEditing && <input type="hidden" name="_method" value="PATCH" />}

          <div class="form-group">
            <label htmlFor="name">
              Name *
              {isEditing && (
                <span style="color: #666; font-size: 12px; margin-left: 10px;">
                  (ID: {server?.id})
                </span>
              )}
            </label>
            <input
              type="text"
              id="name"
              name="name"
              placeholder="e.g., Filesystem, GitHub, PostgreSQL"
              required
              defaultValue={server?.name}
              disabled={isEditing}
              class="form-input"
              style={
                isEditing ? { background: "#1a1a1a", color: "#666" } : undefined
              }
            />
            <p class="form-help">
              {isEditing
                ? "Name cannot be changed after creation. ID is auto-generated from the name."
                : "A display name for this MCP server. The ID will be auto-generated from this name."}
            </p>
          </div>

          <div class="form-group">
            <label htmlFor="description">Description</label>
            <input
              type="text"
              id="description"
              name="description"
              placeholder="e.g., Access to project files"
              defaultValue={server?.description}
              class="form-input"
            />
            <p class="form-help">
              Optional description to help identify this server's purpose.
            </p>
          </div>

          <div class="form-group">
            <label htmlFor="transport">Transport Type *</label>
            <select
              id="transport"
              name="transport"
              required
              class="form-select"
              defaultValue={transport}
              disabled={isEditing}
              style={
                isEditing ? { background: "#1a1a1a", color: "#666" } : undefined
              }
              onchange="toggleTransportFields()"
            >
              <option value="stdio">
                Standard I/O (stdio) - Spawn local process
              </option>
              <option value="http">
                HTTP - Connect to remote HTTP endpoint
              </option>
              <option value="sse">SSE - Server-Sent Events endpoint</option>
            </select>
            <p class="form-help">
              {isEditing
                ? "Transport type cannot be changed after creation."
                : "Choose how to connect to this MCP server."}
            </p>
          </div>

          {/* Stdio Transport Fields */}
          <div id="stdio-fields" class="transport-fields">
            <div class="form-group">
              <label htmlFor="command">Command *</label>
              <input
                type="text"
                id="command"
                name="command"
                placeholder="e.g., npx, node, python"
                defaultValue={server?.command}
                class="form-input"
              />
              <p class="form-help">
                The command to run the MCP server (e.g., npx, node, python,
                docker).
              </p>
            </div>

            <div class="form-group">
              <label htmlFor="args">Arguments</label>
              <textarea
                id="args"
                name="args"
                placeholder={`-y
@modelcontextprotocol/server-filesystem
.`}
                rows={5}
                class="form-textarea"
                defaultValue={server?.args?.join("\n")}
              />
              <p class="form-help">
                Command-line arguments, one per line. These will be passed to
                the command.
              </p>
            </div>
          </div>

          {/* HTTP/SSE Transport Fields */}
          <div id="http-fields" class="transport-fields" style="display: none;">
            <div class="form-group">
              <label htmlFor="url">Server URL *</label>
              <input
                type="url"
                id="url"
                name="url"
                placeholder="e.g., http://localhost:3000/mcp"
                defaultValue={server?.url}
                class="form-input"
              />
              <p class="form-help">
                The URL of the MCP server endpoint (HTTP or SSE).
              </p>
            </div>

            <div class="form-group">
              <label htmlFor="headers">HTTP Headers</label>
              <textarea
                id="headers"
                name="headers"
                placeholder={`Authorization: Bearer token123
X-Custom-Header: value`}
                rows={4}
                class="form-textarea"
                defaultValue={
                  server?.headers
                    ? Object.entries(server.headers)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("\n")
                    : ""
                }
              />
              <p class="form-help">
                Optional HTTP headers, one per line in "Key: Value" format
                (e.g., Authorization: Bearer token).
              </p>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn">
              {isEditing ? "Update MCP Server" : "Create MCP Server"}
            </button>
            <a href="/mcp-servers" class="btn-secondary">
              Cancel
            </a>
          </div>
        </form>

        <div style="margin-top: 40px; padding: 15px; background: #2d2d2d; border: 1px solid #444; border-radius: 4px;">
          <h3 style="margin-bottom: 10px; font-size: 14px; color: #888;">
            Transport Type Examples
          </h3>

          <div style="margin-bottom: 15px;">
            <strong style="color: #74c0fc; font-size: 13px;">
              Standard I/O (stdio):
            </strong>
            <p style="color: #888; font-size: 12px; margin: 5px 0;">
              Spawn a local process. Best for npm packages and local tools.
            </p>
            <pre style="background: #1a1a1a; padding: 8px; margin-top: 5px; font-size: 12px; overflow-x: auto;">
              <code>
                Command: npx Args: - -y -
                @modelcontextprotocol/server-filesystem - /path/to/project
              </code>
            </pre>
          </div>

          <div style="margin-bottom: 15px;">
            <strong style="color: #74c0fc; font-size: 13px;">HTTP:</strong>
            <p style="color: #888; font-size: 12px; margin: 5px 0;">
              Connect to a remote HTTP MCP server endpoint.
            </p>
            <pre style="background: #1a1a1a; padding: 8px; margin-top: 5px; font-size: 12px; overflow-x: auto;">
              <code>
                URL: http://localhost:3000/mcp Headers: Authorization: Bearer
                token123
              </code>
            </pre>
          </div>

          <div>
            <strong style="color: #74c0fc; font-size: 13px;">
              SSE (Server-Sent Events):
            </strong>
            <p style="color: #888; font-size: 12px; margin: 5px 0;">
              Connect to an SSE-based MCP server for real-time streaming.
            </p>
            <pre style="background: #1a1a1a; padding: 8px; margin-top: 5px; font-size: 12px; overflow-x: auto;">
              <code>
                URL: http://localhost:3000/sse Headers: X-API-Key: secret123
              </code>
            </pre>
          </div>
        </div>
      </div>

      <style>{`
        .mcp-server-form {
          margin-top: 20px;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-group label {
          display: block;
          color: #888;
          font-size: 12px;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        
        .form-input, .form-textarea, .form-select {
          width: 100%;
          background: #2d2d2d;
          border: 1px solid #444;
          color: #d4d4d4;
          padding: 10px;
          font-family: monospace;
          font-size: 14px;
          border-radius: 3px;
        }
        
        .form-input:focus, .form-textarea:focus, .form-select:focus {
          outline: none;
          border-color: #666;
        }
        
        .form-textarea {
          resize: vertical;
          min-height: 100px;
        }
        
        .form-select option {
          background: #2d2d2d;
          color: #d4d4d4;
        }
        
        .form-help {
          color: #666;
          font-size: 12px;
          margin-top: 5px;
        }
        
        .form-actions {
          margin-top: 30px;
          display: flex;
          gap: 10px;
        }
        
        .transport-fields {
          border-left: 3px solid #74c0fc;
          padding-left: 15px;
          margin-bottom: 20px;
        }
        
        pre code {
          color: #d4d4d4;
        }
      `}</style>

      <script
        dangerouslySetInnerHTML={{
          __html: `
          function toggleTransportFields() {
            const transport = document.getElementById('transport').value;
            const stdioFields = document.getElementById('stdio-fields');
            const httpFields = document.getElementById('http-fields');
            
            // Update required attributes
            const commandInput = document.getElementById('command');
            const urlInput = document.getElementById('url');
            
            if (transport === 'stdio') {
              stdioFields.style.display = 'block';
              httpFields.style.display = 'none';
              commandInput.required = true;
              urlInput.required = false;
            } else {
              stdioFields.style.display = 'none';
              httpFields.style.display = 'block';
              commandInput.required = false;
              urlInput.required = true;
            }
          }
          
          // Initialize on page load
          toggleTransportFields();
        `,
        }}
      />
    </Layout>
  );
};
