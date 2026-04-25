import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "fs";
import { which } from "bun";
import bcrypt from "bcrypt";
import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";

let sessionRoutes: any;
let sessionRepository: any;
let userRepository: any;
let authService: any;
let projectRepository: any;
let testHome: string;

async function setup() {
  testHome = join(
    tmpdir(),
    `expert-api-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );

  const { createMimoContext } = await import("../src/context/mimo-context.ts");
  const ctx = createMimoContext({
    env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key" },
    services: { sharedFossil: new DummySharedFossilServer() },
  });

  sessionRepository = ctx.repos.sessions;
  projectRepository = ctx.repos.projects;
  userRepository = ctx.repos.users;
  authService = ctx.services.auth;

  const vcsModule = await import("../src/vcs/index.ts");
  vcsModule.vcs.cloneRepository = async () => ({ success: true });
  vcsModule.vcs.importToFossil = async () => ({ success: true });
  vcsModule.vcs.openFossilCheckout = async () => ({ success: true });
  vcsModule.vcs.openFossil = async () => ({ success: true });
  vcsModule.vcs.syncIgnoresToFossil = async () => ({ success: true });
  vcsModule.vcs.createFossilUser = async () => ({ success: true });

  const { createSessionsRoutes } = await import("../src/sessions/routes.tsx");
  sessionRoutes = createSessionsRoutes(ctx);
}

async function createUserAndSession(username: string) {
  await userRepository.create(username, await bcrypt.hash("pass", 10));

  const project = await projectRepository.create({
    name: "Test Project",
    repoUrl: "https://github.com/user/repo.git",
    repoType: "git",
    owner: username,
  });

  const session = await sessionRepository.create({
    name: "Test Session",
    projectId: project.id,
    owner: username,
    model: "claude-sonnet-4-6",
    mode: "auto",
  });

  const token = await authService.generateToken(username);

  return { session, token };
}

describe("GET /sessions/:id/files/content", () => {
  beforeEach(setup);

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  it("returns HTML-escaped file content", async () => {
    const app = new Hono();
    app.route("/sessions", sessionRoutes);

    const { session, token } = await createUserAndSession("user1");
    writeFileSync(
      join(session.agentWorkspacePath, "hello.ts"),
      "const x = 1 < 2;",
      "utf-8",
    );

    const res = await app.request(
      `/sessions/${session.id}/files/content?path=hello.ts`,
      { headers: { Cookie: `token=${token}` } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toContain("&lt;");
    expect(body.path).toBe("hello.ts");
  });

  it("returns 404 when file does not exist", async () => {
    const app = new Hono();
    app.route("/sessions", sessionRoutes);

    const { session, token } = await createUserAndSession("user2");

    const res = await app.request(
      `/sessions/${session.id}/files/content?path=missing.ts`,
      { headers: { Cookie: `token=${token}` } },
    );

    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const app = new Hono();
    app.route("/sessions", sessionRoutes);

    const { session } = await createUserAndSession("user3");

    const res = await app.request(
      `/sessions/${session.id}/files/content?path=foo.ts`,
    );

    expect(res.status).toBe(401);
  });
});

describe("GET /sessions/:id/search", () => {
  beforeEach(setup);

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  it("returns search results with workspace-relative paths", async () => {
    const app = new Hono();
    app.route("/sessions", sessionRoutes);

    const { session, token } = await createUserAndSession("search-user");
    mkdirSync(join(session.agentWorkspacePath, "src"), { recursive: true });
    writeFileSync(
      join(session.agentWorkspacePath, "src", "target.ts"),
      "export function findMe() { return 42; }\n",
      "utf-8",
    );

    const res = await app.request(
      `/sessions/${session.id}/search?q=findMe&context=2`,
      { headers: { Cookie: `token=${token}` } },
    );
    const body = await res.json();

    const rgPath = await which("rg");
    if (!rgPath) {
      expect(res.status).toBe(400);
      expect(body.code).toBe("NOT_FOUND");
      return;
    }

    expect(res.status).toBe(200);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].path).toBe("src/target.ts");
  });

  it("uses injected search service dependency", async () => {
    const customHome = join(
      tmpdir(),
      `expert-api-search-di-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const expectedResult = {
      path: "src/injected.ts",
      line: 7,
      column: 3,
      text: "const injected = true;",
      matchStart: 6,
      matchEnd: 14,
      before: [],
      after: [],
    };

    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const { createSessionsRoutes } = await import("../src/sessions/routes.tsx");
    const vcsModule = await import("../src/vcs/index.ts");

    const searchCalls: Array<{ workspacePath: string; query: string }> = [];
    const ctx = createMimoContext({
      env: { MIMO_HOME: customHome, JWT_SECRET: "test-secret-key" },
      services: {
        sharedFossil: new DummySharedFossilServer(),
        search: {
          searchContent: async (workspacePath: string, query: string) => {
            searchCalls.push({ workspacePath, query });
            return [expectedResult];
          },
        },
      },
    });

    vcsModule.vcs.cloneRepository = async () => ({ success: true });
    vcsModule.vcs.importToFossil = async () => ({ success: true });
    vcsModule.vcs.openFossilCheckout = async () => ({ success: true });
    vcsModule.vcs.openFossil = async () => ({ success: true });
    vcsModule.vcs.syncIgnoresToFossil = async () => ({ success: true });
    vcsModule.vcs.createFossilUser = async () => ({ success: true });

    const app = new Hono();
    app.route("/sessions", createSessionsRoutes(ctx));

    await ctx.repos.users.create("search-di-user", await bcrypt.hash("pass", 10));
    const project = await ctx.repos.projects.create({
      name: "Search DI Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "search-di-user",
    });
    const session = await ctx.repos.sessions.create({
      name: "Search DI Session",
      projectId: project.id,
      owner: "search-di-user",
      model: "claude-sonnet-4-6",
      mode: "auto",
    });
    const token = await ctx.services.auth.generateToken("search-di-user");

    const res = await app.request(`/sessions/${session.id}/search?q=injected`, {
      headers: { Cookie: `token=${token}` },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([expectedResult]);
    expect(searchCalls.length).toBe(1);
    expect(searchCalls[0].workspacePath).toBe(session.agentWorkspacePath);
    expect(searchCalls[0].query).toBe("injected");

    rmSync(customHome, { recursive: true, force: true });
  });
});

describe("POST /sessions/:id/files/write", () => {
  beforeEach(setup);

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  it("writes content to an existing file", async () => {
    const app = new Hono();
    app.route("/sessions", sessionRoutes);

    const { session, token } = await createUserAndSession("user4");
    writeFileSync(join(session.agentWorkspacePath, "edit.ts"), "old", "utf-8");

    const res = await app.request(`/sessions/${session.id}/files/write`, {
      method: "POST",
      headers: {
        Cookie: `token=${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: "edit.ts", content: "new content" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(
      readFileSync(join(session.agentWorkspacePath, "edit.ts"), "utf-8"),
    ).toBe("new content");
  });

  it("returns 400 when path contains ..", async () => {
    const app = new Hono();
    app.route("/sessions", sessionRoutes);

    const { session, token } = await createUserAndSession("user5");

    const res = await app.request(`/sessions/${session.id}/files/write`, {
      method: "POST",
      headers: {
        Cookie: `token=${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: "../outside.ts", content: "bad" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const app = new Hono();
    app.route("/sessions", sessionRoutes);

    const { session } = await createUserAndSession("user6");

    const res = await app.request(`/sessions/${session.id}/files/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "file.ts", content: "x" }),
    });

    expect(res.status).toBe(401);
  });
});
