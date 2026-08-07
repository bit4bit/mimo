// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { CommitService } from "../src/domain/commits/service.js";

function makeSession(root: string) {
  return {
    id: "session-1",
    name: "Session",
    projectId: "project-1",
    owner: "owner",
    upstreamPath: join(root, "upstream"),
    agentWorkspacePath: join(root, "workspace"),
    repos: [
      {
        projectRepoId: "backend",
        upstreamPath: join(root, "upstream", "backend"),
        workspacePath: join(root, "workspace", "backend"),
        branch: "main",
        baseline: "base-backend",
      },
      {
        projectRepoId: "frontend",
        upstreamPath: join(root, "upstream", "frontend"),
        workspacePath: join(root, "workspace", "frontend"),
        branch: "main",
        baseline: "base-frontend",
      },
    ],
  };
}

const project = {
  id: "project-1",
  owner: "owner",
  repositories: [
    { id: "backend", repoUrl: "https://example/backend", repoType: "git" },
    { id: "frontend", repoUrl: "https://example/frontend", repoType: "git" },
  ],
};

function makeService(options: {
  session: any;
  pullForce?: (
    workDir: string,
    repoType: string,
    credential: any,
    branch?: string,
    clonePort?: number,
  ) => Promise<any>;
  pushUpstream?: (...args: any[]) => Promise<any>;
  updates?: any[];
  pullForceCalls?: any[];
  pushCalls?: any[];
  seedCalls?: any[];
  checkoutCalls?: any[];
  seedResult?: { success: boolean; error?: string; commitHash?: string };
  checkoutResult?: { success: boolean; error?: string };
}) {
  const os = createOS({ ...process.env });
  const vcs: any = {
    pullForce: options.pullForce
      ? options.pullForce
      : async (
          workDir: string,
          repoType: string,
          _credential: any,
          branch?: string,
          _clonePort?: number,
        ) => {
          options.pullForceCalls?.push({ workDir, repoType, branch });
          return { success: true, output: "new-head" };
        },
    seedSessionRepo: async (
      _upstream: string,
      _repoType: string,
      repoPath: string,
      branch?: string,
    ) => {
      options.seedCalls?.push({ repoPath, branch });
      return (
        options.seedResult ?? {
          success: true,
          commitHash: "new-head",
        }
      );
    },
    clonePlatformCheckout: async (
      repoPath: string,
      workspacePath: string,
      branch?: string,
    ) => {
      options.checkoutCalls?.push({ repoPath, workspacePath, branch });
      return options.checkoutResult ?? { success: true };
    },
    pushUpstream: options.pushUpstream
      ? options.pushUpstream
      : async (...args: any[]) => {
          options.pushCalls?.push(args);
          return { success: true };
        },
  };

  return new CommitService({
    sessionRepository: {
      findById: async () => options.session,
      update: async (id: string, updates: any) => {
        options.updates?.push({ id, updates });
        return options.session;
      },
      getSessionRepoPath: (sessionId: string, repoId?: string) =>
        join(
          rootForSession(options.session, sessionId),
          `${repoId ?? "default"}.git`,
        ),
    },
    projectRepository: { findById: async () => project },
    credentialRepository: { findById: async () => null },
    impactRepository: { save: () => {} },
    impactCalculator: {
      calculateImpact: async () => ({
        metrics: {
          files: { new: 0, changed: 0, deleted: 0 },
          linesOfCode: { added: 0, removed: 0, net: 0 },
        },
      }),
    },
    vcs,
    os,
  });
}

function rootForSession(session: any, sessionId: string): string {
  if (!session) return tmpdir();
  const upstream = session.repos?.[0]?.upstreamPath ?? session.upstreamPath;
  if (!upstream) return tmpdir();
  // upstream is <root>/upstream/<repoId>; the bare mirror lives alongside the
  // session under the vcs repos dir, so just return the session root dir.
  return join(upstream, "..", "..");
}

describe("pullForceAcrossRepos", () => {
  it("resets upstream to remote HEAD, re-seeds the bare mirror, and re-clones the workspace for the target repo", async () => {
    const root = mkdtempSync(join(tmpdir(), "mimo-pullforce-"));
    try {
      const pullForceCalls: any[] = [];
      const seedCalls: any[] = [];
      const checkoutCalls: any[] = [];
      const updates: any[] = [];
      const service = makeService({
        session: makeSession(root),
        pullForceCalls,
        seedCalls,
        checkoutCalls,
        updates,
      });

      const result = await service.pullForceAcrossRepos("session-1", "backend");

      expect(result.success).toBe(true);

      // 1. Upstream reset to remote HEAD via its real-remote origin (the only
      //    vcs.pullForce call — credentials are baked into upstream's origin
      //    URL at clone time).
      expect(pullForceCalls).toHaveLength(1);
      expect(pullForceCalls[0].workDir).toBe(join(root, "upstream", "backend"));
      expect(pullForceCalls[0].branch).toBe("main");

      // 2. Bare mirror re-seeded from the reset upstream.
      expect(seedCalls).toHaveLength(1);
      expect(seedCalls[0].branch).toBe("main");

      // 3. Workspace re-cloned from the bare mirror.
      expect(checkoutCalls).toHaveLength(1);
      expect(checkoutCalls[0].workspacePath).toBe(
        join(root, "workspace", "backend"),
      );
      expect(checkoutCalls[0].branch).toBe("main");

      // 4. Baseline persisted to the new remote HEAD.
      const baselineUpdate = updates.find(
        (u) => u.updates.repos?.[0]?.baseline === "new-head",
      );
      expect(baselineUpdate).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fans out the reset→re-seed→re-clone chain across every repo when no repoId is given", async () => {
    const root = mkdtempSync(join(tmpdir(), "mimo-pullforce-"));
    try {
      const pullForceCalls: any[] = [];
      const seedCalls: any[] = [];
      const checkoutCalls: any[] = [];
      const service = makeService({
        session: makeSession(root),
        pullForceCalls,
        seedCalls,
        checkoutCalls,
      });

      const result = await service.pullForceAcrossRepos("session-1");

      expect(result.success).toBe(true);
      expect(pullForceCalls.map((c) => c.workDir)).toEqual([
        join(root, "upstream", "backend"),
        join(root, "upstream", "frontend"),
      ]);
      expect(seedCalls).toHaveLength(2);
      expect(checkoutCalls.map((c) => c.workspacePath)).toEqual([
        join(root, "workspace", "backend"),
        join(root, "workspace", "frontend"),
      ]);
      expect(result.results).toHaveLength(2);
      expect(result.results.map((r) => r.repoId)).toEqual([
        "backend",
        "frontend",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("marks a fossil repo as failed with 'not supported' while other repos succeed", async () => {
    const root = mkdtempSync(join(tmpdir(), "mimo-pullforce-"));
    try {
      const session = makeSession(root);
      session.repos = [
        { ...session.repos[0], projectRepoId: "backend" },
        {
          projectRepoId: "fossil-repo",
          upstreamPath: join(root, "upstream", "fossil-repo"),
          workspacePath: join(root, "workspace", "fossil-repo"),
          branch: "trunk",
        },
      ];
      const projectWithFossil = {
        ...project,
        repositories: [
          ...project.repositories,
          {
            id: "fossil-repo",
            repoUrl: "https://example/fossil",
            repoType: "fossil",
          },
        ],
      };
      const os = createOS({ ...process.env });
      const service = new CommitService({
        sessionRepository: {
          findById: async () => session,
          update: async () => session,
          getSessionRepoPath: (sid: string, rid?: string) =>
            join(root, `${rid ?? "default"}.git`),
        },
        projectRepository: { findById: async () => projectWithFossil },
        credentialRepository: { findById: async () => null },
        impactRepository: { save: () => {} },
        impactCalculator: {
          calculateImpact: async () => ({ metrics: {} }),
        },
        vcs: {
          pullForce: async (_wd: string, repoType: string) =>
            repoType === "fossil"
              ? {
                  success: false,
                  error: "Pull force is not supported for Fossil repositories",
                }
              : { success: true, output: "new-head" },
          seedSessionRepo: async () => ({
            success: true,
            commitHash: "new-head",
          }),
          clonePlatformCheckout: async () => ({ success: true }),
        } as any,
        os,
      });

      const result = await service.pullForceAcrossRepos("session-1");

      expect(result.success).toBe(false);
      expect(result.results).toContainEqual(
        expect.objectContaining({
          repoId: "backend",
          status: "succeeded",
        }),
      );
      expect(result.results).toContainEqual(
        expect.objectContaining({
          repoId: "fossil-repo",
          status: "failed",
          error: "Pull force is not supported for Fossil repositories",
        }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails the repo without updating the baseline when the upstream reset fails (e.g. auth error)", async () => {
    const root = mkdtempSync(join(tmpdir(), "mimo-pullforce-"));
    try {
      const updates: any[] = [];
      const service = makeService({
        session: makeSession(root),
        updates,
        pullForce: async () => ({
          success: false,
          error: "Authentication failed. Please check your credentials.",
        }),
      });

      const result = await service.pullForceAcrossRepos("session-1", "backend");

      expect(result.success).toBe(false);
      expect(result.results[0].status).toBe("failed");
      expect(result.results[0].error).toContain("Authentication failed");
      const anyBaselineUpdate = updates.filter((u) =>
        u.updates?.repos?.some((r: any) => r.baseline !== undefined),
      );
      expect(anyBaselineUpdate).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails the repo without updating the baseline when the upstream reset succeeds but re-seeding the bare mirror fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "mimo-pullforce-"));
    try {
      const updates: any[] = [];
      const service = makeService({
        session: makeSession(root),
        updates,
        seedResult: { success: false, error: "git clone --bare failed" },
      });

      const result = await service.pullForceAcrossRepos("session-1", "backend");

      expect(result.success).toBe(false);
      expect(result.results[0].status).toBe("failed");
      expect(result.results[0].error).toContain("git clone --bare failed");
      const anyBaselineUpdate = updates.filter((u) =>
        u.updates?.repos?.some((r: any) => r.baseline !== undefined),
      );
      expect(anyBaselineUpdate).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails the repo without updating the baseline when re-cloning the workspace fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "mimo-pullforce-"));
    try {
      const updates: any[] = [];
      const service = makeService({
        session: makeSession(root),
        updates,
        checkoutResult: { success: false, error: "checkout failed" },
      });

      const result = await service.pullForceAcrossRepos("session-1", "backend");

      expect(result.success).toBe(false);
      expect(result.results[0].status).toBe("failed");
      expect(result.results[0].error).toContain("checkout failed");
      const anyBaselineUpdate = updates.filter((u) =>
        u.updates?.repos?.some((r: any) => r.baseline !== undefined),
      );
      expect(anyBaselineUpdate).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns an empty failure when the session does not exist", async () => {
    const service = makeService({ session: null } as any);
    service["deps"].sessionRepository.findById = async () => null;
    const result = await service.pullForceAcrossRepos("nope");
    expect(result).toEqual({
      success: false,
      message: "Session not found",
      results: [],
    });
  });
});

describe("forcePushAcrossRepos", () => {
  it("force-pushes every repo when no repoId is given", async () => {
    const root = mkdtempSync(join(tmpdir(), "mimo-pushforce-"));
    try {
      const pushCalls: any[] = [];
      const service = makeService({ session: makeSession(root), pushCalls });

      const result = await service.forcePushAcrossRepos("session-1");

      expect(result.success).toBe(true);
      expect(pushCalls.map((c) => c[0])).toEqual([
        join(root, "upstream", "backend"),
        join(root, "upstream", "frontend"),
      ]);
      expect(pushCalls.every((c) => c[4]?.force === true)).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results.map((r) => r.status)).toEqual([
        "succeeded",
        "succeeded",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("targets only the given repo when repoId is provided", async () => {
    const root = mkdtempSync(join(tmpdir(), "mimo-pushforce-"));
    try {
      const pushCalls: any[] = [];
      const service = makeService({ session: makeSession(root), pushCalls });

      const result = await service.forcePushAcrossRepos("session-1", "backend");

      expect(result.success).toBe(true);
      expect(pushCalls).toHaveLength(1);
      expect(pushCalls[0][0]).toBe(join(root, "upstream", "backend"));
      expect(result.results.map((r) => r.repoId)).toEqual(["backend"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("aggregates per-repo failures without aborting other repos", async () => {
    const root = mkdtempSync(join(tmpdir(), "mimo-pushforce-"));
    try {
      const backendUpstream = join(root, "upstream", "backend");
      const service = makeService({
        session: makeSession(root),
        pushUpstream: async (upstreamPath: string) =>
          upstreamPath === backendUpstream
            ? { success: false, error: "rejected" }
            : { success: true },
      });

      const result = await service.forcePushAcrossRepos("session-1");

      expect(result.success).toBe(false);
      expect(result.message).toContain("failed");
      expect(result.results).toContainEqual(
        expect.objectContaining({
          repoId: "backend",
          status: "failed",
          error: "rejected",
        }),
      );
      expect(result.results).toContainEqual(
        expect.objectContaining({ repoId: "frontend", status: "succeeded" }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
