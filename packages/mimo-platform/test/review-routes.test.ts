// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createReviewRoutes } from "../src/api/rest/review.js";
import type { DiffHunk } from "../src/domain/commits/patch-preview.js";

interface VcsLike {
  resolveRootCommit(workDir: string): Promise<string | null>;
  diffNameStatus(
    workDir: string,
    baseRef: string,
  ): Promise<{
    files: {
      path: string;
      status: "added" | "modified" | "deleted";
      size: number;
    }[];
    summary: { added: number; modified: number; deleted: number };
  }>;
  diffFileRange(
    workDir: string,
    baseRef: string,
    path: string,
  ): Promise<{ hunks: DiffHunk[]; isBinary: boolean }>;
}

function makeApp(
  vcs: VcsLike,
  workspacePath: string | null = "/workspace",
  sessionId = "abc",
) {
  const router = createReviewRoutes({
    vcs: vcs as any,
    getWorkspacePath: async () => workspacePath,
  });
  const app = new Hono();
  app.route(`/sessions/:sessionId/review`, router);
  return app;
}

const STUB_ROOT = "cafe0000000000000000000000000000000000000";
const STUB_BASELINE = "bade0000000000000000000000000000000000000";

const STUB_CHANGED = {
  files: [
    { path: "src/auth/session.ts", status: "modified" as const, size: 100 },
    { path: "src/new.ts", status: "added" as const, size: 50 },
    { path: "src/old.ts", status: "deleted" as const, size: 80 },
  ],
  summary: { added: 1, modified: 1, deleted: 1 },
};

const STUB_HUNKS: DiffHunk[] = [
  {
    oldStart: 1,
    oldCount: 1,
    newStart: 1,
    newCount: 2,
    lines: ["@@ -1,1 +1,2 @@", " context", "+added line", "-removed line"],
  },
];

describe("GET /sessions/:sessionId/review", () => {
  it("returns { files, summary } from stubbed vcs.resolveRootCommit + diffNameStatus", async () => {
    const calls: { baseRef: string }[] = [];
    const vcs: VcsLike = {
      resolveRootCommit: async () => STUB_ROOT,
      diffNameStatus: async (_wd, baseRef) => {
        calls.push({ baseRef });
        return STUB_CHANGED;
      },
      diffFileRange: async () => ({ hunks: [], isBinary: false }),
    };
    const app = makeApp(vcs);

    const res = await app.request("/sessions/abc/review");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toHaveLength(3);
    expect(body.files[0]).toEqual({
      path: "src/auth/session.ts",
      status: "modified",
    });
    expect(body.summary).toEqual({ added: 1, modified: 1, deleted: 1 });
  });

  it("uses the root commit (not session.baseline) as the diff base ref", async () => {
    const calls: { baseRef: string }[] = [];
    const vcs: VcsLike = {
      resolveRootCommit: async () => STUB_ROOT,
      diffNameStatus: async (_wd, baseRef) => {
        calls.push({ baseRef });
        return STUB_CHANGED;
      },
      diffFileRange: async () => ({ hunks: [], isBinary: false }),
    };
    const app = makeApp(vcs);

    const res = await app.request("/sessions/abc/review");
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ baseRef: STUB_ROOT }]);
    expect(calls[0].baseRef).not.toBe(STUB_BASELINE);
  });

  it("returns 404 { error: 'Session not found' } when workspace is not found", async () => {
    const app = makeApp(
      {
        resolveRootCommit: async () => null,
        diffNameStatus: async () => STUB_CHANGED,
        diffFileRange: async () => ({ hunks: [], isBinary: false }),
      },
      null,
    );
    const res = await app.request("/sessions/unknown/review");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Session not found" });
  });
});

describe("GET /sessions/:sessionId/review/files/*path", () => {
  it("returns { hunks, isBinary } from stubbed vcs + parsePatchPreview (path with slashes)", async () => {
    const calls: { baseRef: string; path: string }[] = [];
    const vcs: VcsLike = {
      resolveRootCommit: async () => STUB_ROOT,
      diffNameStatus: async () => STUB_CHANGED,
      diffFileRange: async (_wd, baseRef, path) => {
        calls.push({ baseRef, path });
        return { hunks: STUB_HUNKS, isBinary: false };
      },
    };
    const app = makeApp(vcs);

    const res = await app.request(
      "/sessions/abc/review/files/src/auth/session.ts",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hunks).toEqual(STUB_HUNKS);
    expect(body.isBinary).toBe(false);
    expect(calls).toEqual([
      { baseRef: STUB_ROOT, path: "src/auth/session.ts" },
    ]);
  });

  it("returns 404 { error: 'Session not found' } when workspace is not found", async () => {
    const app = makeApp(
      {
        resolveRootCommit: async () => null,
        diffNameStatus: async () => STUB_CHANGED,
        diffFileRange: async () => ({ hunks: [], isBinary: false }),
      },
      null,
    );
    const res = await app.request("/sessions/unknown/review/files/foo.ts");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Session not found" });
  });

  it("returns 404 { error: 'File not found in review diff' } when the file is not in the diff", async () => {
    const vcs: VcsLike = {
      resolveRootCommit: async () => STUB_ROOT,
      diffNameStatus: async () => STUB_CHANGED,
      diffFileRange: async () => ({ hunks: [], isBinary: false }),
    };
    const app = makeApp(vcs);

    // Empty hunks means the file isn't in the diff.
    const res = await app.request("/sessions/abc/review/files/not/in/diff.ts");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "File not found in review diff",
    });
  });

  it("returns isBinary: true for binary files", async () => {
    const vcs: VcsLike = {
      resolveRootCommit: async () => STUB_ROOT,
      diffNameStatus: async () => STUB_CHANGED,
      diffFileRange: async () => ({ hunks: [], isBinary: true }),
    };
    const app = makeApp(vcs);

    const res = await app.request("/sessions/abc/review/files/binary.png");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isBinary).toBe(true);
    expect(body.hunks).toEqual([]);
  });
});
