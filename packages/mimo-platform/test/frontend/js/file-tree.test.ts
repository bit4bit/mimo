import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const modulePath = join(import.meta.dir, "../../../public/js/file-tree.js");
const code = readFileSync(modulePath, "utf-8");

// Provide a mock module object so the IIFE assigns exports (same pattern as
// diff-overview.test.ts / diff.test.ts).
const mockModule = { exports: {} as any };
const wrappedCode = code
  .replace(/\(function \(\) \{/, "(function (module) {")
  .replace(/\}\)\(\);\s*$/, "})(mockModule);");

// eslint-disable-next-line @typescript-eslint/no-implied-eval
eval(wrappedCode);

const FT = mockModule.exports;

describe("buildTree", () => {
  it("groups flat files into nested directories by '/' segments", () => {
    const flat = [
      { path: "src/routes.ts", name: "routes.ts", size: 100 },
      { path: "src/service.ts", name: "service.ts", size: 200 },
      { path: "README.md", name: "README.md", size: 10 },
    ];
    const tree = FT.buildTree(flat);

    expect(Array.isArray(tree)).toBe(true);
    const src = tree.find((n: any) => n.name === "src");
    expect(src).toBeDefined();
    expect(src.isDir).toBe(true);
    expect(src.path).toBe("src");
    expect(Array.isArray(src.children)).toBe(true);
    expect(src.children.length).toBe(2);

    const readme = tree.find((n: any) => n.name === "README.md");
    expect(readme).toBeDefined();
    expect(readme.isDir).toBe(false);
    expect(readme.path).toBe("README.md");
  });

  it("nests deeper directories recursively and preserves sort order", () => {
    const flat = [
      { path: "src/domain/files/a.ts", name: "a.ts", size: 1 },
      { path: "src/domain/b.ts", name: "b.ts", size: 1 },
      { path: "src/index.ts", name: "index.ts", size: 1 },
    ];
    const tree = FT.buildTree(flat);

    const src = tree.find((n: any) => n.name === "src");
    const domain = src.children.find((n: any) => n.name === "domain");
    expect(domain.isDir).toBe(true);
    expect(domain.path).toBe("src/domain");

    const files = domain.children.find((n: any) => n.name === "files");
    expect(files.isDir).toBe(true);
    expect(files.path).toBe("src/domain/files");
    expect(files.children.length).toBe(1);
    expect(files.children[0].name).toBe("a.ts");

    // Intermediate directory should contain a.ts' sibling b.ts at domain level.
    const b = domain.children.find((n: any) => n.name === "b.ts");
    expect(b).toBeDefined();
    expect(b.isDir).toBe(false);

    const index = src.children.find((n: any) => n.name === "index.ts");
    expect(index).toBeDefined();
  });

  it("returns an empty array for empty input", () => {
    expect(FT.buildTree([])).toEqual([]);
  });
});

describe("computeExpandedPaths", () => {
  it("returns the set of ancestor directory paths for each changed file", () => {
    const tree = FT.buildTree([
      { path: "src/domain/files/changed.ts", name: "changed.ts", size: 1 },
      { path: "docs/readme.md", name: "readme.md", size: 1 },
    ]);
    const expanded = FT.computeExpandedPaths(tree, [
      "src/domain/files/changed.ts",
    ]);

    expect(expanded instanceof Set).toBe(true);
    expect(expanded.has("src")).toBe(true);
    expect(expanded.has("src/domain")).toBe(true);
    expect(expanded.has("src/domain/files")).toBe(true);
    // Sibling-only directories with no changed descendants are NOT expanded.
    expect(expanded.has("docs")).toBe(false);
  });

  it("returns an empty set when changedFilePaths is empty", () => {
    const tree = FT.buildTree([{ path: "src/a.ts", name: "a.ts", size: 1 }]);
    expect(FT.computeExpandedPaths(tree, []).size).toBe(0);
  });

  it("returns ancestor paths even when the tree has no nodes (tree is advisory)", () => {
    const expanded = FT.computeExpandedPaths([], ["src/x.ts"]);
    expect(expanded.has("src")).toBe(true);
    expect(expanded.size).toBe(1);
  });
});

describe("mergeChangedStatus", () => {
  it("marks each leaf with its status from the changed-files map", () => {
    const tree = FT.buildTree([
      { path: "src/a.ts", name: "a.ts", size: 1 },
      { path: "src/b.ts", name: "b.ts", size: 1 },
    ]);
    const changedFiles = [
      { path: "src/a.ts", status: "added", size: 1 },
      { path: "src/b.ts", status: "modified", size: 1 },
    ];
    const merged = FT.mergeChangedStatus(tree, changedFiles);

    const a = FT.findNode(merged, "src/a.ts");
    expect(a.status).toBe("added");
    const b = FT.findNode(merged, "src/b.ts");
    expect(b.status).toBe("modified");
  });

  it("omits deleted entries (deleted files produce no node)", () => {
    const tree = FT.buildTree([
      { path: "src/a.ts", name: "a.ts", size: 1 },
      { path: "src/gone.ts", name: "gone.ts", size: 1 },
    ]);
    const changedFiles = [
      { path: "src/a.ts", status: "added", size: 1 },
      { path: "src/gone.ts", status: "deleted", size: 1 },
    ];
    const merged = FT.mergeChangedStatus(tree, changedFiles);

    // The deleted file's node is removed entirely.
    expect(FT.findNode(merged, "src/gone.ts")).toBeUndefined();
    // A present added file remains.
    expect(FT.findNode(merged, "src/a.ts")).toBeDefined();
    expect(FT.findNode(merged, "src/a.ts").status).toBe("added");
  });

  it("leaves unchanged files with no status", () => {
    const tree = FT.buildTree([
      { path: "src/a.ts", name: "a.ts", size: 1 },
      { path: "src/b.ts", name: "b.ts", size: 1 },
    ]);
    const merged = FT.mergeChangedStatus(tree, [
      { path: "src/a.ts", status: "added", size: 1 },
    ]);

    expect(FT.findNode(merged, "src/a.ts").status).toBe("added");
    expect(FT.findNode(merged, "src/b.ts").status).toBeUndefined();
  });
});
