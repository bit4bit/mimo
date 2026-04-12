import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createAutoCommitRouter } from "../src/auto-commit/routes";
import { generateToken } from "../src/auth/jwt";

describe("auto-commit routes", () => {
  it("returns sync status for a session", async () => {
    process.env.JWT_SECRET = "test-secret-key-for-testing";

    const app = new Hono();
    const router = createAutoCommitRouter({
      getSyncStatus: async () => ({ syncState: "idle", lastSyncAt: undefined, lastSyncError: undefined }),
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

  it("triggers manual sync", async () => {
    process.env.JWT_SECRET = "test-secret-key-for-testing";

    const app = new Hono();
    const router = createAutoCommitRouter({
      getSyncStatus: async () => ({ syncState: "idle", lastSyncAt: undefined, lastSyncError: undefined }),
      syncNow: async () => ({ success: true, message: "Changes committed and pushed successfully!" }),
      handleThoughtEnd: async () => ({ success: true, message: "Synced" }),
    } as any);

    app.route("/sessions", router);
    const token = await generateToken("testuser");

    const res = await app.request("/sessions/s1/sync", {
      method: "POST",
      headers: {
        Cookie: `token=${token}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
