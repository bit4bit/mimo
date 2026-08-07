// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createCommitRoutes } from "../src/api/rest/commits.js";

function createApp(commits: any): Hono {
  const mimoContext: any = {
    services: {
      commits,
      auth: { verifyToken: async () => ({ username: "testuser" }) },
    },
  };
  const app = new Hono();
  app.route("/commits", createCommitRoutes(mimoContext));
  return app;
}

const authHeaders = { Cookie: "token=test-token" };

describe("POST /commits/:sessionId/pull-force", () => {
  it("fans out across all repos when no repoId is given and returns per-repo results", async () => {
    const calls: Array<[string, string | undefined]> = [];
    const results = [
      { repoId: "repo-a", status: "succeeded", message: "ok" },
      { repoId: "repo-b", status: "failed", message: "fail", error: "boom" },
    ];
    const commits = {
      pullForceAcrossRepos: async (sessionId: string, repoId?: string) => {
        calls.push([sessionId, repoId]);
        return {
          success: false,
          message: "1 repository pull force(s) failed",
          results,
        };
      },
    };
    const app = createApp(commits);

    const res = await app.request("/commits/session-1/pull-force", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      message: "1 repository pull force(s) failed",
      results,
    });
    expect(calls).toEqual([["session-1", undefined]]);
  });

  it("forwards a repoId from the JSON body", async () => {
    let receivedRepoId: string | undefined;
    const commits = {
      pullForceAcrossRepos: async (_sessionId: string, repoId?: string) => {
        receivedRepoId = repoId;
        return { success: true, message: "ok", results: [] };
      },
    };
    const app = createApp(commits);

    const res = await app.request("/commits/session-1/pull-force", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ repoId: "repo-a" }),
    });

    expect(res.status).toBe(200);
    expect(receivedRepoId).toBe("repo-a");
  });

  it("forwards a repoId from the query string", async () => {
    let receivedRepoId: string | undefined;
    const commits = {
      pullForceAcrossRepos: async (_sessionId: string, repoId?: string) => {
        receivedRepoId = repoId;
        return { success: true, message: "ok", results: [] };
      },
    };
    const app = createApp(commits);

    const res = await app.request(
      "/commits/session-1/pull-force?repoId=repo-b",
      { method: "POST", headers: authHeaders },
    );

    expect(res.status).toBe(200);
    expect(receivedRepoId).toBe("repo-b");
  });

  it("returns the missing-session failure", async () => {
    const commits = {
      pullForceAcrossRepos: async () => ({
        success: false,
        message: "Session not found",
        results: [],
      }),
    };
    const app = createApp(commits);

    const res = await app.request("/commits/nope/pull-force", {
      method: "POST",
      headers: authHeaders,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      message: "Session not found",
      results: [],
    });
  });

  it("rejects unauthenticated requests with a redirect", async () => {
    const commits = {
      pullForceAcrossRepos: async () => ({
        success: true,
        message: "should not run",
        results: [],
      }),
    };
    const app = new Hono();
    app.route(
      "/commits",
      createCommitRoutes({
        services: {
          commits,
          auth: { verifyToken: async () => null },
        },
      } as any),
    );

    const res = await app.request("/commits/session-1/pull-force", {
      method: "POST",
    });

    expect(res.status).toBe(302);
  });
});

describe("POST /commits/:sessionId/push-force", () => {
  it("fans out across all repos when no repoId is given and returns per-repo results", async () => {
    const calls: Array<[string, string | undefined]> = [];
    const results = [
      { repoId: "repo-a", status: "succeeded", message: "pushed" },
    ];
    const commits = {
      forcePushAcrossRepos: async (sessionId: string, repoId?: string) => {
        calls.push([sessionId, repoId]);
        return {
          success: true,
          message: "Force push completed successfully",
          results,
        };
      },
    };
    const app = createApp(commits);

    const res = await app.request("/commits/session-1/push-force", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      message: "Force push completed successfully",
      results,
    });
    expect(calls).toEqual([["session-1", undefined]]);
  });

  it("forwards a repoId from the query string", async () => {
    let receivedRepoId: string | undefined;
    const commits = {
      forcePushAcrossRepos: async (_sessionId: string, repoId?: string) => {
        receivedRepoId = repoId;
        return { success: true, message: "ok", results: [] };
      },
    };
    const app = createApp(commits);

    const res = await app.request(
      "/commits/session-1/push-force?repoId=repo-a",
      { method: "POST", headers: authHeaders },
    );

    expect(res.status).toBe(200);
    expect(receivedRepoId).toBe("repo-a");
  });
});
