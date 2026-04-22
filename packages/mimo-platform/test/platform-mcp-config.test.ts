import { describe, it, expect } from "bun:test";
import { createPlatformMcpServerConfig } from "../src/mcp/platform-config.js";

describe("createPlatformMcpServerConfig", () => {
  it("builds expected config shape with bearer header", () => {
    const config = createPlatformMcpServerConfig(
      "http://localhost:3000",
      "token-123",
    );

    expect(config.type).toBe("http");
    expect(config.name).toBe("mimo");
    expect(config.url).toBe("http://localhost:3000/api/mimo-mcp");
    expect(config.headers?.[0]).toEqual({
      name: "Authorization",
      value: "Bearer token-123",
    });
  });

  it("normalizes trailing slash in platform url", () => {
    const config = createPlatformMcpServerConfig(
      "http://localhost:3000/",
      "token-abc",
    );

    expect(config.url).toBe("http://localhost:3000/api/mimo-mcp");
  });
});
