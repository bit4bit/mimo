// ═════════════════════════════════════════════════════════════════════════════
// MIMO REVIEW BUFFER - GitHub-style review diff browser for the session page.
//
// Pure helpers (`buildChangedTree`, `computeExpandedPaths`) build a nested
// changed-file tree (including deleted entries) and the auto-expand set. The
// renderers (`renderTree`, `renderDiff`) and the buffer bootstrap own the only
// DOM side effects. Refresh is manual only — no polling, no lazy activation.
// ═════════════════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  // ── Status metadata ──────────────────────────────────────────────────────────
  // Reuse the shared status metadata from utils.js when available. The renderer
  // falls back to a minimal local copy so tests and standalone loads still work.
  function statusMeta() {
    if (typeof window !== "undefined" && window.FILE_STATUS_META)
      return window.FILE_STATUS_META;
    if (typeof FILE_STATUS_META !== "undefined") return FILE_STATUS_META;
    return {
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
    };
  }

  /**
   * Build a nested directory tree from the review diff's changed-file list.
   *
   * Unlike `file-tree.js:mergeChangedStatus`, deleted files are first-class
   * leaf nodes (the Review shows the agent's complete work, including removed
   * files). Each leaf carries its status.
   *
   * @param {{path: string, status: string}[]} changedFiles
   * @returns {{name: string, path: string, isDir: boolean, children?: *, status?: string}[]}
   */
  function buildChangedTree(changedFiles) {
    var root = { name: "", path: "", isDir: true, children: [] };

    for (var i = 0; i < changedFiles.length; i++) {
      var file = changedFiles[i];
      var segments = file.repoId
        ? [file.repoId].concat(file.path.split("/"))
        : file.path.split("/");
      var node = root;
      var acc = "";
      for (var s = 0; s < segments.length; s++) {
        var seg = segments[s];
        acc = acc ? acc + "/" + seg : seg;
        var isLeaf = s === segments.length - 1;
        var child = findChild(node, seg);
        if (!child) {
          child = {
            name: seg,
            path: acc,
            isDir: !isLeaf,
            children: isLeaf ? undefined : [],
          };
          node.children.push(child);
        }
        if (isLeaf) {
          child.repoId = file.repoId;
          child.filePath = file.path;
        }
        node = child;
      }
      node.status = file.status;
    }

    function sortNodes(nodes) {
      nodes.sort(function (a, b) {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
      });
      for (var k = 0; k < nodes.length; k++) {
        if (nodes[k].children) sortNodes(nodes[k].children);
      }
    }
    sortNodes(root.children);
    return root.children;
  }

  function findChild(node, name) {
    for (var i = 0; i < node.children.length; i++) {
      if (node.children[i].name === name) return node.children[i];
    }
    return null;
  }

  /**
   * URL-encode a file path for the `/review/files/<path>` route without
   * encoding the `/` separators (so `src/a.ts` stays readable in the URL).
   * Each segment is `encodeURIComponent`-d individually.
   */
  function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  /**
   * Compute the set of ancestor directory paths for every changed file so the
   * renderer can auto-expand exactly those directories on first paint.
   *
   * @param {string[]} changedFilePaths
   * @returns {Set<string>}
   */
  function computeExpandedPaths(changedFilePaths) {
    var expanded = new Set();
    for (var i = 0; i < changedFilePaths.length; i++) {
      var segments = String(changedFilePaths[i]).split("/");
      for (var s = 1; s < segments.length; s++) {
        expanded.add(segments.slice(0, s).join("/"));
      }
    }
    return expanded;
  }

  // ── Tree rendering ───────────────────────────────────────────────────────────
  /**
   * Render the changed-file tree into a root `<div class="tree-root">`.
   *
   * Directory nodes toggle `expanded` on click (via `onToggleExpand`); leaf
   * nodes use status badges and fire `onFileSelect(path, status)`.
   *
   * @param {*} tree
   * @param {{expandedPaths: Set<string>, onFileSelect?: function, onToggleExpand?: function}} opts
   * @returns {*}
   */
  function renderTree(tree, opts) {
    var root = document.createElement("div");
    root.className = "tree-root";
    root.setAttribute("data-help-id", "review-tree-root");
    renderChildren(tree, root, opts);
    return root;
  }

  function renderChildren(nodes, parent, opts) {
    for (var i = 0; i < nodes.length; i++) {
      parent.appendChild(renderNode(nodes[i], opts));
    }
  }

  function renderNode(node, opts) {
    if (node.isDir) return renderDir(node, opts);
    return renderLeaf(node, opts);
  }

  function renderDir(node, opts) {
    var expanded = opts.expandedPaths && opts.expandedPaths.has(node.path);
    var el = document.createElement("div");
    el.className =
      "tree-node tree-node--directory" +
      (expanded ? " tree-dir--expanded" : "");
    el.setAttribute("data-path", node.path);
    el.setAttribute("data-help-id", "review-tree-dir");

    var row = document.createElement("div");
    row.className = "tree-node-row";

    var toggle = document.createElement("span");
    toggle.className = "tree-toggle";
    toggle.textContent = expanded ? "▾" : "▸";
    row.appendChild(toggle);

    var label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = node.name;
    row.appendChild(label);

    row.addEventListener("click", function (e) {
      e.stopPropagation();
      var next = new Set(opts.expandedPaths || []);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      if (opts.onToggleExpand) opts.onToggleExpand(next);
    });

    el.appendChild(row);

    if (expanded && node.children) {
      var container = document.createElement("div");
      container.className = "tree-children";
      renderChildren(node.children, container, opts);
      el.appendChild(container);
    }
    return el;
  }

  function renderLeaf(node, opts) {
    var el = document.createElement("div");
    el.className = "tree-node tree-node--file";
    el.setAttribute("data-path", node.path);
    el.setAttribute("data-help-id", "review-tree-leaf");

    var row = document.createElement("div");
    row.className = "tree-node-row";
    row.setAttribute("data-path", node.path);
    row._isLeaf = true;

    var spacer = document.createElement("span");
    spacer.className = "tree-toggle tree-toggle--spacer";
    row.appendChild(spacer);

    var name = document.createElement("span");
    name.className = "tree-label";
    name.textContent = node.name;
    row.appendChild(name);

    if (node.status) {
      var meta = statusMeta()[node.status];
      if (meta) {
        var badge = document.createElement("span");
        badge.className = "file-status " + meta.cssClass;
        badge.textContent = meta.badge;
        badge.style.color = meta.color;
        // Record badge details for test assertions (mock DOM has no rendering).
        row._badgeClass = meta.cssClass;
        row._badgeText = meta.badge;
        row.appendChild(badge);
      }
    }

    row.addEventListener("click", function (e) {
      e.stopPropagation();
      if (opts.onFileSelect)
        opts.onFileSelect(node.filePath || node.path, node.status, node.repoId);
    });

    el.appendChild(row);
    return el;
  }

  // ── Diff rendering ───────────────────────────────────────────────────────────
  /**
   * Render the unified diff for the selected file into `container`.
   *
   * - `isBinary: true` → "Binary file changed" placeholder.
   * - empty `hunks` → "Select a file to view its diff" empty state.
   * - otherwise → `.diff-hunk` blocks with `.diff-line--added/removed/context`.
   *
   * @param {*} container
   * @param {{hunks: *, isBinary: boolean}} opts
   */
  function renderDiff(container, opts) {
    container._children = [];
    container.innerHTML = "";

    if (opts.isBinary) {
      var bin = document.createElement("div");
      bin.className = "diff-binary";
      bin.textContent = "Binary file changed";
      container._placeholderText = "Binary file changed";
      container.appendChild(bin);
      return;
    }

    if (!opts.hunks || opts.hunks.length === 0) {
      var empty = document.createElement("div");
      empty.className = "review-diff-empty";
      empty.textContent = "Select a file to view its diff";
      container._placeholderText = "Select a file to view its diff";
      container.appendChild(empty);
      return;
    }

    container._lineClasses = [];
    opts.hunks.forEach(function (hunk) {
      var hunkEl = document.createElement("div");
      hunkEl.className = "diff-hunk";

      var header = document.createElement("div");
      header.className = "diff-hunk-header";
      header.textContent =
        "@@ -" +
        hunk.oldStart +
        "," +
        hunk.oldCount +
        " +" +
        hunk.newStart +
        "," +
        hunk.newCount +
        " @@";
      hunkEl.appendChild(header);

      hunk.lines.slice(1).forEach(function (line) {
        var lineEl = document.createElement("div");
        var cls = "diff-line";
        if (line.startsWith("+")) cls += " diff-line--added";
        else if (line.startsWith("-")) cls += " diff-line--removed";
        else cls += " diff-line--context";
        lineEl.className = cls;
        lineEl.textContent = line;
        container._lineClasses.push(cls);
        hunkEl.appendChild(lineEl);
      });

      container.appendChild(hunkEl);
    });
  }

  // ── Buffer controller ──────────────────────────────────────────────────────────
  // Module state survives buffer switches. Refresh is manual only: no fetch on
  // activation, no polling, no websocket subscription.
  var sessionId = "";
  var active = false;
  var reviewData = null;
  var tree = [];
  var expandedPaths = new Set();
  var selectedPath = null;
  var currentRepoId = "";
  var overviewControllers = [];

  function el(id) {
    return document.getElementById(id);
  }

  function getTreeContainer() {
    return el("review-tree");
  }
  function getDiffContainer() {
    return el("review-diff");
  }

  async function fetchReview() {
    var repoQuery = currentRepoId
      ? "?repoId=" + encodeURIComponent(currentRepoId)
      : "";
    var res = await fetch("/sessions/" + sessionId + "/review" + repoQuery);
    if (!res.ok) return;
    reviewData = await res.json();
    populateRepoSelect();
    tree = buildChangedTree(reviewData.files || []);
    expandedPaths = computeExpandedPaths(
      (reviewData.files || []).map(function (f) {
        return f.path;
      }),
    );
    selectedPath = null;
    updateSummary();
    render();
  }

  function populateRepoSelect() {
    var select =
      typeof document !== "undefined" && document.getElementById
        ? el("review-repo-select")
        : null;
    if (!select) return;
    var repoIds = {};
    (reviewData.files || []).forEach(function (file) {
      if (file.repoId) repoIds[file.repoId] = true;
    });
    var ids = Object.keys(repoIds).sort();
    select.innerHTML =
      '<option value="">All repositories</option>' +
      ids
        .map(function (repoId) {
          return '<option value="' + repoId + '">' + repoId + "</option>";
        })
        .join("");
    select.value = ids.indexOf(currentRepoId) >= 0 ? currentRepoId : "";
    select.onchange = function () {
      currentRepoId = select.value;
      fetchReview();
    };
  }

  function updateSummary() {
    var s = (reviewData && reviewData.summary) || {
      added: 0,
      modified: 0,
      deleted: 0,
    };
    var a = el("review-summary-added");
    var m = el("review-summary-modified");
    var d = el("review-summary-deleted");
    if (a) a.textContent = s.added || 0;
    if (m) m.textContent = s.modified || 0;
    if (d) d.textContent = s.deleted || 0;
  }

  function render() {
    var tc = getTreeContainer();
    if (tc) {
      tc._children = [];
      tc.innerHTML = "";
      if (!tree || tree.length === 0) {
        var empty = document.createElement("div");
        empty.className = "review-empty-state";
        empty.textContent = "No changes in this session yet";
        tc.appendChild(empty);
      } else {
        var root = renderTree(tree, {
          expandedPaths: expandedPaths,
          onFileSelect: function (path, status, repoId) {
            selectFile(path, status, repoId);
          },
          onToggleExpand: function (next) {
            expandedPaths = next;
            render();
          },
        });
        tc.appendChild(root);
      }
    }
    // Diff pane returns to empty state when no file is selected.
    var dc = getDiffContainer();
    if (dc && !selectedPath) {
      renderDiff(dc, { hunks: [], isBinary: false });
    }
  }

  async function selectFile(path, status, repoId) {
    selectedPath = repoId ? repoId + ":" + path : path;
    var dc = getDiffContainer();
    if (!dc) return;
    // Loading placeholder.
    renderDiff(dc, { hunks: [], isBinary: false });
    var reviewPath = repoId
      ? encodePath(repoId + "/" + path)
      : encodePath(path);
    var res = await fetch(
      "/sessions/" + sessionId + "/review/files/" + reviewPath,
    );
    if (!res.ok) {
      if (res.status === 404) {
        renderDiff(dc, { hunks: [], isBinary: false });
      }
      return;
    }
    var data = await res.json();
    renderDiff(dc, { hunks: data.hunks || [], isBinary: !!data.isBinary });
    attachOverview(dc);
  }

  function attachOverview(dc) {
    if (!window.MIMO_DIFF_OVERVIEW) return;
    var body = dc;
    var track = dc.querySelector
      ? dc.querySelector(".diff-overview-track")
      : null;
    if (!track) {
      // No track element — skip overview wiring unless the buffer shell provides one.
      return;
    }
    var rows = Array.prototype.slice.call(
      body.querySelectorAll(".diff-hunk-header, .diff-line"),
    );
    var hunks = window.MIMO_DIFF_OVERVIEW.collectHunks(rows, function (e) {
      if (e.classList.contains("diff-line--added")) return "added";
      if (e.classList.contains("diff-line--removed")) return "removed";
      return "unchanged";
    });
    var controller = window.MIMO_DIFF_OVERVIEW.attach({
      scrollEl: body,
      trackEl: track,
      totalRows: rows.length,
      hunks: hunks,
    });
    overviewControllers.push(controller);
  }

  async function refresh() {
    await fetchReview();
  }

  async function activate() {
    active = true;
    if (!sessionId) {
      sessionId =
        window.MIMO_SESSION_ID ||
        (window.location && window.location.pathname
          ? window.location.pathname.split("/").pop()
          : "") ||
        "";
    }
    // No lazy refresh on activation — render the previously fetched state only.
    render();
  }

  function deactivate() {
    active = false;
  }

  function isActive() {
    return active;
  }

  function setupActivationObserver() {
    if (typeof document === "undefined" || !document.querySelector) return;
    var panel = document.querySelector('[data-buffer-panel="review"]');
    if (!panel) return;
    if (typeof MutationObserver === "undefined") return;
    var observer = new MutationObserver(function () {
      var isActive = panel.classList.contains("active");
      if (isActive) activate();
      else deactivate();
    });
    observer.observe(panel, { attributes: true, attributeFilter: ["class"] });
    if (panel.classList.contains("active")) activate();
  }

  function wireRefreshButton() {
    var btn = el("review-refresh-btn");
    if (btn && !btn._wired) {
      btn._wired = true;
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        refresh();
      });
    }
  }

  function initReviewBuffer() {
    if (typeof document === "undefined" || !document.querySelector) return;
    var shell = document.querySelector(".review-buffer[data-session-id]");
    if (!shell) return;
    sessionId =
      shell.getAttribute("data-session-id") ||
      window.MIMO_SESSION_ID ||
      (window.location && window.location.pathname
        ? window.location.pathname.split("/").pop()
        : "");
    if (!sessionId) return;
    wireRefreshButton();
    setupActivationObserver();
  }

  var MIMO_REVIEW_BUFFER = {
    buildChangedTree: buildChangedTree,
    computeExpandedPaths: computeExpandedPaths,
    renderTree: renderTree,
    renderDiff: renderDiff,
    refresh: refresh,
    activate: activate,
    deactivate: deactivate,
    isActive: isActive,
    selectFile: selectFile,
  };

  if (typeof window !== "undefined") {
    window.MIMO_REVIEW_BUFFER = MIMO_REVIEW_BUFFER;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = MIMO_REVIEW_BUFFER;
  }

  if (typeof document !== "undefined" && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReviewBuffer);
  } else if (typeof document !== "undefined") {
    setTimeout(initReviewBuffer, 0);
  }
})();
