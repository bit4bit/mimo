import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";

describe("MIMO_HOST environment variable", () => {
  let testHome: string;

  beforeEach(() => {
    testHome = join(
      tmpdir(),
      `mimo-host-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
  });

  afterEach(() => {
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  test("should use MIMO_HOST in PLATFORM_URL default", async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        MIMO_HOST: "example.com",
        PORT: 3000,
      },
    });
    expect(ctx.env.PLATFORM_URL).toBe("http://example.com:3000");
    expect(ctx.env.MIMO_HOST).toBe("example.com");
  });

  test("should default MIMO_HOST to localhost", async () => {
    const { createMimoContext, DEFAULT_MIMO_HOST } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        PORT: 3000,
      },
    });
    expect(ctx.env.MIMO_HOST).toBe(DEFAULT_MIMO_HOST);
    expect(ctx.env.PLATFORM_URL).toBe(`http://${DEFAULT_MIMO_HOST}:3000`);
  });

  test("should allow overriding PLATFORM_URL independently", async () => {
    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        MIMO_HOST: "example.com",
        PLATFORM_URL: "https://custom.example.com",
      },
    });
    expect(ctx.env.PLATFORM_URL).toBe("https://custom.example.com");
    expect(ctx.env.MIMO_HOST).toBe("example.com");
  });

  test("should use MIMO_HOST in SharedFossilServer URL", async () => {
    const { SharedFossilServer } = await import(
      "../src/vcs/shared-fossil-server.js"
    );
    const { createOS } = await import("../src/os/node-adapter.js");
    const os = createOS({ PATH: process.env.PATH, HOME: process.env.HOME });

    const server = new SharedFossilServer(
      {
        port: 8000,
        reposDir: testHome,
        host: "fossil.example.com",
      },
      os,
    );

    const url = server.getUrl("abc123-def456");
    expect(url).toBe("http://fossil.example.com:8000/abc123_def456/");
  });

  test("should default SharedFossilServer host to localhost", async () => {
    const { SharedFossilServer } = await import(
      "../src/vcs/shared-fossil-server.js"
    );
    const { createOS } = await import("../src/os/node-adapter.js");
    const os = createOS({ PATH: process.env.PATH, HOME: process.env.HOME });

    const server = new SharedFossilServer(
      {
        port: 8000,
        reposDir: testHome,
      },
      os,
    );

    const url = server.getUrl("abc123-def456");
    expect(url).toBe("http://localhost:8000/abc123_def456/");
  });
});
