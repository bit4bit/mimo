import { beforeEach, describe, expect, it } from "bun:test";
import { setMimoHome, clearConfig } from "../src/config/global-config.js";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";

describe("SessionRepository with mimoContext paths", () => {
  let homeA: string;
  let homeB: string;

  beforeEach(() => {
    homeA = join(tmpdir(), `mimo-session-repo-a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    homeB = join(tmpdir(), `mimo-session-repo-b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    rmSync(homeA, { recursive: true, force: true });
    rmSync(homeB, { recursive: true, force: true });
  });

  it("uses injected context paths even if process env changes later", async () => {
    setMimoHome(homeA);

    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const mimoContext = createMimoContext({
      env: {
        MIMO_HOME: homeA,
      },
    });

    setMimoHome(homeB);

    const session = await mimoContext.repos.sessions.create({
      name: "context-path-session",
      projectId: "project-ctx",
      owner: "tester",
    });

    expect(session.upstreamPath.startsWith(join(homeA, "projects", "project-ctx"))).toBe(true);
    expect(session.agentWorkspacePath.startsWith(join(homeA, "projects", "project-ctx"))).toBe(true);
  });
});
