/**
 * OS Abstraction Integration Tests
 *
 * Demonstrates that the OS layer can be fully mocked for testing,
 * and that real Node adapters work correctly.
 */
import { describe, it, expect } from "bun:test";
import { createMockOS, type MockOS } from "./mock-adapter.js";
import { createOS } from "./node-adapter.js";

describe("MockFileSystem", () => {
  it("should seed and read files without touching real fs", () => {
    const os = createMockOS() as MockOS;

    os.fs.seed({
      "/project/src/index.ts": "console.log('hello');",
      "/project/package.json": '{"name": "test"}',
      "/project/src": null, // directory
    });

    expect(os.fs.exists("/project/src/index.ts")).toBe(true);
    expect(os.fs.readFile("/project/src/index.ts")).toBe("console.log('hello');");
    expect(os.fs.exists("/project/missing.txt")).toBe(false);
  });

  it("should support directory operations", () => {
    const os = createMockOS() as MockOS;

    os.fs.mkdir("/tmp/test-dir", { recursive: true });
    os.fs.writeFile("/tmp/test-dir/file.txt", "content");

    const entries = os.fs.readdir("/tmp/test-dir") as string[];
    expect(entries).toContain("file.txt");
  });

  it("should track file permissions", () => {
    const os = createMockOS() as MockOS;

    os.fs.writeFile("/secret.key", "private", { mode: 0o600 });
    os.fs.chmod("/secret.key", 0o600);

    const stat = os.fs.stat("/secret.key");
    expect(stat.isFile()).toBe(true);
  });
});

describe("MockCommandRunner", () => {
  it("should execute registered commands without real spawn", async () => {
    const os = createMockOS() as MockOS;

    os.command.onCommand("git", (args) => {
      if (args[1] === "status") {
        return { success: true, output: "M file.txt", error: "", exitCode: 0 };
      }
      return { success: false, output: "", error: "unknown command", exitCode: 1 };
    });

    const result = await os.command.run(["git", "status"]);

    expect(result.success).toBe(true);
    expect(result.output).toBe("M file.txt");
  });

  it("should throw for unmocked commands", async () => {
    const os = createMockOS() as MockOS;

    expect(() => os.command.runSync(["unknown-cmd"])).toThrow(
      "No mock handler registered",
    );
  });
});

describe("MockEnvironment", () => {
  it("should return injected env values", () => {
    const os = createMockOS({
      env: { MIMO_HOME: "/test/mimo", PORT: "3000" },
    }) as MockOS;

    expect(os.env.get("MIMO_HOME")).toBe("/test/mimo");
    expect(os.env.get("PORT")).toBe("3000");
    expect(os.env.has("MISSING")).toBe(false);
  });

  it("should throw for missing required vars", () => {
    const os = createMockOS() as MockOS;

    expect(() => os.env.getOrThrow("MISSING")).toThrow(
      "Missing required environment variable: MISSING",
    );
  });
});

describe("MockPathResolver", () => {
  it("should resolve paths predictably", () => {
    const os = createMockOS({
      homeDir: "/home/testuser",
      tempDir: "/tmp/test",
    }) as MockOS;

    expect(os.path.homeDir()).toBe("/home/testuser");
    expect(os.path.tempDir()).toBe("/tmp/test");
    expect(os.path.join("/a", "b", "c")).toBe("/a/b/c");
    expect(os.path.basename("/a/b/file.txt")).toBe("file.txt");
  });
});

describe("NodeOS Integration", () => {
  it("should execute real commands", async () => {
    const os = createOS({ PATH: "/usr/bin" });

    const result = await os.command.run(["echo", "hello"]);

    expect(result.success).toBe(true);
    expect(result.output).toBe("hello");
  });

  it("should read real environment", () => {
    const os = createOS({ TEST_VAR: "test-value" });

    expect(os.env.get("TEST_VAR")).toBe("test-value");
  });

  it("should resolve real paths", () => {
    const os = createOS({});

    expect(os.path.join("/a", "b")).toBe("/a/b");
    expect(typeof os.path.homeDir()).toBe("string");
    expect(typeof os.path.tempDir()).toBe("string");
  });
});

describe("OS as injected dependency", () => {
  it("should allow services to be tested with mock OS", async () => {
    // This demonstrates how a service would use injected OS
    const os = createMockOS({
      env: { JWT_SECRET: "test-secret" },
    }) as MockOS;

    // A real service would receive `os` via constructor
    function verifySecret(osDep: typeof os): boolean {
      return osDep.env.getOrThrow("JWT_SECRET") === "test-secret";
    }

    expect(verifySecret(os)).toBe(true);
  });
});
