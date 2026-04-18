import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import bcrypt from "bcrypt";
import { DummySharedFossilServer } from "../src/vcs/shared-fossil-server.js";
import { migrateDevWorkspaceUsers } from "../src/sessions/dev-workspace-user-migration.ts";

let sessionRepository: any;
let projectRepository: any;
let userRepository: any;
let vcs: any;

describe("Dev workspace user migration", () => {
  beforeEach(async () => {
    const testHome = join(
      tmpdir(),
      `mimo-dev-user-migration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    const { createMimoContext } = await import("../src/context/mimo-context.ts");
    const ctx = createMimoContext({
      env: { MIMO_HOME: testHome, JWT_SECRET: "test-secret-key-for-testing" },
      services: { sharedFossil: new DummySharedFossilServer() },
    });

    sessionRepository = ctx.repos.sessions;
    projectRepository = ctx.repos.projects;
    userRepository = ctx.repos.users;
    const vcsModule = await import("../src/vcs/index.ts");
    vcs = vcsModule.vcs;
    vcs.createFossilUser = async () => ({ success: true });
  });

  it("backfills missing dev credentials and reports updated sessions", async () => {
    await userRepository.create("alice", await bcrypt.hash("pw", 10));
    const project = await projectRepository.create({
      name: "Project",
      repoUrl: "https://example.com/repo.git",
      repoType: "git",
      owner: "alice",
    });
    const session = await sessionRepository.create({
      name: "Session One",
      projectId: project.id,
      owner: "alice",
    });

    const result = await migrateDevWorkspaceUsers({
      sessionRepository,
      vcs,
      dryRun: false,
    });

    expect(result.summary.updated).toBe(1);
    expect(result.summary.failed).toBe(0);

    const reloaded = await sessionRepository.findById(session.id);
    expect(reloaded?.agentWorkspaceUser).toBe("dev");
    expect(reloaded?.agentWorkspacePassword).toBeTruthy();
  });

  it("is idempotent and skips already configured dev credentials", async () => {
    await userRepository.create("alice", await bcrypt.hash("pw", 10));
    const project = await projectRepository.create({
      name: "Project",
      repoUrl: "https://example.com/repo.git",
      repoType: "git",
      owner: "alice",
    });
    const session = await sessionRepository.create({
      name: "Session Two",
      projectId: project.id,
      owner: "alice",
    });
    await sessionRepository.update(session.id, {
      agentWorkspaceUser: "dev",
      agentWorkspacePassword: "already-set-password",
    });

    const result = await migrateDevWorkspaceUsers({
      sessionRepository,
      vcs,
      dryRun: false,
    });

    expect(result.summary.updated).toBe(0);
    expect(result.summary.skipped).toBe(1);
    expect(result.summary.failed).toBe(0);

    const reloaded = await sessionRepository.findById(session.id);
    expect(reloaded?.agentWorkspacePassword).toBe("already-set-password");
  });
});
