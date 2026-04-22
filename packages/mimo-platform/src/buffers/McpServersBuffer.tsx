// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import type { FC } from "hono/jsx";
import type { BufferProps } from "./types.js";
import type { McpServer } from "../mcp-servers/types.js";

interface McpServersBufferProps extends BufferProps {
  servers?: McpServer[];
}

export const McpServersBuffer: FC<McpServersBufferProps> = ({
  servers = [],
}) => {
  return (
    <div class="buffer" id="mcp-servers-buffer">
      <div class="buffer-header">
        <span>MCP Servers</span>
        <button
          type="button"
          id="mcp-right-frame-toggle-btn"
          class="mcp-frame-toggle"
          title="Collapse right frame"
          aria-label="Collapse right frame"
        >
          &lt;&lt;
        </button>
      </div>
      <div class="buffer-content mcp-servers-content">
        {servers.length === 0 ? (
          <p class="mcp-empty">No MCP servers attached to this session.</p>
        ) : (
          servers.map((server) => (
            <div class="mcp-server-card" key={server.id}>
              <div class="mcp-server-header">
                <span class="mcp-server-name">{server.name}</span>
                <span
                  class={`mcp-transport-badge mcp-transport-${server.transport}`}
                >
                  {server.transport}
                </span>
              </div>
              {server.description && (
                <div class="mcp-server-desc">{server.description}</div>
              )}
              <div class="mcp-server-detail">
                {server.transport === "stdio" ? (
                  <code class="mcp-command">
                    {server.command}
                    {server.args && server.args.length > 0
                      ? " " + server.args.join(" ")
                      : ""}
                  </code>
                ) : (
                  <code class="mcp-command">{server.url}</code>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`
        .mcp-servers-content {
          padding: 12px;
        }
        .mcp-empty {
          color: #888;
          font-size: 12px;
          font-style: italic;
          margin: 0;
        }
        .mcp-server-card {
          background: #2d2d2d;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 10px 12px;
          margin-bottom: 8px;
        }
        .mcp-server-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
        }
        .mcp-server-name {
          font-weight: 500;
          color: #d4d4d4;
          font-size: 13px;
        }
        .mcp-transport-badge {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 3px;
          text-transform: uppercase;
          font-family: monospace;
        }
        .mcp-transport-stdio {
          background: #1a3a1a;
          color: #51cf66;
          border: 1px solid #2d5a2d;
        }
        .mcp-transport-http {
          background: #1a2a3a;
          color: #74c0fc;
          border: 1px solid #2d4a6a;
        }
        .mcp-transport-sse {
          background: #3a2a1a;
          color: #ffd43b;
          border: 1px solid #6a4a2d;
        }
        .mcp-server-desc {
          font-size: 11px;
          color: #888;
          margin-bottom: 4px;
        }
        .mcp-command {
          font-size: 11px;
          color: #aaa;
          word-break: break-all;
        }
        .mcp-frame-toggle {
          margin-left: auto;
          border: 1px solid #454545;
          background: #232323;
          color: #bdbdbd;
          border-radius: 3px;
          cursor: pointer;
          font-family: monospace;
          font-size: 11px;
          padding: 2px 7px;
          line-height: 1;
        }
        .mcp-frame-toggle:hover {
          background: #333;
          border-color: #666;
        }
      `}</style>
    </div>
  );
};
