import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { createAutoCommitRouter } from "../src/auto-commit/routes";
import { JwtService } from "../src/auth/jwt";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";

describe("auto-commit routes", () => {
  let testHome: string;
  let testAuth: JwtService;

  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-auto-commit-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    testAuth = new JwtService("test-secret-key-for-testing");

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    mkdirSync(testHome, { recursive: true });
  });

  it("returns sync status for a session", async () => {
    const app = new Hono();
    const router = createAutoCommitRouter(
      {
        getSyncStatus: async () => ({
          syncState: "idle",
          lastSyncAt: undefined,
          lastSyncError: undefined,
        }),
        syncNow: async () => ({ success: true, message: "Synced" }),
        handleThoughtEnd: async () => ({ success: true, message: "Synced" }),
      } as any,
      { auth: testAuth },
    );

    app.route("/sessions", router);
    const token = await testAuth.generateToken("testuser");

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
