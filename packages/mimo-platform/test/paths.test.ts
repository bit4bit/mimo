import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";

describe("Filesystem Paths Integration Test", () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = join(tmpdir(), `mimo-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    process.env.MIMO_HOME = testHome;
  });

  afterEach(() => {
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
    delete process.env.MIMO_HOME;
  });

  test("should use MIMO_HOME environment variable", async () => {
    const { getPaths } = await import("../src/config/paths.ts");
    const paths = getPaths();
    expect(paths.root).toBe(testHome);
  });

  test("should expose data directory rooted at MIMO_HOME", async () => {
    const { getPaths } = await import("../src/config/paths.ts");
    const paths = getPaths();
    expect(paths.data).toBe(testHome);
  });

  test("should create all directories on ensureMimoHome", async () => {
    const { ensureMimoHome, getPaths } = await import("../src/config/paths.ts");
    const paths = getPaths();
    ensureMimoHome();
    expect(existsSync(paths.root)).toBe(true);
    expect(existsSync(paths.users)).toBe(true);
    expect(existsSync(paths.projects)).toBe(true);
    expect(existsSync(paths.agents)).toBe(true);
  });

  test("should return correct user path", async () => {
    const { getUserPath } = await import("../src/config/paths.ts");
    const userPath = getUserPath("alice");
    expect(userPath).toBe(join(testHome, "users", "alice"));
  });

  test("should return correct project path", async () => {
    const { getProjectPath } = await import("../src/config/paths.ts");
    const projectPath = getProjectPath("my-app");
    expect(projectPath).toBe(join(testHome, "projects", "my-app"));
  });

  test("should return correct session path", async () => {
    const { getSessionPath } = await import("../src/config/paths.ts");
    const sessionPath = getSessionPath("my-app", "session-1");
    expect(sessionPath).toBe(join(testHome, "projects", "my-app", "sessions", "session-1"));
  });

  test("should return correct agent path", async () => {
    const { getAgentPath } = await import("../src/config/paths.ts");
    const agentPath = getAgentPath("agent-123");
    expect(agentPath).toBe(join(testHome, "agents", "agent-123"));
  });
});
