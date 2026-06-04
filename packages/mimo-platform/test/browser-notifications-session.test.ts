import { describe, it, expect, afterEach } from "bun:test";
import { readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, existsSync } from "fs";
import { dump, load } from "js-yaml";

import { createMimoContext } from "../src/infrastructure/context/mimo-context.ts";
import { DummySharedFossilServer } from "../src/domain/vcs/shared-fossil-server.js";
import { resetGlobalState } from "./test-helpers.js";

let testHome: string;

async function setupContext() {
  testHome = join(tmpdir(), `mimo-bn-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const ctx = createMimoContext({
    env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
    services: { sharedFossil: new DummySharedFossilServer() },
  });
  
  // Mock VCS to avoid actual git/fossil operations
  ctx.services.vcs.cloneRepository = async () => ({ success: true });
  ctx.services.vcs.importToFossil = async () => ({ success: true });
  ctx.services.vcs.createBranch = async () => ({ success: true });
  ctx.services.vcs.setFossilProjectName = async () => ({ success: true });
  ctx.services.vcs.openFossilCheckout = async () => ({ success: true });
  ctx.services.vcs.openFossil = async () => ({ success: true });
  ctx.services.vcs.syncIgnoresToFossil = async () => ({ success: true });
  ctx.services.vcs.createFossilUser = async () => ({ success: true });
  ctx.services.vcs.getCurrentBranch = async () => ({ success: true, branch: "main" });
  
  return ctx;
}

describe("Browser Notification Session Config", () => {
  afterEach(async () => {
    await resetGlobalState();
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should default browserNotificationsEnabled to false on new session", async () => {
    const ctx = await setupContext();
    await ctx.repos.users.create("testuser", await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }));
    const project = await ctx.repos.projects.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const session = await ctx.repos.sessions.create({
      name: "Notification Test Session",
      projectId: project.id,
      owner: "testuser",
    });

    expect(session.browserNotificationsEnabled).toBe(false);
  });

  it("should update browserNotificationsEnabled via updateSessionConfig", async () => {
    const ctx = await setupContext();
    await ctx.repos.users.create("testuser", await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }));
    const project = await ctx.repos.projects.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const session = await ctx.repos.sessions.create({
      name: "Notification Patch Session",
      projectId: project.id,
      owner: "testuser",
    });

    const updated = await ctx.repos.sessions.updateSessionConfig(session.id, {
      browserNotificationsEnabled: true,
    });

    expect(updated).not.toBeNull();
    expect(updated?.browserNotificationsEnabled).toBe(true);
  });

  it("should include browserNotificationsEnabled in toSessionResponse", async () => {
    const ctx = await setupContext();
    await ctx.repos.users.create("testuser", await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }));
    const project = await ctx.repos.projects.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const session = await ctx.repos.sessions.create({
      name: "API Response Session",
      projectId: project.id,
      owner: "testuser",
    });

    const { toSessionResponse } = await import("../src/api/rest/sessions/types.js");
    const response = toSessionResponse(session);
    expect(response.browserNotificationsEnabled).toBe(false);
  });

  it("should handle sessions without browserNotificationsEnabled field", async () => {
    const ctx = await setupContext();
    await ctx.repos.users.create("testuser", await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }));
    const project = await ctx.repos.projects.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const session = await ctx.repos.sessions.create({
      name: "Legacy Field Session",
      projectId: project.id,
      owner: "testuser",
    });

    // Manually remove the field from the yaml to simulate legacy sessions
    const sessionPath = join(ctx.repos.sessions.getProjectsPath(), project.id, "sessions", session.id, "session.yaml");
    const yamlData = load(readFileSync(sessionPath, "utf-8")) as Record<string, unknown>;
    delete yamlData.browserNotificationsEnabled;
    writeFileSync(sessionPath, dump(yamlData), "utf-8");

    const hydrated = await ctx.repos.sessions.findById(session.id);
    expect(hydrated).not.toBeNull();
    expect(hydrated?.browserNotificationsEnabled).toBe(false);
  });

  it("should reject non-boolean browserNotificationsEnabled in updateSessionConfig", async () => {
    const ctx = await setupContext();
    await ctx.repos.users.create("testuser", await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }));
    const project = await ctx.repos.projects.create({
      name: "Test Project",
      repoUrl: "https://github.com/user/repo.git",
      repoType: "git",
      owner: "testuser",
    });

    const session = await ctx.repos.sessions.create({
      name: "Validation Session",
      projectId: project.id,
      owner: "testuser",
    });

    let threw = false;
    try {
      await ctx.repos.sessions.updateSessionConfig(session.id, {
        browserNotificationsEnabled: "yes" as any,
      });
    } catch (err: any) {
      threw = true;
      expect(err.message).toContain("boolean");
    }
    expect(threw).toBe(true);
  });
});
