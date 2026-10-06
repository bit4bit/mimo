import { describe, it, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { join, relative } from "path";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { createOS } from "../src/infrastructure/os/node-adapter.ts";
import { ImpactCalculator } from "../src/domain/impact/calculator.ts";
import { CommitService } from "../src/domain/commits/service.ts";

// Deterministic stand-in for scc: code = non-blank lines, complexity = `if (` count.
function createFakeScc() {
  return {
    isInstalled: () => true,
    install: async () => ({ success: true }),
    runSccOnFiles: async (baseDir: string, filePaths: string[]) => {
      const byFile = filePaths.map((p) => {
        const content = readFileSync(p, "utf-8");
        const lines = content.split("\n").filter((l) => l.trim() !== "");
        return {
          path: relative(baseDir, p),
          language: "TypeScript",
          lines: lines.length,
          code: lines.length,
          comment: 0,
          blank: 0,
          complexity: (content.match(/if \(/g) || []).length,
        };
      });
      return {
        linesOfCode: { added: 0, removed: 0, net: 0 },
        totalLines: { upstream: 0, workspace: 0 },
        complexity: { cyclomatic: 0, cognitive: 0, estimatedMinutes: 0 },
        byLanguage: [],
        byFile,
      };
    },
  };
}

describe("Commit impact record reflects the committed change", () => {
  let root: string;
  let upstream: string;
  let workspace: string;
  let saved: any[];
  let service: CommitService;
  let session: any;

  beforeEach(() => {
    root = join(
      tmpdir(),
      `mimo-impact-commit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    rmSync(root, { recursive: true, force: true });
    upstream = join(root, "upstream");
    workspace = join(root, "agent-workspace");
    mkdirSync(upstream, { recursive: true });
    mkdirSync(workspace, { recursive: true });
    saved = [];

    const os = createOS({ PATH: process.env.PATH });
    const jscpd = { isInstalled: async () => false };
    const impactCalculator = new ImpactCalculator(
      createFakeScc() as any,
      jscpd as any,
      os,
    );
    session = {
      id: "s1",
      name: "Session One",
      projectId: "p1",
      upstreamPath: upstream,
      agentWorkspacePath: workspace,
      repos: [
        {
          projectRepoId: "default",
          upstreamPath: upstream,
          workspacePath: workspace,
        },
      ],
    };
    const project = {
      id: "p1",
      owner: "u",
      repositories: [{ id: "default", repoType: "git", mountPath: "." }],
    };

    service = new CommitService({
      sessionRepository: {
        findById: async () => session,
        update: async (_id: string, updates: any) => {
          session = { ...session, ...updates };
          return session;
        },
      },
      projectRepository: { findById: async () => project },
      credentialRepository: { findById: async () => null },
      impactRepository: {
        save: async (r: any) => {
          saved.push(r);
        },
      },
      impactCalculator,
      vcs: {
        commitUpstream: async () => ({ success: true, commitHash: "c0ffee" }),
        pushUpstream: async () => ({ success: true }),
      } as any,
      os,
    });
  });

  it("records complexity, LOC and estimated time for a modified file", async () => {
    writeFileSync(join(upstream, "a.ts"), "export const a = 1;\n");
    writeFileSync(
      join(workspace, "a.ts"),
      [
        "export const a = 1;",
        "export function f(x: number) {",
        "  if (x > 1) return 1;",
        "  if (x > 2) return 2;",
        "  return 0;",
        "}",
        "",
      ].join("\n"),
    );

    const result = await service.commitAndPushSelective("s1", "edit a");

    expect(result.success).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0].files).toEqual({ new: 0, changed: 1, deleted: 0 });
    expect(saved[0].linesOfCode.added).toBe(5);
    expect(saved[0].complexity.cyclomatic).toBe(2);
    expect(saved[0].complexity.estimatedMinutes).toBeGreaterThan(0);
  });

  it("records removed lines for a deleted file", async () => {
    writeFileSync(join(upstream, "gone.ts"), "const a = 1;\nconst b = 2;\n");

    const result = await service.commitAndPushSelective("s1", "delete gone");

    expect(result.success).toBe(true);
    expect(saved[0].files).toEqual({ new: 0, changed: 0, deleted: 1 });
    expect(saved[0].linesOfCode.removed).toBe(2);
  });

  it("records only the selected files on a partial commit", async () => {
    writeFileSync(join(workspace, "keep.ts"), "const k = 1;\n");
    writeFileSync(join(workspace, "later.ts"), "const l = 1;\nconst m = 2;\n");

    const result = await service.commitAndPushSelective("s1", "partial", [
      "keep.ts",
    ]);

    expect(result.success).toBe(true);
    expect(saved[0].files).toEqual({ new: 1, changed: 0, deleted: 0 });
    expect(saved[0].linesOfCode.added).toBe(1);
  });

  it("stores the tokens spent since the last commit and resets them", async () => {
    session.pendingTokenUsage = {
      input: 110,
      output: 25,
      thought: 0,
      cachedRead: 50,
      cachedWrite: 0,
      total: 135,
    };
    writeFileSync(join(workspace, "n.ts"), "const n = 1;\n");

    await service.commitAndPushSelective("s1", "with tokens");

    expect(saved[0].tokens).toEqual({
      input: 110,
      output: 25,
      thought: 0,
      cachedRead: 50,
      cachedWrite: 0,
      total: 135,
    });
    expect(session.pendingTokenUsage).toBeUndefined();
  });

  it("omits tokens when no usage was reported", async () => {
    writeFileSync(join(workspace, "n.ts"), "const n = 1;\n");

    await service.commitAndPushSelective("s1", "no tokens");

    expect(saved[0]).not.toHaveProperty("tokens");
  });
});
