import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

function loadModule(relPath: string) {
  const code = readFileSync(join(import.meta.dir, relPath), "utf-8");
  const mockModule = { exports: {} as any };
  const wrapped = code
    .replace(/\(function \(\) \{/, "(function (module) {")
    .replace(/\}\)\(\);\s*$/, "})(mockModule);");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  eval(wrapped);
  return mockModule.exports;
}

// Minimal fake DOM that records event listeners so renderTree's click handler
// can be invoked from tests.
function makeEl(tag = "div") {
  const el: any = {
    tagName: tag,
    className: "",
    _children: [] as any[],
    _html: "",
    style: {},
    textContent: "",
    dataset: {},
    classList: {
      _set: new Set<string>(),
      contains(c: string) {
        return (
          this._set.has(c) ||
          el.className
            .split(" ")
            .map((x: string) => x.trim())
            .includes(c)
        );
      },
      add(c: string) {
        this._set.add(c);
        if (el.className === "") el.className = c;
        else if (!el.className.includes(c)) el.className += " " + c;
      },
      remove(c: string) {
        this._set.delete(c);
        el.className = el.className
          .split(" ")
          .filter((x: string) => x !== c)
          .join(" ");
      },
      toggle(c: string) {
        if (this._set.has(c)) this.remove(c);
        else this.add(c);
      },
    },
    setAttribute(k: string, v: string) {
      el.dataset[k] = v;
      if (k === "data-path") el.dataset.path = v;
      if (k === "data-help-id") el.dataset.helpId = v;
    },
    getAttribute(k: string) {
      return el.dataset[k] ?? null;
    },
    appendChild(child: any) {
      el._children.push(child);
      return child;
    },
    addEventListener(type: string, handler: (...args: any[]) => void) {
      el._listeners = el._listeners || {};
      (el._listeners[type] = el._listeners[type] || []).push(handler);
    },
    removeEventListener() {},
    click(event?: any) {
      const handlers = el._listeners?.click ?? [];
      const evt = Object.assign(
        { stopPropagation() {}, preventDefault() {} },
        event || {},
      );
      for (const h of handlers) h(evt);
    },
  };
  return el;
}

let documentStub: any;

beforeAll(() => {
  documentStub = { createElement: (t: string) => makeEl(t) };
  (globalThis as any).document = documentStub;
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).FILE_STATUS_META = {
    added: { badge: "+", cssClass: "file-status-new", color: "#51cf66" },
    modified: { badge: "~", cssClass: "file-status-changed", color: "#74c0fc" },
  };
});

afterAll(() => {
  delete (globalThis as any).document;
});

const FT = loadModule("../../../public/js/file-tree.js");

function buildSampleTree() {
  const flat = [
    { path: "src/a.ts", name: "a.ts", size: 1 },
    { path: "src/sub/b.ts", name: "b.ts", size: 1 },
    { path: "README.md", name: "README.md", size: 1 },
  ];
  const tree = FT.buildTree(flat);
  const changed = [{ path: "src/sub/b.ts", status: "modified", size: 1 }];
  return FT.mergeChangedStatus(tree, changed);
}

describe("renderTree", () => {
  it("renders expanded directories with their children and collapsed directories without", () => {
    const tree = buildSampleTree();
    const expandedPaths = FT.computeExpandedPaths(tree, ["src/sub/b.ts"]);

    const root = FT.renderTree(tree, {
      expandedPaths,
      sessionId: "s1",
      onFileClick: () => {},
    });

    // Walk the rendered DOM, descending through every nested element.
    function find(path: string, el: any): any {
      for (const c of el._children) {
        if (c.dataset && c.dataset.path === path) return c;
        if (c._children && c._children.length) {
          const found = find(path, c);
          if (found) return found;
        }
      }
      return undefined;
    }

    // src/ is expanded (ancestor of b.ts).
    const srcNode = find("src", root);
    expect(srcNode).toBeDefined();
    expect(srcNode.classList.contains("tree-dir--expanded")).toBe(true);
    // Expanded: a `.tree-children` container is present.
    const srcChildren = srcNode._children.find(
      (c: any) => c.classList && c.classList.contains("tree-children"),
    );
    expect(srcChildren).toBeDefined();
    expect(srcChildren._children.length).toBe(2); // sub/ + a.ts

    // sub/ is also expanded (ancestor of b.ts).
    const subNode = find("src/sub", root);
    expect(subNode).toBeDefined();
    expect(subNode.classList.contains("tree-dir--expanded")).toBe(true);
    const subChildren = subNode._children.find(
      (c: any) => c.classList && c.classList.contains("tree-children"),
    );
    expect(subChildren._children.length).toBe(1); // b.ts

    // README.md is a top-level leaf (unchanged): no nested subtree.
    const readme = root._children.find(
      (c: any) => c.dataset.path === "README.md",
    );
    expect(readme).toBeDefined();
    expect(readme.classList.contains("tree-leaf")).toBe(true);
    const readmeSubtree = readme._children.find(
      (c: any) => c.classList && c.classList.contains("tree-children"),
    );
    expect(readmeSubtree).toBeUndefined();
  });

  it("omits children of a collapsed directory", () => {
    const tree = buildSampleTree();
    // Force every directory collapsed (no expanded ancestors).
    const root = FT.renderTree(tree, {
      expandedPaths: new Set(),
      sessionId: "s1",
      onFileClick: () => {},
    });
    const srcNode = root._children.find((c: any) => c.dataset.path === "src");
    expect(srcNode).toBeDefined();
    expect(srcNode.classList.contains("tree-dir--expanded")).toBe(false);
    // Collapsed: no `.tree-children` subtree container is rendered.
    const subtree = srcNode._children.find(
      (c: any) => c.classList && c.classList.contains("tree-children"),
    );
    expect(subtree).toBeUndefined();
  });

  it("invokes onFileClick(path, status) when a file leaf is clicked", () => {
    const tree = buildSampleTree();
    const expandedPaths = FT.computeExpandedPaths(tree, ["src/sub/b.ts"]);
    const clicks: Array<{ path: string; status: string | undefined }> = [];
    const root = FT.renderTree(tree, {
      expandedPaths,
      sessionId: "s1",
      onFileClick: (path: string, status: string | undefined) =>
        clicks.push({ path, status }),
    });

    function findLeaf(root: any, path: string): any {
      for (const c of root._children) {
        if (
          c.dataset &&
          c.dataset.path === path &&
          c.classList.contains("tree-leaf-row")
        )
          return c;
        if (c._children && c._children.length) {
          const found = findLeaf(c, path);
          if (found) return found;
        }
      }
      return undefined;
    }

    // Clicking the modified file bubbles to its leaf's click handler.
    const bLeaf = findLeaf(root, "src/sub/b.ts");
    expect(bLeaf).toBeDefined();
    bLeaf.click();
    expect(clicks).toEqual([{ path: "src/sub/b.ts", status: "modified" }]);

    // Clicking an unchanged file reports no status.
    const aLeaf = findLeaf(root, "src/a.ts");
    expect(aLeaf).toBeDefined();
    aLeaf.click();
    expect(clicks[1]).toEqual({ path: "src/a.ts", status: undefined });
  });

  it("toggles a directory between expanded and collapsed on click", () => {
    const tree = buildSampleTree();
    let expandedPaths = new Set<string>();
    const onToggle = (next: Set<string>) => {
      expandedPaths = next;
    };
    const root = FT.renderTree(tree, {
      expandedPaths,
      sessionId: "s1",
      onFileClick: () => {},
      onToggleExpand: onToggle,
    });

    const srcNode = root._children.find((c: any) => c.dataset.path === "src");
    expect(srcNode.classList.contains("tree-dir--expanded")).toBe(false);
    // The click handler lives on the directory's header row.
    const srcHeader = srcNode._children.find(
      (c: any) => c.classList && c.classList.contains("tree-dir-header"),
    );
    expect(srcHeader).toBeDefined();
    srcHeader.click();
    // After toggling, src/ should be in the expanded set so a re-render shows it.
    expect(expandedPaths.has("src")).toBe(true);
  });
});
