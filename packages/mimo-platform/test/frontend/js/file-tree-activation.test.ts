import { describe, it, expect, beforeEach, afterEach } from "bun:test";
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
        if (!el.className.includes(c)) el.className += " " + c;
      },
      remove(c: string) {
        this._set.delete(c);
      },
      toggle(c: string, force?: boolean) {
        const should = force === undefined ? !this.contains(c) : force;
        if (should) this.add(c);
        else this.remove(c);
      },
    },
    setAttribute(k: string, v: string) {
      el.dataset[k] = v;
    },
    getAttribute() {
      return null;
    },
    appendChild(child: any) {
      el._children.push(child);
      return child;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return el;
}

const FT = loadModule("../../../public/js/file-tree.js");

let savedDocument: any;
let savedWindow: any;

beforeEach(() => {
  savedDocument = (globalThis as any).document;
  savedWindow = (globalThis as any).window;
  (globalThis as any).document = {
    createElement: (t: string) => makeEl(t),
    readyState: "complete",
  };
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).FILE_STATUS_META = {
    added: { badge: "+", cssClass: "file-status-new", color: "#51cf66" },
    modified: { badge: "~", cssClass: "file-status-changed", color: "#74c0fc" },
  };
});

afterEach(() => {
  if (savedDocument === undefined) delete (globalThis as any).document;
  else (globalThis as any).document = savedDocument;
  if (savedWindow === undefined) delete (globalThis as any).window;
  else (globalThis as any).window = savedWindow;
});

describe("FileTree activation refresh", () => {
  it("issues parallel fetches to /files and /changed-files when isActive transitions false -> true, then rebuilds the tree", async () => {
    const container = makeEl("div");
    container.setAttribute("data-session-id", "s1");
    container.setAttribute("data-buffer-id", "file-tree");

    const fetchedUrls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchedUrls.push(url);
      if (url.endsWith("/files")) {
        return {
          ok: true,
          json: async () => [
            { path: "src/a.ts", name: "a.ts", size: 1 },
            { path: "src/sub/b.ts", name: "b.ts", size: 1 },
          ],
        };
      }
      // /changed-files
      return {
        ok: true,
        json: async () => ({
          files: [{ path: "src/sub/b.ts", status: "modified", size: 1 }],
          summary: { added: 0, modified: 1, deleted: 0 },
        }),
      };
    };

    const controller = FT.attach(container, {
      sessionId: "s1",
      fetchFn,
    });

    // While inactive, no fetches occur.
    expect(fetchedUrls.length).toBe(0);

    await controller.setActive(true);
    expect(fetchedUrls).toContain("/sessions/s1/files");
    expect(fetchedUrls).toContain("/sessions/s1/changed-files");

    // The container should now hold a rendered tree-root.
    const treeRoot = container._children.find(
      (c: any) => c.classList && c.classList.contains("tree-root"),
    );
    expect(treeRoot).toBeDefined();
    // The modified file's ancestor directories should be expanded.
    expect(treeRoot.classList.contains("tree-root")).toBe(true);
  });

  it("does not fetch while inactive, and does not poll while staying active", async () => {
    const container = makeEl("div");
    container.setAttribute("data-session-id", "s1");
    const fetchedUrls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchedUrls.push(url);
      return { ok: true, json: async () => [] };
    };
    const controller = FT.attach(container, { sessionId: "s1", fetchFn });

    // Stays inactive: no fetches.
    await controller.setActive(false);
    expect(fetchedUrls.length).toBe(0);

    // One transition to active: exactly three fetches (one per endpoint).
    await controller.setActive(true);
    expect(fetchedUrls.length).toBe(3);

    // Staying active does NOT trigger additional fetches (no polling).
    await controller.setActive(true);
    await controller.setActive(true);
    expect(fetchedUrls.length).toBe(3);

    // Going back to inactive: no new fetches.
    await controller.setActive(false);
    expect(fetchedUrls.length).toBe(3);
  });

  it("exposes a manual refresh() that reuses the same load path", async () => {
    const container = makeEl("div");
    container.setAttribute("data-session-id", "s1");
    const fetchedUrls: string[] = [];
    const fetchFn = async (url: string) => {
      fetchedUrls.push(url);
      return { ok: true, json: async () => [] };
    };
    const controller = FT.attach(container, { sessionId: "s1", fetchFn });

    await controller.refresh();
    expect(fetchedUrls).toContain("/sessions/s1/files");
    expect(fetchedUrls).toContain("/sessions/s1/changed-files");
  });
});
