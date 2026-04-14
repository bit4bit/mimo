import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";

describe("Agents routes with mimoContext", () => {
  let testHome: string;

  beforeEach(() => {
    testHome = join(tmpdir(), `mimo-agents-context-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    rmSync(testHome, { recursive: true, force: true });
  });

  it("uses jwt secret from injected mimoContext", async () => {
    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const { createAgentsRoutes } = await import("../src/agents/routes.tsx");

    const mimoContext = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "context-secret-a",
      },
    });

    const agent = await mimoContext.services.agents.createAgent({
      name: "context-agent",
      owner: "tester",
      provider: "opencode",
    });

    process.env.JWT_SECRET = "different-process-secret";

    const app = new Hono();
    app.route("/agents", createAgentsRoutes(mimoContext));

    const res = await app.request("/agents/me/sessions", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${agent.token}`,
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
