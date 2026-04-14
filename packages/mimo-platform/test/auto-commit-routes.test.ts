import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { createAutoCommitRouter } from "../src/auto-commit/routes";
import { generateToken } from "../src/auth/jwt";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";

describe("auto-commit routes", () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-auto-commit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    });

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });
  });

  it("returns sync status for a session", async () => {
    const app = new Hono();
    const router = createAutoCommitRouter({
      getSyncStatus: async () => ({
        syncState: "idle",
        lastSyncAt: undefined,
        lastSyncError: undefined,
      }),
      syncNow: async () => ({ success: true, message: "Synced" }),
      handleThoughtEnd: async () => ({ success: true, message: "Synced" }),
    } as any);

    app.route("/sessions", router);
    const token = await generateToken("testuser");

    const res = await app.request("/sessions/s1/sync-status", {
      method: "GET",
      headers: {
        Cookie: `token=${token}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.syncState).toBe("idle");
  });
});
