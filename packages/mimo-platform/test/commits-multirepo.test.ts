import { describe, expect, it } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { CommitService } from "../src/domain/commits/service.js";

describe("multi-repo commit fan-out", () => {
  it("commits per repository on a best-effort basis", async () => {
    const root = mkdtempSync(join(tmpdir(), "mimo-commit-repos-"));
    const os = createOS({ ...process.env });
    try {
      const backendUpstream = join(root, "upstream", "backend");
      const backendWorkspace = join(root, "workspace", "backend");
      const frontendUpstream = join(root, "upstream", "frontend");
      const frontendWorkspace = join(root, "workspace", "frontend");
      for (const dir of [
        backendUpstream,
        backendWorkspace,
        frontendUpstream,
        frontendWorkspace,
      ]) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(join(backendUpstream, "a.ts"), "old");
      writeFileSync(join(backendWorkspace, "a.ts"), "new");

      const session = {
        id: "session-1",
        name: "Session",
        projectId: "project-1",
        owner: "owner",
        upstreamPath: join(root, "upstream"),
        agentWorkspacePath: join(root, "workspace"),
        repos: [
          {
            projectRepoId: "backend",
            upstreamPath: backendUpstream,
            workspacePath: backendWorkspace,
            branch: "main",
            baseline: "base-backend",
          },
          {
            projectRepoId: "frontend",
            upstreamPath: frontendUpstream,
            workspacePath: frontendWorkspace,
            branch: "main",
            baseline: "base-frontend",
          },
        ],
      };
      const project = {
        id: "project-1",
        owner: "owner",
        repositories: [
          {
            id: "backend",
            repoUrl: "https://example/backend",
            repoType: "git",
          },
          {
            id: "frontend",
            repoUrl: "https://example/frontend",
            repoType: "git",
          },
        ],
      };

      const vcs = {
        revParse: async () => "base",
        diffNameStatus: async (workspacePath: string) =>
          workspacePath === backendWorkspace
            ? {
                files: [{ path: "a.ts", status: "modified", size: 3 }],
                summary: { added: 0, modified: 1, deleted: 0 },
              }
            : { files: [], summary: { added: 0, modified: 0, deleted: 0 } },
        commitUpstream: async () => ({ success: true, commitHash: "commit-1" }),
        pushUpstream: async (upstreamPath: string) =>
          upstreamPath === backendUpstream
            ? { success: false, error: "push rejected" }
            : { success: true },
        advanceBaseline: async () => "new-base",
      };

      const service = new CommitService({
        sessionRepository: {
          findById: async () => session,
          update: async () => session,
        },
        projectRepository: { findById: async () => project },
        credentialRepository: { findById: async () => null },
        impactRepository: { save: () => {} },
        impactCalculator: {
          calculateImpact: async () => ({
            metrics: {
              files: { new: 0, changed: 1, deleted: 0 },
              linesOfCode: { added: 1, removed: 1, net: 0 },
            },
          }),
        },
        vcs: vcs as any,
        os,
      });

      const result = await service.commitAndPushAcrossRepos(
        "session-1",
        "feat: cross-repo change",
      );

      expect(result.success).toBe(false);
      expect(result.results).toContainEqual(
        expect.objectContaining({ repoId: "backend", status: "failed" }),
      );
      expect(result.results).toContainEqual(
        expect.objectContaining({ repoId: "frontend", status: "skipped" }),
      );
      expect(readFileSync(join(backendUpstream, "a.ts"), "utf-8")).toBe("new");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
