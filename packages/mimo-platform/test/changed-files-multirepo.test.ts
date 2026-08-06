import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { detectChangedFilesForRepos } from "../src/domain/files/changed-files.js";

describe("repo-qualified changed-file detection", () => {
  it("detects changes across all session repositories", async () => {
    const root = mkdtempSync(join(tmpdir(), "mimo-changed-repos-"));
    const os = createOS({ ...process.env });
    try {
      const repos = [
        {
          repoId: "backend",
          upstreamPath: join(root, "upstream", "backend"),
          workspacePath: join(root, "workspace", "backend"),
        },
        {
          repoId: "frontend",
          upstreamPath: join(root, "upstream", "frontend"),
          workspacePath: join(root, "workspace", "frontend"),
        },
      ];
      for (const repo of repos) {
        mkdirSync(repo.upstreamPath, { recursive: true });
        mkdirSync(repo.workspacePath, { recursive: true });
      }
      writeFileSync(join(repos[0].upstreamPath, "same.ts"), "same");
      writeFileSync(join(repos[0].workspacePath, "same.ts"), "changed");
      writeFileSync(join(repos[1].workspacePath, "new.ts"), "new");

      const result = await detectChangedFilesForRepos(os, repos);
      expect(result.files).toContainEqual(
        expect.objectContaining({
          repoId: "backend",
          path: "same.ts",
          status: "modified",
        }),
      );
      expect(result.files).toContainEqual(
        expect.objectContaining({
          repoId: "frontend",
          path: "new.ts",
          status: "added",
        }),
      );
      expect(result.summary).toEqual({ added: 1, modified: 1, deleted: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
