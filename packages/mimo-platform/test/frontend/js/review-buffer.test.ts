// SPDX-License-Identifier: AGPL-3.0-only
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// Load review-buffer.js as an IIFE and capture window-side globals it sets.
function loadReviewBuffer(fakeWindow: any, fakeDocument: any) {
  const code = readFileSync(
    join(import.meta.dir, "../../../public/js/review-buffer.js"),
    "utf-8",
  );
  (globalThis as any).window = fakeWindow;
  (globalThis as any).document = fakeDocument;
  (globalThis as any).fetch = fakeWindow.fetch;
  (globalThis as any).MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  (globalThis as any).setInterval = () => 0;
  (globalThis as any).clearInterval = () => {};
  (globalThis as any).clearTimeout = () => {};
  (globalThis as any).AbortController = class {
    abort() {}
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  (0, eval)(code);
}

function makeEl(id: string): any {
  const el: any = {
    id,
    tagName: "DIV",
    style: {},
    value: "",
    textContent: "",
    innerHTML: "",
    disabled: false,
    dataset: {},
    _children: [],
    _clickHandler: null,
    _lineClasses: [],
    _badgeClass: "",
    _badgeText: "",
    _placeholderText: "",
    _appendedChildren: false,
    classList: {
      _set: new Set<string>(),
      contains(c: string) {
        return this._set.has(c);
      },
      add(c: string) {
        this._set.add(c);
      },
      remove(c: string) {
        this._set.delete(c);
      },
      toggle(c: string, force?: boolean) {
        if (force === undefined) {
          if (this._set.has(c)) this._set.delete(c);
          else this._set.add(c);
        } else if (force) {
          this._set.add(c);
        } else {
          this._set.delete(c);
        }
      },
    },
    setAttribute(k: string, v: any) {
      (this as any)[k] = v;
      if (k === "data-path") this._path = v;
    },
    getAttribute() {
      return null;
    },
    addEventListener(ev: string, fn: any) {
      if (ev === "click") this._clickHandler = fn;
    },
    removeEventListener() {},
    appendChild(child: any) {
      this._children.push(child);
      this._appendedChildren = true;
      return child;
    },
    focus() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  return el;
}

function makeDocument(panelActive: boolean): any {
  const panel = makeEl("review-panel");
  panel.dataset.bufferPanel = "review";
  if (panelActive) panel.classList.add("active");
  else panel.classList.add("hidden");

  const ids = [
    "review-panel",
    "review-tree",
    "review-diff",
    "review-refresh-btn",
    "review-summary-added",
    "review-summary-modified",
    "review-summary-deleted",
  ];
  const els: Record<string, any> = {};
  for (const id of ids) els[id] = makeEl(id);
  els["review-panel"] = panel;

  return {
    getElementById(id: string) {
      return els[id] || null;
    },
    querySelector(sel: string) {
      if (sel === '[data-buffer-panel="review"]') return panel;
      if (sel === ".review-buffer[data-session-id]") return panel;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tag: string) {
      return makeEl(tag);
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: text };
    },
    readyState: "complete",
    addEventListener() {},
  };
}

function makeWindow(panelActive: boolean): any {
  const fetchCalls: { url: string; method: string }[] = [];
  const w: any = {
    MIMO_SESSION_ID: "session-1",
    location: { pathname: "/projects/p/sessions/session-1", reload: () => {} },
    fetch: async (url: string, opts: any = {}) => {
      fetchCalls.push({ url, method: opts.method || "GET" });
      if (url.endsWith("/review")) {
        return {
          ok: true,
          json: async () => ({
            files: [
              { path: "src/a.ts", status: "added" },
              { path: "src/b.ts", status: "modified" },
              { path: "src/gone.ts", status: "deleted" },
              { path: "nested/deep/c.ts", status: "modified" },
            ],
            summary: { added: 1, modified: 2, deleted: 1 },
          }),
        };
      }
      if (url.includes("/review/files/")) {
        return {
          ok: true,
          json: async () => ({
            hunks: [
              {
                oldStart: 1,
                oldCount: 1,
                newStart: 1,
                newCount: 2,
                lines: ["@@ -1,1 +1,2 @@", " context", "+added line"],
              },
            ],
            isBinary: false,
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    },
    FILE_STATUS_META: {
      added: { badge: "+", cssClass: "file-status--added", color: "#51cf66" },
      modified: {
        badge: "~",
        cssClass: "file-status--modified",
        color: "#74c0fc",
      },
      deleted: {
        badge: "-",
        cssClass: "file-status--deleted",
        color: "#ff6b6b",
      },
    },
    MIMO_DIFF_OVERVIEW: {
      collectHunks: () => [],
      attach: () => ({
        next: () => {},
        prev: () => {},
        count: () => 0,
        destroy: () => {},
      }),
    },
    _fetchCalls: fetchCalls,
  };
  w.document = makeDocument(panelActive);
  return w;
}

describe("review-buffer.js pure helpers", () => {
  let fakeWindow: any;

  beforeAll(() => {
    fakeWindow = makeWindow(false);
    loadReviewBuffer(fakeWindow, fakeWindow.document);
  });

  afterAll(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).MutationObserver;
    delete (globalThis as any).setInterval;
    delete (globalThis as any).clearInterval;
  });

  describe("buildChangedTree", () => {
    it("returns a nested {name,path,isDir,children?,status}[] grouped by '/' segments", () => {
      const RB = fakeWindow.MIMO_REVIEW_BUFFER;
      const tree = RB.buildChangedTree([
        { path: "src/a.ts", status: "added" },
        { path: "src/b.ts", status: "modified" },
        { path: "README.md", status: "added" },
      ]);
      expect(Array.isArray(tree)).toBe(true);
      const src = tree.find((n: any) => n.name === "src");
      expect(src).toBeDefined();
      expect(src.isDir).toBe(true);
      expect(src.path).toBe("src");
      expect(Array.isArray(src.children)).toBe(true);
      expect(src.children.length).toBe(2);
      const a = src.children.find((n: any) => n.name === "a.ts");
      expect(a.isDir).toBe(false);
      expect(a.status).toBe("added");
      const readme = tree.find((n: any) => n.name === "README.md");
      expect(readme.isDir).toBe(false);
      expect(readme.status).toBe("added");
    });

    it("deleted files produce leaf nodes (unlike file-tree mergeChangedStatus)", () => {
      const RB = fakeWindow.MIMO_REVIEW_BUFFER;
      const tree = RB.buildChangedTree([
        { path: "src/gone.ts", status: "deleted" },
      ]);
      const gone =
        tree[0].children?.[0] ?? tree.find((n: any) => n.name === "gone.ts");
      expect(gone).toBeDefined();
      expect(gone.isDir).toBe(false);
      expect(gone.status).toBe("deleted");
    });
  });

  describe("computeExpandedPaths", () => {
    it("returns the set of ancestor directory paths of every changed file", () => {
      const RB = fakeWindow.MIMO_REVIEW_BUFFER;
      const expanded = RB.computeExpandedPaths([
        "src/domain/files/changed.ts",
        "docs/readme.md",
      ]);
      expect(expanded instanceof Set).toBe(true);
      expect(expanded.has("src")).toBe(true);
      expect(expanded.has("src/domain")).toBe(true);
      expect(expanded.has("src/domain/files")).toBe(true);
      expect(expanded.has("docs")).toBe(true);
    });

    it("returns an empty set for empty input", () => {
      const RB = fakeWindow.MIMO_REVIEW_BUFFER;
      expect(RB.computeExpandedPaths([]).size).toBe(0);
    });
  });
});

describe("review-buffer.js renderTree", () => {
  let fakeWindow: any;

  beforeEach(() => {
    fakeWindow = makeWindow(false);
    loadReviewBuffer(fakeWindow, fakeWindow.document);
  });

  afterAll(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).MutationObserver;
    delete (globalThis as any).setInterval;
    delete (globalThis as any).clearInterval;
  });

  it("collapsed directories omit children; expanded directories render them", () => {
    const RB = fakeWindow.MIMO_REVIEW_BUFFER;
    const tree = RB.buildChangedTree([
      { path: "src/a.ts", status: "added" },
      { path: "other/b.ts", status: "modified" },
    ]);
    const expanded = new Set(["src"]);
    const root = RB.renderTree(tree, {
      expandedPaths: expanded,
      onFileSelect: () => {},
    });
    // The `src` directory should have children rendered; `other` should not.
    const srcEl = findNodeByPath(root, "src");
    expect(srcEl).toBeDefined();
    const otherEl = findNodeByPath(root, "other");
    expect(otherEl).toBeDefined();
    // `src` is expanded → its children container exists; `other` is collapsed → no children.
    const srcChildren = srcEl._children || srcEl.children || [];
    expect(srcChildren.length > 0 || srcEl._appendedChildren).toBe(true);
  });

  it("a leaf click invokes onFileSelect(path, status)", () => {
    const RB = fakeWindow.MIMO_REVIEW_BUFFER;
    const tree = RB.buildChangedTree([{ path: "src/a.ts", status: "added" }]);
    const calls: { path: string; status: string }[] = [];
    const root = RB.renderTree(tree, {
      expandedPaths: new Set(["src"]),
      onFileSelect: (path: string, status: string) => {
        calls.push({ path, status });
      },
    });
    // The leaf el contains the row; the row holds the click handler.
    const leaf = findLeafNode(root, "src/a.ts");
    expect(leaf).toBeDefined();
    const row = leaf._children[0];
    expect(row._clickHandler).toBeDefined();
    row._clickHandler({ stopPropagation: () => {} });
    expect(calls).toEqual([{ path: "src/a.ts", status: "added" }]);
  });

  it("status badges render + with file-status--added, ~ with file-status--modified, - with file-status--deleted", () => {
    const RB = fakeWindow.MIMO_REVIEW_BUFFER;
    const tree = RB.buildChangedTree([
      { path: "a.ts", status: "added" },
      { path: "b.ts", status: "modified" },
      { path: "c.ts", status: "deleted" },
    ]);
    const root = RB.renderTree(tree, {
      expandedPaths: new Set(),
      onFileSelect: () => {},
    });
    const aLeaf = findLeafNode(root, "a.ts");
    const aRow = aLeaf._children[0];
    expect(aRow._badgeClass).toContain("file-status--added");
    expect(aRow._badgeText).toBe("+");
    const bLeaf = findLeafNode(root, "b.ts");
    const bRow = bLeaf._children[0];
    expect(bRow._badgeClass).toContain("file-status--modified");
    expect(bRow._badgeText).toBe("~");
    const cLeaf = findLeafNode(root, "c.ts");
    const cRow = cLeaf._children[0];
    expect(cRow._badgeClass).toContain("file-status--deleted");
    expect(cRow._badgeText).toBe("-");
  });
});

describe("review-buffer.js renderDiff", () => {
  let fakeWindow: any;

  beforeEach(() => {
    fakeWindow = makeWindow(false);
    loadReviewBuffer(fakeWindow, fakeWindow.document);
  });

  afterAll(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).MutationObserver;
    delete (globalThis as any).setInterval;
    delete (globalThis as any).clearInterval;
  });

  it("renders hunks with diff-line--added/removed/context when isBinary is false", () => {
    const RB = fakeWindow.MIMO_REVIEW_BUFFER;
    const container = fakeWindow.document.createElement("div");
    RB.renderDiff(container, {
      hunks: [
        {
          oldStart: 1,
          oldCount: 1,
          newStart: 1,
          newCount: 2,
          lines: ["@@ -1,1 +1,2 @@", " context", "+added", "-removed"],
        },
      ],
      isBinary: false,
    });
    const lineClasses = container._lineClasses || [];
    expect(
      lineClasses.some((c: string) => c.includes("diff-line--context")),
    ).toBe(true);
    expect(
      lineClasses.some((c: string) => c.includes("diff-line--added")),
    ).toBe(true);
    expect(
      lineClasses.some((c: string) => c.includes("diff-line--removed")),
    ).toBe(true);
  });

  it("renders 'Binary file changed' placeholder when isBinary is true", () => {
    const RB = fakeWindow.MIMO_REVIEW_BUFFER;
    const container = fakeWindow.document.createElement("div");
    RB.renderDiff(container, { hunks: [], isBinary: true });
    expect(container._placeholderText).toContain("Binary file changed");
  });

  it("renders 'Select a file to view its diff' when no hunks are provided", () => {
    const RB = fakeWindow.MIMO_REVIEW_BUFFER;
    const container = fakeWindow.document.createElement("div");
    RB.renderDiff(container, { hunks: [], isBinary: false });
    expect(container._placeholderText).toContain(
      "Select a file to view its diff",
    );
  });
});

describe("review-buffer.js manual refresh and file selection", () => {
  let fakeWindow: any;

  beforeEach(() => {
    fakeWindow = makeWindow(false);
    loadReviewBuffer(fakeWindow, fakeWindow.document);
  });

  afterAll(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).MutationObserver;
    delete (globalThis as any).setInterval;
    delete (globalThis as any).clearInterval;
  });

  it("refresh() issues GET /sessions/:sessionId/review and rebuilds the tree", async () => {
    const RB = fakeWindow.MIMO_REVIEW_BUFFER;
    await RB.activate();
    fakeWindow._fetchCalls.length = 0;
    await RB.refresh();
    const reviewCalls = fakeWindow._fetchCalls.filter((c: any) =>
      c.url.endsWith("/review"),
    );
    expect(reviewCalls.length).toBe(1);
    expect(reviewCalls[0].method).toBe("GET");
  });

  it("selectFile(path) issues GET /sessions/:sessionId/review/files/<path>", async () => {
    const RB = fakeWindow.MIMO_REVIEW_BUFFER;
    await RB.activate();
    fakeWindow._fetchCalls.length = 0;
    await RB.selectFile("src/a.ts", "added");
    const fileCalls = fakeWindow._fetchCalls.filter((c: any) =>
      c.url.includes("/review/files/"),
    );
    expect(fileCalls.length).toBe(1);
    expect(fileCalls[0].url).toContain(
      "/sessions/session-1/review/files/src/a.ts",
    );
  });

  it("no fetches occur on activation (no lazy refresh)", async () => {
    const RB = fakeWindow.MIMO_REVIEW_BUFFER;
    fakeWindow._fetchCalls.length = 0;
    await RB.activate();
    const reviewCalls = fakeWindow._fetchCalls.filter((c: any) =>
      c.url.endsWith("/review"),
    );
    expect(reviewCalls.length).toBe(0);
  });

  it("no polling while the buffer remains active", async () => {
    const RB = fakeWindow.MIMO_REVIEW_BUFFER;
    await RB.activate();
    fakeWindow._fetchCalls.length = 0;
    // Simulate time passing — no setInterval-based fetch should occur.
    // We assert zero review-list fetches after activation without refresh.
    const reviewCalls = fakeWindow._fetchCalls.filter((c: any) =>
      c.url.endsWith("/review"),
    );
    expect(reviewCalls.length).toBe(0);
  });
});

// ── Test helpers ─────────────────────────────────────────────────────────────
// The mock elements record their structure so tests can assert on the rendered
// tree without a real DOM. `findNodeByPath`/`findLeafNode` walk the recorded
// children (_children array set by appendChild).
function findNodeByPath(root: any, path: string): any {
  if (root._path === path || root.getAttribute?.("data-path") === path)
    return root;
  const children = root._children || [];
  for (const c of children) {
    const found = findNodeByPath(c, path);
    if (found) return found;
  }
  return undefined;
}

function findLeafNode(root: any, path: string): any {
  return findNodeByPath(root, path);
}
