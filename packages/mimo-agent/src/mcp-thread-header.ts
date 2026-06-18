// SPDX-License-Identifier: AGPL-3.0-only
import type { McpServerConfig } from "./types.js";

const THREAD_HEADER_NAME = "X-Mimo-Thread-Id";
const MIMO_MCP_NAME = "mimo";

/**
 * Return a copy of the MCP server configs with the calling thread stamped onto
 * the platform "mimo" MCP entry via an `X-Mimo-Thread-Id` header. The shared
 * session-level config is never mutated; only the mimo entry is cloned. Other
 * MCP server configs are passed through unchanged.
 */
export function stampThreadHeader(
  mcpServers: McpServerConfig[] | undefined,
  chatThreadId: string,
): McpServerConfig[] | undefined {
  if (!mcpServers) {
    return mcpServers;
  }

  return mcpServers.map((config) => {
    const isMimoHttp =
      "type" in config &&
      config.type === "http" &&
      config.name === MIMO_MCP_NAME;
    if (!isMimoHttp) {
      return config;
    }

    const headers = [
      ...(config.headers ?? []).filter(
        (h) => h.name !== THREAD_HEADER_NAME,
      ),
      { name: THREAD_HEADER_NAME, value: chatThreadId },
    ];
    return { ...config, headers };
  });
}
