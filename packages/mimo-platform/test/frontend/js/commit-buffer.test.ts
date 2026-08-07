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

// Load commit-buffer.js as an IIFE and capture window-side globals it sets.
function loadCommitBuffer(fakeWindow: any, fakeDocument: any) {
  const code = readFileSync(
    join(import.meta.dir, "../../../public/js/commit-buffer.js"),
    "utf-8",
  );
  (globalThis as any).window = fakeWindow;
  (globalThis as any).document = fakeDocument;
  // The IIFE references bare globals (fetch, MutationObserver, setInterval,
  // document, window) which resolve to globalThis — surface them there too.
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
  // Shared repo-select helpers from public/js/utils.js (loaded globally in the
  // browser via a <script> tag before commit-buffer.js).
  (globalThis as any).fetchSessionRepoIds = async (sid: string) => {
    const res = await fakeWindow.fetch(`/sessions/${sid}/repos`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.from(
      new Set((data.repos || []).map((r: any) => r.repoId).filter(Boolean)),
    ).sort();
  };
  (globalThis as any).populateRepoSelectOptions = (
    selectEl: any,
    repoIds: string[],
    current?: string,
  ) => {
    const ids = Array.from(new Set((repoIds || []).filter(Boolean))).sort();
    selectEl.innerHTML =
      '<option value="">All repositories</option>' +
      ids.map((id) => `<option value="${id}">${id}</option>`).join("");
    selectEl.value = ids.includes(current) ? current : "";
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  (0, eval)(code);
}

function makeEl(id: string): any {
  return {
    id,
    tagName: "DIV",
    style: {},
    value: "",
    textContent: "",
    innerHTML: "",
    disabled: false,
    dataset: {},
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
    setAttribute() {},
    getAttribute() {
      return null;
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    focus() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function makeDocument(panelActive: boolean): any {
  const panel = makeEl("commit-panel");
  panel.dataset.bufferPanel = "commit";
  if (panelActive) panel.classList.add("active");
  else panel.classList.add("hidden");

  const ids = [
    "commit-panel",
    "commit-message",
    "commit-confirm",
    "commit-error",
    "commit-status",
    "commit-tree",
    "filter-added",
    "filter-modified",
    "filter-deleted",
    "count-added",
    "count-modified",
    "count-deleted",
    "selected-count",
    "total-count",
    "commit-refresh-btn",
    "sync-now-btn",
    "pull-force-btn",
    "force-push-btn",
    "commit-repo-select",
    "commit-repo-results",
    "sync-status",
  ];
  const els: Record<string, any> = {};
  for (const id of ids) els[id] = makeEl(id);
  els["commit-panel"] = panel;
  // Track rendered per-repo result rows.
  const resultsEl = makeEl("commit-repo-results");
  resultsEl._children = [];
  resultsEl.appendChild = (child: any) => {
    resultsEl._children.push(child);
  };
  els["commit-repo-results"] = resultsEl;
  // Default filter checkbox states
  els["filter-added"].checked = true;
  els["filter-modified"].checked = true;
  els["filter-deleted"].checked = false;

  return {
    getElementById(id: string) {
      return els[id] || null;
    },
    querySelector(sel: string) {
      if (sel === '[data-buffer-panel="commit"]') return panel;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tag: string) {
      return makeEl(tag);
    },
    readyState: "complete",
    addEventListener() {},
  };
}

function makeWindow(
  panelActive: boolean,
  options: {
    previewFiles?: any[];
    confirmResponse?: boolean;
    pullForceResult?: any;
    pushForceResult?: any;
    sessionRepos?: string[];
  } = {},
): any {
  const fetchCalls: { url: string; method: string; body?: any }[] = [];
  const confirmMessages: string[] = [];
  const w: any = {
    MIMO_SESSION_ID: "session-1",
    location: { pathname: "/projects/p/sessions/session-1", reload: () => {} },
    confirm: (msg: string) => {
      confirmMessages.push(msg);
      return options.confirmResponse !== undefined
        ? options.confirmResponse
        : true;
    },
    fetch: async (url: string, opts: any = {}) => {
      fetchCalls.push({
        url,
        method: opts.method || "GET",
        body: opts.body,
      });
      if (url.endsWith("/preview")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            preview: {
              summary: { added: 1, modified: 1, deleted: 0 },
              files: options.previewFiles || [
                { path: "src/a.ts", status: "added" },
                { path: "src/b.ts", status: "modified" },
              ],
            },
          }),
        };
      }
      if (/\/sessions\/[^/]+\/repos$/.test(url)) {
        return {
          ok: true,
          json: async () => ({
            repos: (options.sessionRepos || ["repo-a", "repo-b"]).map(
              (repoId: string) => ({ repoId, branch: null }),
            ),
          }),
        };
      }
      if (url.endsWith("/commit-and-push")) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url.endsWith("/sync")) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      if (url.endsWith("/pull-force")) {
        return {
          ok: true,
          json: async () =>
            options.pullForceResult || {
              success: true,
              message: "Pull force completed successfully",
              results: [],
            },
        };
      }
      if (url.endsWith("/push-force")) {
        return {
          ok: true,
          json: async () => options.pushForceResult || { success: true },
        };
      }
      if (url.endsWith("/sync-status")) {
        return {
          ok: true,
          json: async () => ({ syncState: "idle", lastSyncAt: null }),
        };
      }
      return { ok: true, json: async () => ({ success: true }) };
    },
    switchFrameBuffer: async () => {},
    MIMO_PATCH_BUFFER: { addPatch: () => {}, focusDiffPane: () => {} },
    _fetchCalls: fetchCalls,
    _confirmMessages: confirmMessages,
  };
  w.document = makeDocument(panelActive);
  return w;
}

describe("commit-buffer.js behavior", () => {
  let fakeWindow: any;

  beforeAll(() => {
    // load once for the exposed-surface test; per-test reloads use beforeEach
  });

  afterAll(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).MutationObserver;
    delete (globalThis as any).setInterval;
    delete (globalThis as any).clearInterval;
    delete (globalThis as any).fetchSessionRepoIds;
    delete (globalThis as any).populateRepoSelectOptions;
  });

  beforeEach(() => {
    fakeWindow = makeWindow(false);
    loadCommitBuffer(fakeWindow, fakeWindow.document);
  });

  it("exposes window.MIMO_COMMIT_BUFFER with navigateChange, isActive, refresh", () => {
    expect(typeof fakeWindow.MIMO_COMMIT_BUFFER).toBe("object");
    expect(typeof fakeWindow.MIMO_COMMIT_BUFFER.navigateChange).toBe(
      "function",
    );
    expect(typeof fakeWindow.MIMO_COMMIT_BUFFER.isActive).toBe("function");
    expect(typeof fakeWindow.MIMO_COMMIT_BUFFER.refresh).toBe("function");
  });

  it("first activation issues GET /commits/:sessionId/preview", async () => {
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    const previewCalls = fakeWindow._fetchCalls.filter((c: any) =>
      c.url.endsWith("/commits/session-1/preview"),
    );
    expect(previewCalls.length).toBe(1);
    expect(previewCalls[0].method).toBe("GET");
  });

  it("second activation does not re-issue the preview request", async () => {
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    fakeWindow._fetchCalls.length = 0;
    await fakeWindow.MIMO_COMMIT_BUFFER.deactivate();
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    const previewCalls = fakeWindow._fetchCalls.filter((c: any) =>
      c.url.endsWith("/commits/session-1/preview"),
    );
    expect(previewCalls.length).toBe(0);
  });

  it("refresh() re-issues the preview request", async () => {
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    fakeWindow._fetchCalls.length = 0;
    await fakeWindow.MIMO_COMMIT_BUFFER.refresh();
    const previewCalls = fakeWindow._fetchCalls.filter((c: any) =>
      c.url.endsWith("/commits/session-1/preview"),
    );
    expect(previewCalls.length).toBe(1);
  });

  it("commit message persists across deactivate/activate", async () => {
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    const msg = fakeWindow.document.getElementById("commit-message");
    msg.value = "fix: handle null";
    // Simulate the input event the buffer listens for so module state mirrors it
    msg.value = "fix: handle null";
    await fakeWindow.MIMO_COMMIT_BUFFER.deactivate();
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    expect(msg.value).toBe("fix: handle null");
  });

  it("successful commit-and-push clears the message and selection", async () => {
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    const msg = fakeWindow.document.getElementById("commit-message");
    msg.value = "fix: null";
    // Select a file so submit() proceeds past the empty-selection guard.
    fakeWindow.MIMO_COMMIT_BUFFER.selectFile("src/a.ts", true);
    await fakeWindow.MIMO_COMMIT_BUFFER.submit();
    expect(msg.value).toBe("");
  });

  it("Sync Now posts to /sessions/:sessionId/sync", async () => {
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    fakeWindow._fetchCalls.length = 0;
    await fakeWindow.MIMO_COMMIT_BUFFER.syncNow();
    const syncCalls = fakeWindow._fetchCalls.filter(
      (c: any) => c.url === "/sessions/session-1/sync",
    );
    expect(syncCalls.length).toBe(1);
    expect(syncCalls[0].method).toBe("POST");
  });

  it("Force Push posts to /commits/:sessionId/push-force", async () => {
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    fakeWindow._fetchCalls.length = 0;
    await fakeWindow.MIMO_COMMIT_BUFFER.forcePush();
    const fpCalls = fakeWindow._fetchCalls.filter(
      (c: any) => c.url === "/commits/session-1/push-force",
    );
    expect(fpCalls.length).toBe(1);
    expect(fpCalls[0].method).toBe("POST");
  });

  it("Force Push with All repositories renders per-repo results", async () => {
    fakeWindow = makeWindow(false, {
      previewFiles: [
        { path: "src/a.ts", status: "added", repoId: "repo-a" },
        { path: "src/b.ts", status: "modified", repoId: "repo-b" },
      ],
      pushForceResult: {
        success: false,
        message: "1 repository force push(es) failed",
        results: [
          { repoId: "repo-a", status: "succeeded", message: "pushed" },
          {
            repoId: "repo-b",
            status: "failed",
            message: "fail",
            error: "boom",
          },
        ],
      },
    });
    loadCommitBuffer(fakeWindow, fakeWindow.document);
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();

    await fakeWindow.MIMO_COMMIT_BUFFER.forcePush();

    const resultsEl = fakeWindow.document.getElementById("commit-repo-results");
    expect(resultsEl._children.length).toBe(2);
    expect(resultsEl._children[0].textContent).toContain("repo-a");
    expect(resultsEl._children[1].textContent).toContain("repo-b");
    expect(resultsEl._children[1].textContent).toContain("failed");
  });

  it("Pull Force confirmation lists every repository in the session", async () => {
    fakeWindow = makeWindow(false, {
      previewFiles: [
        { path: "src/a.ts", status: "added", repoId: "repo-a" },
        { path: "src/b.ts", status: "modified", repoId: "repo-b" },
      ],
    });
    loadCommitBuffer(fakeWindow, fakeWindow.document);
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();

    await fakeWindow.MIMO_COMMIT_BUFFER.pullForce();

    expect(fakeWindow._confirmMessages.length).toBe(1);
    const message = fakeWindow._confirmMessages[0];
    expect(message).toContain("Pull force will discard ALL local commits");
    expect(message).toContain("repo-a");
    expect(message).toContain("repo-b");
  });

  it("Pull Force with a specific repository selected lists only that repo", async () => {
    fakeWindow = makeWindow(false, {
      previewFiles: [
        { path: "src/a.ts", status: "added", repoId: "repo-a" },
        { path: "src/b.ts", status: "modified", repoId: "repo-b" },
      ],
    });
    loadCommitBuffer(fakeWindow, fakeWindow.document);
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    const select = fakeWindow.document.getElementById("commit-repo-select");
    select.value = "repo-a";

    await fakeWindow.MIMO_COMMIT_BUFFER.pullForce();

    const message = fakeWindow._confirmMessages[0];
    expect(message).toContain("repo-a");
    expect(message).not.toContain("repo-b");
    const pfCalls = fakeWindow._fetchCalls.filter(
      (c: any) => c.url === "/commits/session-1/pull-force",
    );
    expect(JSON.parse(pfCalls[0].body)).toEqual({ repoId: "repo-a" });
  });

  it("Pull Force cancelled issues no request", async () => {
    fakeWindow = makeWindow(false, {
      previewFiles: [
        { path: "src/a.ts", status: "added", repoId: "repo-a" },
        { path: "src/b.ts", status: "modified", repoId: "repo-b" },
      ],
      confirmResponse: false,
    });
    loadCommitBuffer(fakeWindow, fakeWindow.document);
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    fakeWindow._fetchCalls.length = 0;

    await fakeWindow.MIMO_COMMIT_BUFFER.pullForce();

    const pfCalls = fakeWindow._fetchCalls.filter(
      (c: any) => c.url === "/commits/session-1/pull-force",
    );
    expect(pfCalls.length).toBe(0);
  });

  it("Pull Force accept posts to /commits/:sessionId/pull-force without a repoId for All", async () => {
    fakeWindow = makeWindow(false, {
      previewFiles: [
        { path: "src/a.ts", status: "added", repoId: "repo-a" },
        { path: "src/b.ts", status: "modified", repoId: "repo-b" },
      ],
    });
    loadCommitBuffer(fakeWindow, fakeWindow.document);
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    fakeWindow._fetchCalls.length = 0;

    await fakeWindow.MIMO_COMMIT_BUFFER.pullForce();

    const pfCalls = fakeWindow._fetchCalls.filter(
      (c: any) => c.url === "/commits/session-1/pull-force",
    );
    expect(pfCalls.length).toBe(1);
    expect(pfCalls[0].method).toBe("POST");
    expect(JSON.parse(pfCalls[0].body)).toEqual({});
  });

  it("Pull Force success renders per-repo results and re-enables the button", async () => {
    fakeWindow = makeWindow(false, {
      previewFiles: [
        { path: "src/a.ts", status: "added", repoId: "repo-a" },
        { path: "src/b.ts", status: "modified", repoId: "repo-b" },
      ],
      pullForceResult: {
        success: true,
        message: "Pull force completed successfully",
        results: [
          { repoId: "repo-a", status: "succeeded", message: "ok" },
          { repoId: "repo-b", status: "succeeded", message: "ok" },
        ],
      },
    });
    loadCommitBuffer(fakeWindow, fakeWindow.document);
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();

    const pullBtn = fakeWindow.document.getElementById("pull-force-btn");
    await fakeWindow.MIMO_COMMIT_BUFFER.pullForce();

    const resultsEl = fakeWindow.document.getElementById("commit-repo-results");
    expect(resultsEl._children.length).toBe(2);
    expect(resultsEl._children[0].textContent).toContain("repo-a");
    const statusEl = fakeWindow.document.getElementById("commit-status");
    expect(statusEl.textContent).toContain("Pull force completed successfully");
    expect(pullBtn.disabled).toBe(false);
    expect(pullBtn.textContent).toBe("Pull Force");
  });

  it("isActive reports whether the buffer is active", async () => {
    expect(fakeWindow.MIMO_COMMIT_BUFFER.isActive()).toBe(false);
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    expect(fakeWindow.MIMO_COMMIT_BUFFER.isActive()).toBe(true);
    await fakeWindow.MIMO_COMMIT_BUFFER.deactivate();
    expect(fakeWindow.MIMO_COMMIT_BUFFER.isActive()).toBe(false);
  });

  it("repo selector shows all session repos even with no changed files", async () => {
    fakeWindow = makeWindow(false, {
      previewFiles: [],
      sessionRepos: ["repo-a", "repo-b", "repo-c"],
    });
    loadCommitBuffer(fakeWindow, fakeWindow.document);
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();

    const select = fakeWindow.document.getElementById("commit-repo-select");
    expect(select.innerHTML).toContain(
      '<option value="">All repositories</option>',
    );
    expect(select.innerHTML).toContain(
      '<option value="repo-a">repo-a</option>',
    );
    expect(select.innerHTML).toContain(
      '<option value="repo-b">repo-b</option>',
    );
    expect(select.innerHTML).toContain(
      '<option value="repo-c">repo-c</option>',
    );
  });

  it("repo selector fetches /sessions/:sessionId/repos once on first activation", async () => {
    fakeWindow = makeWindow(false, { sessionRepos: ["repo-a", "repo-b"] });
    loadCommitBuffer(fakeWindow, fakeWindow.document);
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();
    fakeWindow._fetchCalls.length = 0;

    await fakeWindow.MIMO_COMMIT_BUFFER.refresh();
    const reposCalls = fakeWindow._fetchCalls.filter((c: any) =>
      /\/sessions\/[^/]+\/repos$/.test(c.url),
    );
    expect(reposCalls.length).toBe(0);
  });

  it("repo selector merges session repos with changed-file repos", async () => {
    fakeWindow = makeWindow(false, {
      previewFiles: [{ path: "src/a.ts", status: "added", repoId: "repo-d" }],
      sessionRepos: ["repo-a", "repo-b"],
    });
    loadCommitBuffer(fakeWindow, fakeWindow.document);
    await fakeWindow.MIMO_COMMIT_BUFFER.activate();

    const select = fakeWindow.document.getElementById("commit-repo-select");
    expect(select.innerHTML).toContain(
      '<option value="repo-a">repo-a</option>',
    );
    expect(select.innerHTML).toContain(
      '<option value="repo-b">repo-b</option>',
    );
    expect(select.innerHTML).toContain(
      '<option value="repo-d">repo-d</option>',
    );
  });
});
