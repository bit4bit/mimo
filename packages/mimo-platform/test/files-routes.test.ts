// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { createFilesRoutes } from "../src/files/routes.js";
import type { FileInfo } from "../src/files/types.js";

const TEST_FILES: FileInfo[] = [
  { path: "src/routes.ts", name: "routes.ts", size: 100 },
  { path: "src/service.ts", name: "service.ts", size: 200 },
  { path: "src/index.ts", name: "index.ts", size: 50 },
  { path: "test/service.test.ts", name: "service.test.ts", size: 80 },
  { path: "README.md", name: "README.md", size: 300 },
];

function makeApp(
  files: FileInfo[],
  workspacePath: string | null = "/workspace",
) {
  const router = createFilesRoutes({
    fileService: {
      listFiles: async () => files,
      readFile: async () => "",
    },
    getWorkspacePath: async () => workspacePath,
  });

  const app = new Hono();
  app.route("/sessions/:sessionId/files", router);
  return app;
}

describe("GET /sessions/:sessionId/files", () => {
  it("returns all files when no pattern is given", async () => {
    const app = makeApp(TEST_FILES);
    const res = await app.request("/sessions/abc/files");

    expect(res.status).toBe(200);
    const body = (await res.json()) as FileInfo[];
    expect(body).toHaveLength(TEST_FILES.length);
  });

  it("returns all files when pattern is empty string", async () => {
    const app = makeApp(TEST_FILES);
    const res = await app.request("/sessions/abc/files?pattern=");

    expect(res.status).toBe(200);
    const body = (await res.json()) as FileInfo[];
    expect(body).toHaveLength(TEST_FILES.length);
  });

  it("returns only matching files when pattern is given", async () => {
    const app = makeApp(TEST_FILES);
    const res = await app.request("/sessions/abc/files?pattern=service");

    expect(res.status).toBe(200);
    const body = (await res.json()) as FileInfo[];
    expect(body.map((f) => f.path)).toContain("src/service.ts");
    expect(body.map((f) => f.path)).toContain("test/service.test.ts");
    expect(body.map((f) => f.path)).not.toContain("src/routes.ts");
    expect(body.map((f) => f.path)).not.toContain("README.md");
  });

  it("path-priority: full path match ranks before filename-only match", async () => {
    const app = makeApp(TEST_FILES);
    const res = await app.request("/sessions/abc/files?pattern=src/service");

    expect(res.status).toBe(200);
    const body = (await res.json()) as FileInfo[];
    expect(body[0]?.path).toBe("src/service.ts");
  });

  it("returns 404 when session workspace is not found", async () => {
    const app = makeApp(TEST_FILES, null);
    const res = await app.request("/sessions/unknown/files");

    expect(res.status).toBe(404);
  });

  it("returns empty array when no files match the pattern", async () => {
    const app = makeApp(TEST_FILES);
    const res = await app.request("/sessions/abc/files?pattern=nonexistent");

    expect(res.status).toBe(200);
    const body = (await res.json()) as FileInfo[];
    expect(body).toHaveLength(0);
  });
});
