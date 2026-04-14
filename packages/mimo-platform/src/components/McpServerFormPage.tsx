/** @jsx jsx */
import { jsx } from "hono/jsx";
import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import type { McpServer } from "../mcp-servers/types.js";

interface McpServerFormPageProps {
  server?: McpServer;
  error?: string;
  isEditing?: boolean;
}

export const McpServerFormPage: FC<McpServerFormPageProps> = ({ 
  server, 
  error, 
  isEditing = false 
}) => {
  const title = isEditing ? `Edit ${server?.name}` : "New MCP Server";
  const action = isEditing ? `/mcp-servers/${server?.id}` : "/mcp-servers";
  
  return (
    <Layout title={title}>
      <div class="container" style="max-width: 600px;">
        <h1>{title}</h1>
        
        {error && (
          <div class="error-message" style="background: #5a2d2d; border: 1px solid #ff6b6b; color: #ff6b6b; padding: 10px; margin-bottom: 20px; border-radius: 4px;">
            {error}
          </div>
        )}
        
        <form method="post" action={action} class="mcp-server-form">
          {isEditing && <input type="hidden" name="_method" value="PATCH" />}
          
          <div class="form-group">
            <label htmlFor="name">
              Name *
              {isEditing && <span style="color: #666; font-size: 12px; margin-left: 10px;">(ID: {server?.id})</span>}
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
              style={isEditing ? { background: '#1a1a1a', color: '#666' } : undefined}
            />
            <p class="form-help">
              {isEditing 
                ? "Name cannot be changed after creation. ID is auto-generated from the name."
                : "A display name for this MCP server. The ID will be auto-generated from this name."
              }
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
            <p class="form-help">Optional description to help identify this server's purpose.</p>
          </div>
          
          <div class="form-group">
            <label htmlFor="command">Command *</label>
            <input
              type="text"
              id="command"
              name="command"
              placeholder="e.g., npx, node, python"
              required
              defaultValue={server?.command}
              class="form-input"
            />
            <p class="form-help">The command to run the MCP server (e.g., npx, node, python, docker).</p>
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
              defaultValue={server?.args?.join('\n')}
            />
            <p class="form-help">Command-line arguments, one per line. These will be passed to the command.</p>
          </div>
          
          <div class="form-actions">
            <button type="submit" class="btn">
              {isEditing ? "Update MCP Server" : "Create MCP Server"}
            </button>
            <a href="/mcp-servers" class="btn-secondary">Cancel</a>
          </div>
        </form>
        
        <div style="margin-top: 40px; padding: 15px; background: #2d2d2d; border: 1px solid #444; border-radius: 4px;">
          <h3 style="margin-bottom: 10px; font-size: 14px; color: #888;">Common Examples</h3>
          
          <div style="margin-bottom: 15px;">
            <strong style="color: #74c0fc; font-size: 13px;">Filesystem:</strong>
            <pre style="background: #1a1a1a; padding: 8px; margin-top: 5px; font-size: 12px; overflow-x: auto;"><code>Command: npx
Args:
  - -y
  - @modelcontextprotocol/server-filesystem
  - /path/to/project</code></pre>
          </div>
          
          <div style="margin-bottom: 15px;">
            <strong style="color: #74c0fc; font-size: 13px;">GitHub:</strong>
            <pre style="background: #1a1a1a; padding: 8px; margin-top: 5px; font-size: 12px; overflow-x: auto;"><code>Command: npx
Args:
  - -y
  - @modelcontextprotocol/server-github

Note: Requires GITHUB_TOKEN environment variable</code></pre>
          </div>
          
          <div>
            <strong style="color: #74c0fc; font-size: 13px;">PostgreSQL:</strong>
            <pre style="background: #1a1a1a; padding: 8px; margin-top: 5px; font-size: 12px; overflow-x: auto;"><code>Command: npx
Args:
  - -y
  - @modelcontextprotocol/server-postgres
  - postgresql://localhost/mydb</code></pre>
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
        
        .form-input, .form-textarea {
          width: 100%;
          background: #2d2d2d;
          border: 1px solid #444;
          color: #d4d4d4;
          padding: 10px;
          font-family: monospace;
          font-size: 14px;
          border-radius: 3px;
        }
        
        .form-input:focus, .form-textarea:focus {
          outline: none;
          border-color: #666;
        }
        
        .form-textarea {
          resize: vertical;
          min-height: 100px;
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
        
        pre code {
          color: #d4d4d4;
        }
      `}</style>
    </Layout>
  );
};
