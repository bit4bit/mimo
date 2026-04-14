import { beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("Repositories with mimoContext paths", () => {
  let homeA: string;
  let homeB: string;

  beforeEach(() => {
    homeA = join(tmpdir(), `mimo-repos-context-a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    homeB = join(tmpdir(), `mimo-repos-context-b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    rmSync(homeA, { recursive: true, force: true });
    rmSync(homeB, { recursive: true, force: true });
  });

  it("uses injected paths for user repository", async () => {
    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const mimoContext = createMimoContext({ env: { MIMO_HOME: homeA } });

    await mimoContext.repos.users.create("ctx-user", "hash");

    expect(existsSync(join(homeA, "users", "ctx-user", "credentials.yaml"))).toBe(true);
  });

  it("uses injected paths for project repository", async () => {
    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const mimoContext = createMimoContext({ env: { MIMO_HOME: homeA } });

    const project = await mimoContext.repos.projects.create({
      name: "context-project",
      owner: "ctx-user",
      repoType: "git",
      repoUrl: "https://github.com/example/repo.git",
    });

    expect(existsSync(join(homeA, "projects", project.id, "project.yaml"))).toBe(true);
  });

  it("uses injected paths for agent repository", async () => {
    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const mimoContext = createMimoContext({ env: { MIMO_HOME: homeA } });

    const agent = await mimoContext.repos.agents.create({
      name: "context-agent",
      owner: "ctx-user",
      provider: "opencode",
    });

    expect(existsSync(join(homeA, "agents", agent.id, "agent.yaml"))).toBe(true);
  });

  it("uses injected paths for mcp server repository", async () => {
    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const mimoContext = createMimoContext({ env: { MIMO_HOME: homeA } });

    const server = await mimoContext.repos.mcpServers.create({
      name: "Context MCP",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });

    expect(existsSync(join(homeA, "mcp-servers", server.id, "config.yaml"))).toBe(true);
  });
});
