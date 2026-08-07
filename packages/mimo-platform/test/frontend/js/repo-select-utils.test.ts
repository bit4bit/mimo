// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// utils.js is a global script (not a module) that defines bare functions on
// the surrounding scope. Load it with globalThis shims like the other frontend
// tests.
function loadUtils(fakeWindow: any) {
  const code = readFileSync(
    join(import.meta.dir, "../../../public/js/utils.js"),
    "utf-8",
  );
  (globalThis as any).window = fakeWindow;
  (globalThis as any).document = fakeWindow.document;
  (globalThis as any).fetch = fakeWindow.fetch;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  (0, eval)(code);
}

function makeSelect() {
  return {
    tagName: "SELECT",
    value: "",
    innerHTML: "",
    _set: new Set<string>(),
    classList: {
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
        } else if (force) this._set.add(c);
        else this._set.delete(c);
      },
    },
    setAttribute() {},
    getAttribute() {
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
  };
}

describe("repo-select shared helpers (utils.js)", () => {
  beforeAll(() => {
    loadUtils({
      fetch: async () => ({
        ok: true,
        json: async () => ({
          repos: [{ repoId: "zeta" }, { repoId: "alpha" }, { repoId: "alpha" }],
        }),
      }),
      document: { getElementById: () => null },
    });
  });

  afterAll(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).fetch;
  });

  it("fetchSessionRepoIds returns sorted unique repo IDs", async () => {
    const ids = await (globalThis as any).fetchSessionRepoIds("s1");
    expect(ids).toEqual(["alpha", "zeta"]);
  });

  it("fetchSessionRepoIds returns [] when sessionId is empty", async () => {
    const ids = await (globalThis as any).fetchSessionRepoIds("");
    expect(ids).toEqual([]);
  });

  it("fetchSessionRepoIds returns [] when the request fails", async () => {
    (globalThis as any).fetch = async () => {
      throw new Error("network");
    };
    const ids = await (globalThis as any).fetchSessionRepoIds("s1");
    expect(ids).toEqual([]);
  });

  it("buildRepoOptions produces an <option> per repo id", () => {
    const html = (globalThis as any).buildRepoOptions(["a", "b"]);
    expect(html).toBe(
      '<option value="a">a</option><option value="b">b</option>',
    );
  });

  it("buildRepoOptions handles empty/null input", () => {
    expect((globalThis as any).buildRepoOptions([])).toBe("");
    expect((globalThis as any).buildRepoOptions(null)).toBe("");
  });

  it("populateRepoSelectOptions builds options with All first and restores selection", () => {
    const select = makeSelect();
    (globalThis as any).populateRepoSelectOptions(select, ["b", "a", "b"], "a");
    expect(select.innerHTML).toBe(
      '<option value="">All repositories</option>' +
        '<option value="a">a</option><option value="b">b</option>',
    );
    expect(select.value).toBe("a");
  });

  it("populateRepoSelectOptions resets to All when current value is no longer present", () => {
    const select = makeSelect();
    (globalThis as any).populateRepoSelectOptions(select, ["a", "b"], "gone");
    expect(select.value).toBe("");
  });

  it("populateRepoSelectOptions is a no-op without a select element", () => {
    expect(() =>
      (globalThis as any).populateRepoSelectOptions(null, ["a"], "a"),
    ).not.toThrow();
  });
});
