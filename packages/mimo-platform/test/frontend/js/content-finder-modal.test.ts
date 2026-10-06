import { describe, it, expect, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const utilsCode = readFileSync(
  join(import.meta.dir, "../../../public/js/content-finder-utils.js"),
  "utf-8",
);
const editBufferCode = readFileSync(
  join(import.meta.dir, "../../../public/js/edit-buffer.js"),
  "utf-8",
);

const STORAGE_KEY = "mimo.contentFinder.context";

function fakeElement(attrs: Record<string, string> = {}) {
  const listeners: Record<string, ((e: any) => void)[]> = {};
  return {
    value: "",
    innerHTML: "",
    textContent: "",
    style: { display: "none" } as Record<string, string>,
    children: [] as any[],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    getAttribute: (name: string) => attrs[name] ?? null,
    setAttribute() {},
    addEventListener(type: string, fn: (e: any) => void) {
      (listeners[type] ||= []).push(fn);
    },
    dispatch(type: string, event: Record<string, unknown> = {}) {
      for (const fn of listeners[type] || []) {
        fn({ preventDefault() {}, target: this, ...event });
      }
    },
    focus() {},
    scrollIntoView() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

function fakeTabBar() {
  const bar: any = fakeElement();
  bar.children = [];
  Object.defineProperty(bar, "innerHTML", {
    get: () => "",
    set: () => {
      bar.children = [];
    },
  });
  bar.prepend = (el: any) => bar.children.unshift(el);
  bar.appendChild = (el: any) => bar.children.push(el);
  return bar;
}

interface BootOptions {
  storage?: Record<string, string>;
  storageThrows?: boolean;
}

function boot(options: BootOptions = {}) {
  const elements: Record<string, ReturnType<typeof fakeElement>> = {
    "edit-buffer-container": fakeElement({ "data-session-id": "s1" }),
    "content-finder-dialog": fakeElement(),
    "content-finder-input": fakeElement(),
    "content-finder-before": fakeElement(),
    "content-finder-after": fakeElement(),
    "content-finder-results": fakeElement(),
    "content-finder-status": fakeElement(),
    "edit-buffer-tabs": fakeTabBar(),
    "content-search-btn": fakeElement({ id: "content-search-btn" }),
    "open-file-finder-btn": fakeElement({ id: "open-file-finder-btn" }),
  };
  const storage = { ...(options.storage || {}) };
  const requests: string[] = [];

  const localStorage = {
    getItem(key: string) {
      if (options.storageThrows) throw new Error("denied");
      return key in storage ? storage[key] : null;
    },
    setItem(key: string, value: string) {
      if (options.storageThrows) throw new Error("denied");
      storage[key] = value;
    },
    removeItem(key: string) {
      delete storage[key];
    },
  };

  const g = globalThis as any;
  g.document = {
    readyState: "complete",
    getElementById: (id: string) => elements[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => fakeElement(),
  };
  g.window = g;
  g.location = { protocol: "http:", host: "localhost" };
  g.WebSocket = class {
    static OPEN = 1;
    readyState = 0;
    addEventListener() {}
    send() {}
    close() {}
  };
  g.localStorage = localStorage;
  g.fetch = async (url: string) => {
    if (url.includes("/files/content")) {
      return {
        ok: true,
        json: async () => ({
          path: "a.txt",
          name: "a.txt",
          language: "text",
          lineCount: 1,
          content: "foo",
        }),
      };
    }
    if (url.includes("/search?")) requests.push(url);
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            path: "a.txt",
            line: 5,
            column: 0,
            text: "foo",
            matchStart: 0,
            matchEnd: 3,
            before: ["l4"],
            after: ["l6"],
          },
        ],
        truncated: false,
      }),
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  eval(utilsCode);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  eval(editBufferCode);

  return { elements, storage, requests, EditBuffer: g.EditBuffer };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const afterDebounce = () => new Promise((r) => setTimeout(r, 350));

async function searchFor(env: ReturnType<typeof boot>, query: string) {
  const input = env.elements["content-finder-input"];
  input.value = query;
  input.dispatch("keydown", { key: "Enter" });
  await flush();
  await flush();
}

describe("Content finder modal context controls", () => {
  const savedGlobals = [
    "document",
    "window",
    "location",
    "WebSocket",
    "localStorage",
    "fetch",
    "EditBuffer",
  ];
  const originals = Object.fromEntries(
    savedGlobals.map((k) => [k, (globalThis as any)[k]]),
  );
  afterEach(() => {
    for (const k of savedGlobals) (globalThis as any)[k] = originals[k];
  });

  it("shows 2 lines before and after on first use", () => {
    const env = boot();
    env.EditBuffer.openContentFinder();

    expect(env.elements["content-finder-before"].value).toBe("2");
    expect(env.elements["content-finder-after"].value).toBe("2");
  });

  it("restores saved values when the modal opens again", () => {
    const env = boot();
    env.EditBuffer.openContentFinder();
    const before = env.elements["content-finder-before"];
    const after = env.elements["content-finder-after"];
    before.value = "1";
    before.dispatch("input");
    after.value = "5";
    after.dispatch("input");
    env.EditBuffer.closeContentFinder();

    before.value = "";
    after.value = "";
    env.EditBuffer.openContentFinder();

    expect(before.value).toBe("1");
    expect(after.value).toBe("5");
    expect(JSON.parse(env.storage[STORAGE_KEY])).toEqual({
      before: 1,
      after: 5,
    });
  });

  it("searches with the chosen before and after values", async () => {
    const env = boot({
      storage: { [STORAGE_KEY]: JSON.stringify({ before: 0, after: 7 }) },
    });
    env.EditBuffer.openContentFinder();

    await searchFor(env, "foo");

    expect(env.requests).toEqual([
      "/sessions/s1/search?q=foo&before=0&after=7",
    ]);
    expect(env.elements["content-finder-results"].innerHTML).toContain(
      "cf-line cf-context",
    );
  });

  it("re-runs the completed search when a value changes", async () => {
    const env = boot();
    env.EditBuffer.openContentFinder();
    await searchFor(env, "foo");

    const after = env.elements["content-finder-after"];
    after.value = "4";
    after.dispatch("input");
    await afterDebounce();

    expect(env.requests).toEqual([
      "/sessions/s1/search?q=foo&before=2&after=2",
      "/sessions/s1/search?q=foo&before=2&after=4",
    ]);
  });

  it("does not search when a value changes before any search ran", async () => {
    const env = boot();
    env.EditBuffer.openContentFinder();
    env.elements["content-finder-input"].value = "foo";

    const before = env.elements["content-finder-before"];
    before.value = "3";
    before.dispatch("input");
    await afterDebounce();

    expect(env.requests).toEqual([]);
  });

  it("keeps working when browser storage is unavailable", async () => {
    const env = boot({ storageThrows: true });
    env.EditBuffer.openContentFinder();

    const before = env.elements["content-finder-before"];
    before.value = "4";
    before.dispatch("input");
    await searchFor(env, "foo");

    expect(env.requests).toEqual([
      "/sessions/s1/search?q=foo&before=4&after=2",
    ]);
  });

  it("opens the content finder from the search button in the edit buffer", () => {
    const env = boot();

    env.elements["content-search-btn"].dispatch("click");

    expect(env.EditBuffer.isContentFinderOpen()).toBe(true);
  });

  it("opens the chosen result and keeps search before + in the tab bar", async () => {
    const env = boot();
    env.elements["content-search-btn"].dispatch("click");
    await searchFor(env, "foo");

    env.elements["content-finder-input"].dispatch("keydown", { key: "Enter" });
    await flush();
    await flush();

    const tabs = env.elements["edit-buffer-tabs"].children;
    expect(env.EditBuffer.isContentFinderOpen()).toBe(false);
    expect(tabs[0]).toBe(env.elements["content-search-btn"]);
    expect(tabs[1]).toBe(env.elements["open-file-finder-btn"]);
    expect(tabs[2].textContent).toContain("a.txt");
  });
});
