// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { stampThreadHeader } from "../src/mcp-thread-header.js";
import type { McpServerConfig } from "../src/types.js";

const mimoConfig: McpServerConfig = {
  type: "http",
  name: "mimo",
  url: "http://localhost/api/mimo-mcp",
  headers: [{ name: "Authorization", value: "Bearer session-token" }],
};

describe("stampThreadHeader", () => {
  it("appends X-Mimo-Thread-Id to the mimo entry, preserving Authorization", () => {
    const [stamped] = stampThreadHeader([mimoConfig], "thread-A")!;
    expect(stamped.type).toBe("http");
    const headers = (stamped as { headers: Array<{ name: string; value: string }> })
      .headers;
    expect(headers).toContainEqual({
      name: "Authorization",
      value: "Bearer session-token",
    });
    expect(headers).toContainEqual({
      name: "X-Mimo-Thread-Id",
      value: "thread-A",
    });
  });

  it("does not mutate the shared session-level config", () => {
    const input: McpServerConfig[] = [
      { ...mimoConfig, headers: [...mimoConfig.headers!] },
    ];
    stampThreadHeader(input, "thread-A");
    const original = input[0] as { headers: Array<{ name: string }> };
    expect(original.headers.some((h) => h.name === "X-Mimo-Thread-Id")).toBe(
      false,
    );
  });

  it("leaves non-mimo MCP configs untouched", () => {
    const other: McpServerConfig = {
      type: "http",
      name: "github",
      url: "http://localhost/gh",
      headers: [{ name: "Authorization", value: "Bearer gh" }],
    };
    const [result] = stampThreadHeader([other], "thread-A")!;
    expect(result).toEqual(other);
  });

  it("replaces a stale thread header rather than duplicating it", () => {
    const stale: McpServerConfig = {
      ...mimoConfig,
      headers: [
        { name: "Authorization", value: "Bearer t" },
        { name: "X-Mimo-Thread-Id", value: "old" },
      ],
    };
    const [stamped] = stampThreadHeader([stale], "thread-B")!;
    const headers = (stamped as { headers: Array<{ name: string; value: string }> })
      .headers;
    const threadHeaders = headers.filter((h) => h.name === "X-Mimo-Thread-Id");
    expect(threadHeaders).toEqual([{ name: "X-Mimo-Thread-Id", value: "thread-B" }]);
  });

  it("passes through undefined", () => {
    expect(stampThreadHeader(undefined, "thread-A")).toBeUndefined();
  });
});
