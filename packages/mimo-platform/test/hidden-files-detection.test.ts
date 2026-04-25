import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { detectChangedFiles } from "../src/files/changed-files";
import { createOS } from "../src/os/node-adapter.js";

describe("detectChangedFiles — hidden files", () => {
  let upstream: string;
  let workspace: string;
  let os: ReturnType<typeof createOS>;

  beforeEach(() => {
    upstream = mkdtempSync(join(tmpdir(), "mimo-upstream-"));
    workspace = mkdtempSync(join(tmpdir(), "mimo-workspace-"));
    os = createOS({ ...process.env });
  });

  afterEach(() => {
    rmSync(upstream, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  it("detects a hidden file added in workspace as added", async () => {
    writeFileSync(join(workspace, ".claude"), "model: sonnet");

    const result = await detectChangedFiles(os, upstream, workspace);

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain(".claude");
  });

  it("detects a hidden directory added in workspace as added", async () => {
    mkdirSync(join(workspace, ".opencode"), { recursive: true });
    writeFileSync(join(workspace, ".opencode", "config.json"), "{}");

    const result = await detectChangedFiles(os, upstream, workspace);

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain(".opencode/config.json");
  });

  it("detects a hidden file modified in workspace as modified", async () => {
    writeFileSync(join(upstream, ".claude"), "model: opus");
    writeFileSync(join(workspace, ".claude"), "model: sonnet");

    const result = await detectChangedFiles(os, upstream, workspace);

    const found = result.files.find((f) => f.path === ".claude");
    expect(found?.status).toBe("modified");
  });

  it("does not include VCS internal .fossil file", async () => {
    writeFileSync(join(workspace, ".fossil"), "fossil-internal-data");

    const result = await detectChangedFiles(os, upstream, workspace);

    const paths = result.files.map((f) => f.path);
    expect(paths).not.toContain(".fossil");
  });

  it("does not include VCS internal .fslckout file", async () => {
    writeFileSync(join(workspace, ".fslckout"), "fossil-checkout-data");

    const result = await detectChangedFiles(os, upstream, workspace);

    const paths = result.files.map((f) => f.path);
    expect(paths).not.toContain(".fslckout");
  });

  it("does not include VCS internal .git directory contents", async () => {
    mkdirSync(join(workspace, ".git"), { recursive: true });
    writeFileSync(join(workspace, ".git", "HEAD"), "ref: refs/heads/main");

    const result = await detectChangedFiles(os, upstream, workspace);

    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith(".git"))).toBe(false);
  });
});
