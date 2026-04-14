import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";

describe("Filesystem Paths Integration Test", () => {
  let testHome: string;

  beforeEach(() => {
    testHome = join(
      tmpdir(),
      `mimo-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
  });

  afterEach(() => {
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  test("should use MIMO_HOME environment variable", async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({ env: { MIMO_HOME: testHome } });
    expect(ctx.paths.root).toBe(testHome);
  });

  test("should expose data directory rooted at MIMO_HOME", async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({ env: { MIMO_HOME: testHome } });
    expect(ctx.paths.data).toBe(testHome);
  });

  test("should create all directories on ensureMimoHome", async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({ env: { MIMO_HOME: testHome } });
    expect(existsSync(ctx.paths.root)).toBe(true);
    expect(existsSync(ctx.paths.users)).toBe(true);
    expect(existsSync(ctx.paths.projects)).toBe(true);
    expect(existsSync(ctx.paths.agents)).toBe(true);
  });

  test("should return correct user path", async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({ env: { MIMO_HOME: testHome } });
    expect(join(ctx.paths.users, "alice")).toBe(
      join(testHome, "users", "alice"),
    );
  });

  test("should return correct project path", async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({ env: { MIMO_HOME: testHome } });
    expect(join(ctx.paths.projects, "my-app")).toBe(
      join(testHome, "projects", "my-app"),
    );
  });

  test("should return correct session path", async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({ env: { MIMO_HOME: testHome } });
    expect(join(ctx.paths.projects, "my-app", "sessions", "session-1")).toBe(
      join(testHome, "projects", "my-app", "sessions", "session-1"),
    );
  });

  test("should return correct agent path", async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({ env: { MIMO_HOME: testHome } });
    expect(join(ctx.paths.agents, "agent-123")).toBe(
      join(testHome, "agents", "agent-123"),
    );
  });
});
