// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { dump } from "js-yaml";
import { DummyGitHttpServer } from "../src/domain/vcs/git-http-server.js";

function seedAgent(home: string, id: string, owner: string) {
  const dir = join(home, "agents", id);
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    join(dir, "agent.yaml"),
    dump({
      id,
      name: id,
      owner,
      token: "seed-token",
      sessionIds: [],
      status: "offline",
      provider: "opencode",
      startedAt: now,
      updatedAt: now,
      sharedWith: [],
    }),
    { encoding: "utf-8" },
  );
}

let testHome: string;
let mimoContext: any;

function createTestApp(ctx: any): Hono {
  const { createInternalApiRouter } = require("../src/api/rest/index.ts");
  const {
    createSessionsRoutes,
  } = require("../src/web/features/sessions/pages/sessions.tsx");

  const app = new Hono();
  const internalRouter = createInternalApiRouter(ctx);
  app.route("/api/internal", internalRouter);

  const sessions = createSessionsRoutes(ctx, {
    fetchFn: (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/internal/")) {
        const path = new URL(urlStr).pathname;
        return app.request(path, init);
      }
      return fetch(url, init);
    },
  });
  app.route("/projects/:projectId/sessions", sessions);

  return app;
}

describe("Chat thread delete button render", () => {
  beforeEach(async () => {
    testHome = join(
      tmpdir(),
      `mimo-chat-thread-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const { createMimoContext } =
      await import("../src/infrastructure/context/mimo-context.ts");
    mimoContext = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret" },
      services: { sharedVcs: new DummyGitHttpServer() },
    });
    mimoContext.services.vcs.cloneRepository = async () => ({ success: true });
    mimoContext.services.vcs.importToFossil = async () => ({ success: true });
    mimoContext.services.vcs.seedSessionRepo = async () => ({ success: true });
    mimoContext.services.vcs.clonePlatformCheckout = async () => ({
      success: true,
    });
    mimoContext.services.vcs.syncIgnoresToGit = async () => ({ success: true });
    mimoContext.services.vcs.openFossilCheckout = async () => ({
      success: true,
    });
    mimoContext.services.vcs.openFossil = async () => ({ success: true });
    mimoContext.services.vcs.syncIgnoresToFossil = async () => ({
      success: true,
    });
  });

  afterEach(() => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  it("renders a '-' delete-thread button immediately left of the '+' create button", async () => {
    const app = createTestApp(mimoContext);
    await mimoContext.repos.users.create(
      "owner",
      await Bun.password.hash("pass", { algorithm: "bcrypt", cost: 10 }),
    );
    const token = await mimoContext.services.auth.generateToken("owner");
    const project = await mimoContext.repos.projects.create({
      repositories: [
        {
          id: "default",
          name: "default",
          repoUrl: "https://github.com/x/y.git",
          repoType: "git",
          mountPath: ".",
        },
      ],

      name: "P",
      owner: "owner",
    });
    const session = await mimoContext.repos.sessions.create({
      name: "S",
      projectId: project.id,
      owner: "owner",
    });
    seedAgent(testHome, "agent-xyz", "owner");

    const res = await app.request(
      `/projects/${project.id}/sessions/${session.id}`,
      { headers: { Cookie: `token=${token}` } },
    );
    expect(res.status).toBe(200);
    const html = await res.text();

    // Both buttons live inside the same .chat-threads-tabs container.
    const tabsBlock = html.match(
      /<div class="chat-threads-tabs">([\s\S]*?)<\/div>/,
    );
    expect(tabsBlock).not.toBeNull();
    const tabsHtml = tabsBlock![1];

    const deleteIdx = tabsHtml.indexOf('id="delete-thread-btn"');
    const createIdx = tabsHtml.indexOf('id="create-thread-btn"');
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    // The delete button must come BEFORE the create button.
    expect(deleteIdx).toBeLessThan(createIdx);
    // The delete button is labeled with the '-' symbol.
    const deleteBtnMatch = tabsHtml.match(
      /<button[^>]*id="delete-thread-btn"[^>]*>([^<]*)<\/button>/,
    );
    expect(deleteBtnMatch).not.toBeNull();
    expect(deleteBtnMatch![1].trim()).toBe("-");
    // The create button is still labeled '+'.
    const createBtnMatch = tabsHtml.match(
      /<button[^>]*id="create-thread-btn"[^>]*>([^<]*)<\/button>/,
    );
    expect(createBtnMatch).not.toBeNull();
    expect(createBtnMatch![1].trim()).toBe("+");
  });
});
