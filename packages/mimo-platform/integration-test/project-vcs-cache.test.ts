import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { VCS } from "../src/domain/vcs/index.js";
import { createProjectVcsCache } from "../src/domain/projects/vcs-cache.js";

describe("ProjectVcsCache integration", () => {
  let testHome: string;
  let projectsPath: string;

  beforeEach(() => {
    testHome = join(
      tmpdir(),
      `mimo-vcs-cache-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    projectsPath = join(testHome, "projects");
    mkdirSync(projectsPath, { recursive: true });
  });

  afterEach(() => {
    rmSync(testHome, { recursive: true, force: true });
  });

  it("clones git sessions from project cache", async () => {
    const os = createOS({ ...process.env });
    const vcs = new VCS({ os });
    const cache = createProjectVcsCache({ os, projectsPath, vcs });

    const remoteWorktree = join(testHome, "git-source");
    const remoteBare = join(testHome, "git-remote.git");
    mkdirSync(remoteWorktree, { recursive: true });

    execSync("git init -q", { cwd: remoteWorktree });
    execSync('git config user.email "test@example.com"', {
      cwd: remoteWorktree,
    });
    execSync('git config user.name "test"', { cwd: remoteWorktree });
    writeFileSync(join(remoteWorktree, "README.md"), "hello\n");
    execSync("git add README.md", { cwd: remoteWorktree });
    execSync('git commit -qm "initial"', { cwd: remoteWorktree });
    execSync(`git clone --bare ${remoteWorktree} ${remoteBare}`);
    execSync(`git -C ${remoteWorktree} remote add origin ${remoteBare}`);

    const projectId = "git-project";
    mkdirSync(join(projectsPath, projectId), { recursive: true });

    const firstTarget = join(testHome, "session-1-upstream");
    const firstResult = await cache.clone({
      projectId,
      repoUrl: remoteBare,
      repoType: "git",
      targetPath: firstTarget,
    });

    expect(firstResult.success).toBe(true);
    expect(existsSync(join(projectsPath, projectId, "cache.git"))).toBe(true);
    expect(existsSync(join(firstTarget, "README.md"))).toBe(true);

    writeFileSync(join(remoteWorktree, "CHANGELOG.md"), "v1\n");
    execSync("git add CHANGELOG.md", { cwd: remoteWorktree });
    execSync('git commit -qm "changelog"', { cwd: remoteWorktree });
    execSync("git push -q origin HEAD", { cwd: remoteWorktree });

    const secondTarget = join(testHome, "session-2-upstream");
    const secondResult = await cache.clone({
      projectId,
      repoUrl: remoteBare,
      repoType: "git",
      targetPath: secondTarget,
    });

    expect(secondResult.success).toBe(true);
    expect(existsSync(join(secondTarget, "CHANGELOG.md"))).toBe(true);
  }, 30000);

  it("opens fossil sessions from project cache", async () => {
    const os = createOS({ ...process.env });
    const vcs = new VCS({ os });
    const cache = createProjectVcsCache({ os, projectsPath, vcs });

    const sourceFossil = join(testHome, "source.fossil");
    const sourceCheckout = join(testHome, "source-checkout");
    mkdirSync(sourceCheckout, { recursive: true });

    execSync(`fossil init ${sourceFossil}`);
    execSync(
      `fossil open ${sourceFossil} --workdir ${sourceCheckout} --nested --force`,
    );
    execSync("fossil user new mimo-test-user mimo-test-pass", {
      cwd: sourceCheckout,
    });
    execSync("fossil user default mimo-test-user", { cwd: sourceCheckout });
    writeFileSync(join(sourceCheckout, "README.md"), "hello fossil\n");
    execSync("fossil add README.md", { cwd: sourceCheckout });
    execSync('fossil commit -m "initial"', { cwd: sourceCheckout });

    const projectId = "fossil-project";
    mkdirSync(join(projectsPath, projectId), { recursive: true });

    const firstTarget = join(testHome, "fossil-session-1");
    const firstResult = await cache.clone({
      projectId,
      repoUrl: sourceFossil,
      repoType: "fossil",
      targetPath: firstTarget,
    });

    expect(firstResult.success).toBe(true);
    expect(existsSync(join(projectsPath, projectId, "cache.fossil"))).toBe(
      true,
    );
    expect(existsSync(join(firstTarget, "README.md"))).toBe(true);

    writeFileSync(join(sourceCheckout, "NOTES.md"), "notes\n");
    execSync("fossil add NOTES.md", { cwd: sourceCheckout });
    execSync('fossil commit -m "notes"', { cwd: sourceCheckout });

    const secondTarget = join(testHome, "fossil-session-2");
    const secondResult = await cache.clone({
      projectId,
      repoUrl: sourceFossil,
      repoType: "fossil",
      targetPath: secondTarget,
    });

    expect(secondResult.success).toBe(true);
    expect(existsSync(join(secondTarget, "NOTES.md"))).toBe(true);
  }, 30000);

  it("clears and rebuilds corrupted git cache", async () => {
    const os = createOS({ ...process.env });
    const vcs = new VCS({ os });
    const cache = createProjectVcsCache({ os, projectsPath, vcs });

    const remoteWorktree = join(testHome, "git-source-corrupt");
    const remoteBare = join(testHome, "git-remote-corrupt.git");
    mkdirSync(remoteWorktree, { recursive: true });

    execSync("git init -q", { cwd: remoteWorktree });
    execSync('git config user.email "test@example.com"', {
      cwd: remoteWorktree,
    });
    execSync('git config user.name "test"', { cwd: remoteWorktree });
    writeFileSync(join(remoteWorktree, "A.md"), "a\n");
    execSync("git add A.md", { cwd: remoteWorktree });
    execSync('git commit -qm "initial"', { cwd: remoteWorktree });
    execSync(`git clone --bare ${remoteWorktree} ${remoteBare}`);

    const projectId = "git-project-corrupt";
    mkdirSync(join(projectsPath, projectId), { recursive: true });

    const initialTarget = join(testHome, "session-initial");
    const initial = await cache.clone({
      projectId,
      repoUrl: remoteBare,
      repoType: "git",
      targetPath: initialTarget,
    });
    expect(initial.success).toBe(true);

    const headPath = join(projectsPath, projectId, "cache.git", "HEAD");
    writeFileSync(headPath, "broken-head\n");

    const rebuiltTarget = join(testHome, "session-rebuilt");
    const rebuilt = await cache.clone({
      projectId,
      repoUrl: remoteBare,
      repoType: "git",
      targetPath: rebuiltTarget,
    });

    expect(rebuilt.success).toBe(true);
    expect(existsSync(join(rebuiltTarget, "A.md"))).toBe(true);
    expect(readFileSync(headPath, "utf-8")).toContain("refs/");
  }, 30000);

  it("uses separate caches per project repository and clears all of them", async () => {
    const os = createOS({ ...process.env });
    const vcs = new VCS({ os });
    const cache = createProjectVcsCache({ os, projectsPath, vcs });

    const makeRemote = (name: string, fileName: string): string => {
      const worktree = join(testHome, `${name}-worktree`);
      const bare = join(testHome, `${name}.git`);
      mkdirSync(worktree, { recursive: true });
      execSync("git init -q", { cwd: worktree });
      execSync('git config user.email "test@example.com"', { cwd: worktree });
      execSync('git config user.name "test"', { cwd: worktree });
      writeFileSync(join(worktree, fileName), `${fileName}\n`);
      execSync(`git add ${fileName}`, { cwd: worktree });
      execSync('git commit -qm "initial"', { cwd: worktree });
      execSync(`git clone --bare ${worktree} ${bare}`);
      return bare;
    };

    const backendRemote = makeRemote("backend", "backend.md");
    const frontendRemote = makeRemote("frontend", "frontend.md");
    const projectId = "multi-repo-project";
    mkdirSync(join(projectsPath, projectId), { recursive: true });

    const backendTarget = join(testHome, "backend-session");
    const frontendTarget = join(testHome, "frontend-session");
    const backend = await cache.clone({
      projectId,
      repoId: "backend",
      repoUrl: backendRemote,
      repoType: "git",
      targetPath: backendTarget,
    });
    const frontend = await cache.clone({
      projectId,
      repoId: "frontend",
      repoUrl: frontendRemote,
      repoType: "git",
      targetPath: frontendTarget,
    });

    expect(backend.success).toBe(true);
    expect(frontend.success).toBe(true);
    expect(existsSync(join(projectsPath, projectId, "cache-backend.git"))).toBe(
      true,
    );
    expect(
      existsSync(join(projectsPath, projectId, "cache-frontend.git")),
    ).toBe(true);
    expect(existsSync(join(backendTarget, "backend.md"))).toBe(true);
    expect(existsSync(join(frontendTarget, "frontend.md"))).toBe(true);

    await cache.clear(projectId, "git");
    expect(existsSync(join(projectsPath, projectId, "cache-backend.git"))).toBe(
      false,
    );
    expect(
      existsSync(join(projectsPath, projectId, "cache-frontend.git")),
    ).toBe(false);
  }, 30000);
});
