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

const OVERVIEW = loadModule("../../../public/js/diff-overview.js");

// Minimal fake DOM element sufficient for diff-overview.attach()
function makeEl(tag = "div") {
  const el: any = {
    tagName: tag,
    className: "",
    _children: [] as any[],
    _html: "",
    style: {},
    textContent: "",
    clientHeight: 200,
    offsetHeight: 200,
    scrollHeight: 1000,
    scrollTop: 0,
    classList: {
      _set: new Set<string>(),
      contains(c: string) {
        return this._set.has(c);
      },
      add(c: string) {
        this._set.add(c);
      },
    },
    setAttribute() {},
    getAttribute() {
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild(child: any) {
      el._children.push(child);
      return child;
    },
  };
  Object.defineProperty(el, "innerHTML", {
    get() {
      return el._html;
    },
    set(v: string) {
      if (v === "") el._children = [];
      el._html = v;
    },
  });
  return el;
}

function diffLine(kind: "added" | "removed" | "context") {
  const el = makeEl("div");
  el.classList.add("diff-line");
  el.classList.add("diff-line--" + kind);
  return el;
}

// Mirror the classify commit.js uses for `.diff-line` rows.
const classifyByClass = (el: any) =>
  el.classList.contains("diff-line--added")
    ? "added"
    : el.classList.contains("diff-line--removed")
      ? "removed"
      : "unchanged";

function attachFile(rows: any[]) {
  const track = makeEl("div");
  const counter = makeEl("span");
  const scroller = makeEl("div");
  const hunks = OVERVIEW.collectHunks(rows, classifyByClass);
  const controller = OVERVIEW.attach({
    scrollEl: scroller,
    trackEl: track,
    counterEl: counter,
    totalRows: rows.length,
    hunks,
  });
  return { controller, track, counter, scroller };
}

beforeAll(() => {
  (globalThis as any).document = { createElement: (t: string) => makeEl(t) };
  (globalThis as any).requestAnimationFrame = (fn: any) => fn();
});

afterAll(() => {
  delete (globalThis as any).document;
  delete (globalThis as any).requestAnimationFrame;
});

describe("commit dialog overview integration", () => {
  it("gives each rendered file diff its own track and counter", () => {
    // File A: one added hunk. File B: an added run + a removed run = two hunks.
    const fileA = attachFile([
      diffLine("context"),
      diffLine("added"),
      diffLine("context"),
    ]);
    const fileB = attachFile([
      diffLine("added"),
      diffLine("context"),
      diffLine("removed"),
    ]);

    expect(fileA.counter.textContent).toBe("1 / 1");
    expect(fileB.counter.textContent).toBe("1 / 2");

    // Each track is independent: it received its own ticks + a thumb.
    expect(fileA.track._children.length).toBe(1 + 1);
    expect(fileB.track._children.length).toBe(2 + 1);
  });

  it("retargets navigation to the active file's controller", () => {
    const fileA = attachFile([diffLine("added"), diffLine("added")]);
    const fileB = attachFile([
      diffLine("added"),
      diffLine("context"),
      diffLine("removed"),
    ]);

    // Active = file B (most recently interacted). Advancing navigation must
    // move within B, leaving A untouched.
    let active = fileB.controller;
    active.next();

    expect(fileB.controller.count()).toEqual({ index: 2, total: 2 });
    expect(fileA.controller.count()).toEqual({ index: 1, total: 1 });

    // Switch active to file A; navigation now affects A only.
    active = fileA.controller;
    active.next();
    expect(fileA.controller.count()).toEqual({ index: 1, total: 1 }); // single hunk wraps to itself
  });
});
