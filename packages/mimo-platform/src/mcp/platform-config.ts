// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import type { McpServerConfig } from "../mcp-servers/types.js";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function createPlatformMcpServerConfig(
  platformUrl: string,
  mcpToken: string,
): McpServerConfig {
  const baseUrl = trimTrailingSlash(platformUrl);
  return {
    type: "http",
    name: "mimo",
    url: `${baseUrl}/api/mimo-mcp`,
    headers: [{ name: "Authorization", value: `Bearer ${mcpToken}` }],
  };
}
