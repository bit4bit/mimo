import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";

// Import after setting up test environment
let Paths: any;
let ensureMimoHome: any;
let getUserPath: any;
let getProjectPath: any;
let getSessionPath: any;
let getAgentPath: any;

describe("Filesystem Paths Integration Test", () => {
  const testHome = join(tmpdir(), `mimo-test-${Date.now()}`);

  beforeEach(async () => {
    process.env.MIMO_HOME = testHome;
    // Re-import to get fresh module with new env
    const module = await import("../src/config/paths.ts");
    Paths = module.Paths;
    ensureMimoHome = module.ensureMimoHome;
    getUserPath = module.getUserPath;
    getProjectPath = module.getProjectPath;
    getSessionPath = module.getSessionPath;
    getAgentPath = module.getAgentPath;
  });

  afterEach(() => {
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
    delete process.env.MIMO_HOME;
  });

  test("should use MIMO_HOME environment variable", () => {
    expect(Paths.root).toBe(testHome);
  });

  test("should create all directories on ensureMimoHome", () => {
    ensureMimoHome();
    expect(existsSync(Paths.root)).toBe(true);
    expect(existsSync(Paths.users)).toBe(true);
    expect(existsSync(Paths.projects)).toBe(true);
    expect(existsSync(Paths.agents)).toBe(true);
  });

  test("should return correct user path", () => {
    const userPath = getUserPath("alice");
    expect(userPath).toBe(join(testHome, "users", "alice"));
  });

  test("should return correct project path", () => {
    const projectPath = getProjectPath("my-app");
    expect(projectPath).toBe(join(testHome, "projects", "my-app"));
  });

  test("should return correct session path", () => {
    const sessionPath = getSessionPath("my-app", "session-1");
    expect(sessionPath).toBe(join(testHome, "projects", "my-app", "sessions", "session-1"));
  });

  test("should return correct agent path", () => {
    const agentPath = getAgentPath("agent-123");
    expect(agentPath).toBe(join(testHome, "agents", "agent-123"));
  });
});
