import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { detectChangedFiles } from "../src/domain/files/changed-files.js";
import { createManifestStore } from "../src/domain/files/tree-manifest.js";

/**
 * Behavior of the two-tree change detection used by the commit preview.
 * The preview is the upstream -> agent-workspace delta and must classify
 * by size first, reading file content only to disambiguate same-size pairs.
 */
describe("detectChangedFiles (size-first two-tree compare)", () => {
  let testHome: string;
  let os: any;
  let readCount: number;

  beforeEach(() => {
    testHome = join(
      tmpdir(),
      `mimo-sizefirst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
    mkdirSync(testHome, { recursive: true });

    os = createOS({ ...process.env });

    // Spy on content reads so we can assert size-first avoids them.
    readCount = 0;
    const realReadAsync = os.fs.readFileAsync.bind(os.fs);
    os.fs.readFileAsync = (...args: any[]) => {
      const path = args[0] as string;
      // Exclude manifest-store reads from the count; we only care about
      // project-file content reads.
      if (!path.includes(".manifests")) {
        readCount++;
      }
      return realReadAsync(...args);
    };
  });

  afterEach(() => {
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}
  });

  function manifestStore(testHome: string) {
    return createManifestStore(os, join(testHome, ".manifests"));
  }

  it("classifies added, deleted, and size-differing files without reading content", async () => {
    const upstream = join(testHome, "upstream");
    const workspace = join(testHome, "workspace");
    mkdirSync(upstream, { recursive: true });
    mkdirSync(workspace, { recursive: true });

    // f1: present both sides, different size -> modified (no read needed)
    writeFileSync(join(upstream, "f1.txt"), "aaa");
    writeFileSync(join(workspace, "f1.txt"), "aaaaaa");
    // f2: only upstream -> deleted
    writeFileSync(join(upstream, "f2.txt"), "bbb");
    // f3: only workspace -> added
    writeFileSync(join(workspace, "f3.txt"), "new content");

    const result = await detectChangedFiles(
      os,
      upstream,
      workspace,
      undefined,
      manifestStore(testHome),
    );

    expect(result.summary).toEqual({ added: 1, modified: 1, deleted: 1 });
    expect(result.files.find((f) => f.path === "f1.txt")?.status).toBe(
      "modified",
    );
    expect(result.files.find((f) => f.path === "f2.txt")?.status).toBe(
      "deleted",
    );
    expect(result.files.find((f) => f.path === "f3.txt")?.status).toBe("added");

    // First scan (no manifest yet) reads every file to populate the manifest.
    expect(readCount).toBeGreaterThan(0);

    readCount = 0;
    const cached = await detectChangedFiles(
      os,
      upstream,
      workspace,
      undefined,
      manifestStore(testHome),
    );
    expect(cached).toEqual(result);
    // Second scan reuses cached hashes; no content reads.
    expect(readCount).toBe(0);
  });

  it("reads content only to disambiguate equal-size files", async () => {
    const upstream = join(testHome, "upstream");
    const workspace = join(testHome, "workspace");
    mkdirSync(upstream, { recursive: true });
    mkdirSync(workspace, { recursive: true });

    // changed: same size, different content -> modified
    writeFileSync(join(upstream, "changed.txt"), "abc");
    writeFileSync(join(workspace, "changed.txt"), "xyz");
    // same: identical -> not a change
    writeFileSync(join(upstream, "same.txt"), "hello world");
    writeFileSync(join(workspace, "same.txt"), "hello world");

    const result = await detectChangedFiles(
      os,
      upstream,
      workspace,
      undefined,
      manifestStore(testHome),
    );

    expect(result.summary).toEqual({ added: 0, modified: 1, deleted: 0 });
    expect(result.files.map((f) => f.path)).toEqual(["changed.txt"]);
    // First scan reads every file to populate the manifest.
    expect(readCount).toBeGreaterThan(0);

    readCount = 0;
    const cached = await detectChangedFiles(
      os,
      upstream,
      workspace,
      undefined,
      manifestStore(testHome),
    );
    expect(cached).toEqual(result);
    // Second scan reuses cached hashes; no content reads.
    expect(readCount).toBe(0);
  });

  it("excludes VCS internals and node_modules from the comparison", async () => {
    const upstream = join(testHome, "upstream");
    const workspace = join(testHome, "workspace");
    mkdirSync(join(upstream, ".git"), { recursive: true });
    mkdirSync(join(workspace, "node_modules", "pkg"), { recursive: true });
    mkdirSync(workspace, { recursive: true });

    writeFileSync(join(upstream, ".git", "config"), "[core]\n");
    writeFileSync(join(workspace, "node_modules", "pkg", "index.js"), "x");
    writeFileSync(join(workspace, "real.txt"), "real change");

    const result = await detectChangedFiles(
      os,
      upstream,
      workspace,
      undefined,
      manifestStore(testHome),
    );

    expect(result.files.map((f) => f.path)).toEqual(["real.txt"]);
    expect(
      result.files.some(
        (f) => f.path.includes(".git") || f.path.includes("node_modules"),
      ),
    ).toBe(false);
  });

  it("reads no content on a second unchanged run by reusing cached hashes", async () => {
    const upstream = join(testHome, "upstream");
    const workspace = join(testHome, "workspace");
    mkdirSync(upstream, { recursive: true });
    mkdirSync(workspace, { recursive: true });

    writeFileSync(join(upstream, "a.txt"), "alpha");
    writeFileSync(join(workspace, "a.txt"), "alpha");
    writeFileSync(join(upstream, "b.txt"), "beta");
    writeFileSync(join(workspace, "b.txt"), "beta");

    const first = await detectChangedFiles(
      os,
      upstream,
      workspace,
      undefined,
      manifestStore(testHome),
    );
    expect(first.summary).toEqual({ added: 0, modified: 0, deleted: 0 });
    expect(readCount).toBeGreaterThan(0);

    readCount = 0;
    const second = await detectChangedFiles(
      os,
      upstream,
      workspace,
      undefined,
      manifestStore(testHome),
    );
    expect(second).toEqual(first);
    expect(readCount).toBe(0);
  });

  it("only re-reads and reports the one file that changed", async () => {
    const upstream = join(testHome, "upstream");
    const workspace = join(testHome, "workspace");
    mkdirSync(upstream, { recursive: true });
    mkdirSync(workspace, { recursive: true });

    writeFileSync(join(upstream, "a.txt"), "alpha");
    writeFileSync(join(workspace, "a.txt"), "alpha");
    writeFileSync(join(upstream, "b.txt"), "beta");
    writeFileSync(join(workspace, "b.txt"), "beta");

    const first = await detectChangedFiles(
      os,
      upstream,
      workspace,
      undefined,
      manifestStore(testHome),
    );
    expect(first.summary).toEqual({ added: 0, modified: 0, deleted: 0 });
    expect(readCount).toBeGreaterThan(0);

    writeFileSync(join(workspace, "b.txt"), "beta-changed");
    // Ensure a distinguishable mtime so the stat-cache invalidates cleanly.
    await new Promise((resolve) => setTimeout(resolve, 50));

    readCount = 0;
    const second = await detectChangedFiles(
      os,
      upstream,
      workspace,
      undefined,
      manifestStore(testHome),
    );
    expect(second.summary).toEqual({ added: 0, modified: 1, deleted: 0 });
    expect(second.files).toEqual([
      { path: "b.txt", status: "modified", size: 12 },
    ]);
    expect(readCount).toBe(1);
  });

  it("does not re-read an unchanged sibling when another file changes", async () => {
    const upstream = join(testHome, "upstream");
    const workspace = join(testHome, "workspace");
    mkdirSync(upstream, { recursive: true });
    mkdirSync(workspace, { recursive: true });

    writeFileSync(join(upstream, "a.txt"), "alpha");
    writeFileSync(join(workspace, "a.txt"), "alpha");
    writeFileSync(join(upstream, "b.txt"), "beta");
    writeFileSync(join(workspace, "b.txt"), "beta");

    await detectChangedFiles(
      os,
      upstream,
      workspace,
      undefined,
      manifestStore(testHome),
    );

    writeFileSync(join(workspace, "b.txt"), "beta-changed");
    await new Promise((resolve) => setTimeout(resolve, 50));

    readCount = 0;
    const result = await detectChangedFiles(
      os,
      upstream,
      workspace,
      undefined,
      manifestStore(testHome),
    );

    expect(result.files).toEqual([
      { path: "b.txt", status: "modified", size: 12 },
    ]);
    expect(readCount).toBe(1);
  });

  it("rebuilds the manifest and still produces the correct delta when the manifest is corrupt", async () => {
    const upstream = join(testHome, "upstream");
    const workspace = join(testHome, "workspace");
    mkdirSync(upstream, { recursive: true });
    mkdirSync(workspace, { recursive: true });

    writeFileSync(join(upstream, "a.txt"), "alpha");
    writeFileSync(join(workspace, "a.txt"), "alpha");
    writeFileSync(join(upstream, "b.txt"), "beta");
    writeFileSync(join(workspace, "b.txt"), "beta-changed");

    const store = manifestStore(testHome);
    const upstreamName = os.path.basename(upstream);
    const upstreamManifestPath = join(
      testHome,
      ".manifests",
      `${upstreamName}.json`,
    );
    mkdirSync(join(testHome, ".manifests"), { recursive: true });
    writeFileSync(upstreamManifestPath, "this is not json");

    readCount = 0;
    const result = await detectChangedFiles(
      os,
      upstream,
      workspace,
      undefined,
      store,
    );
    expect(result.summary).toEqual({ added: 0, modified: 1, deleted: 0 });
    expect(result.files).toEqual([
      { path: "b.txt", status: "modified", size: 12 },
    ]);
    expect(readCount).toBeGreaterThan(0);
  });
});
