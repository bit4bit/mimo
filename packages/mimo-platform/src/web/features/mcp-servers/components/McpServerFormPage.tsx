// SPDX-License-Identifier: AGPL-3.0-only
/** @jsx jsx */
import { jsx } from "hono/jsx";
import type { FC } from "hono/jsx";
import { Layout } from "../../../shared/components/Layout.js";
import type { TransportType } from "../../../../domain/mcp-servers/types.js";

// Minimal MCP server interface for UI rendering
interface McpServerViewModel {
  id: string;
  name: string;
  description?: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
}

interface McpServerFormPageProps {
  server?: McpServerViewModel;
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
      <div class="container mcp-form-container">
        <h1>{title}</h1>

        {error && <div class="error-message page-error-banner">{error}</div>}

        <form method="post" action={action} class="mcp-server-form">
          {isEditing && (
            <input
              type="hidden"
              name="_method"
              value="PATCH"
              data-help-id="mcp-server-form-page--method-input"
            />
          )}

          <div class="form-group">
            <label htmlFor="name">
              Name *
              {isEditing && (
                <span class="field-meta-id">(ID: {server?.id})</span>
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
              class={`form-input ${isEditing ? "is-readonly" : ""}`}
              data-help-id="mcp-server-form-page-name-input"
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
              data-help-id="mcp-server-form-page-description-input"
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
              class={`form-select ${isEditing ? "is-readonly" : ""}`}
              onchange="toggleTransportFields()"
              data-help-id="mcp-server-form-page-transport-select"
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
                data-help-id="mcp-server-form-page-command-input"
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
                data-help-id="mcp-server-form-page-args-textarea"
              />
              <p class="form-help">
                Command-line arguments, one per line. These will be passed to
                the command.
              </p>
            </div>
          </div>

          {/* HTTP/SSE Transport Fields */}
          <div id="http-fields" class="transport-fields hidden">
            <div class="form-group">
              <label htmlFor="url">Server URL *</label>
              <input
                type="url"
                id="url"
                name="url"
                placeholder="e.g., http://localhost:3000/mcp"
                defaultValue={server?.url}
                class="form-input"
                data-help-id="mcp-server-form-page-url-input"
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
                data-help-id="mcp-server-form-page-headers-textarea"
              />
              <p class="form-help">
                Optional HTTP headers, one per line in "Key: Value" format
                (e.g., Authorization: Bearer token).
              </p>
            </div>
          </div>

          <div class="form-actions">
            <button
              type="submit"
              class="btn"
              data-help-id="mcp-server-form-page-button"
            >
              {isEditing ? "Update MCP Server" : "Create MCP Server"}
            </button>
            <a
              href="/mcp-servers"
              class="btn-secondary"
              data-help-id="mcp-server-form-page-a"
            >
              Cancel
            </a>
          </div>
        </form>

        <div class="transport-examples">
          <h3 class="transport-examples-title">Transport Type Examples</h3>

          <div class="transport-example-block">
            <strong class="transport-example-label">
              Standard I/O (stdio):
            </strong>
            <p class="transport-example-copy">
              Spawn a local process. Best for npm packages and local tools.
            </p>
            <pre class="transport-example-code">
              <code>
                Command: npx Args: - -y -
                @modelcontextprotocol/server-filesystem - /path/to/project
              </code>
            </pre>
          </div>

          <div class="transport-example-block">
            <strong class="transport-example-label">HTTP:</strong>
            <p class="transport-example-copy">
              Connect to a remote HTTP MCP server endpoint.
            </p>
            <pre class="transport-example-code">
              <code>
                URL: http://localhost:3000/mcp Headers: Authorization: Bearer
                token123
              </code>
            </pre>
          </div>

          <div>
            <strong class="transport-example-label">
              SSE (Server-Sent Events):
            </strong>
            <p class="transport-example-copy">
              Connect to an SSE-based MCP server for real-time streaming.
            </p>
            <pre class="transport-example-code">
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
        .mcp-form-container { max-width: 600px; }
        .page-error-banner {
          background: #5a2d2d;
          border: 1px solid #ff6b6b;
          color: #ff6b6b;
          padding: 10px;
          margin-bottom: 20px;
          border-radius: 4px;
        }
        .field-meta-id {
          color: #666;
          font-size: 12px;
          margin-left: 10px;
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
        .is-readonly {
          background: #1a1a1a;
          color: #666;
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
        .transport-examples {
          margin-top: 40px;
          padding: 15px;
          background: #2d2d2d;
          border: 1px solid #444;
          border-radius: 4px;
        }
        .transport-examples-title {
          margin-bottom: 10px;
          font-size: 14px;
          color: #888;
        }
        .transport-example-block { margin-bottom: 15px; }
        .transport-example-label {
          color: #74c0fc;
          font-size: 13px;
        }
        .transport-example-copy {
          color: #888;
          font-size: 12px;
          margin: 5px 0;
        }
        .transport-example-code {
          background: #1a1a1a;
          padding: 8px;
          margin-top: 5px;
          font-size: 12px;
          overflow-x: auto;
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
              stdioFields.classList.remove('hidden');
              httpFields.classList.add('hidden');
              commandInput.required = true;
              urlInput.required = false;
            } else {
              stdioFields.classList.add('hidden');
              httpFields.classList.remove('hidden');
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
