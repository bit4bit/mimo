// ═════════════════════════════════════════════════════════════════════════════
// MIMO FILE TREE - Collapsible workspace tree for the FileTree buffer.
//
// Pure helpers (`buildTree`, `computeExpandedPaths`, `mergeChangedStatus`,
// `findNode`) produce and query a nested tree from the flat `/files` list and
// the `/changed-files` result. The renderer (`renderTree`) and the buffer
// bootstrap (`attach`) own the only DOM side effects in this module.
// ═════════════════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  /**
   * A node in the file tree.
   * @typedef {Object} TreeNode
   * @property {string} name     - Last path segment (file or directory name).
   * @property {string} path     - Full slash-delimited path from workspace root.
   * @property {boolean} isDir   - True for directory nodes.
   * @property {TreeNode[]=} children - Present only for directory nodes.
   * @property {("added"|"modified"|"deleted")=} status - Changed-file status.
   */

  /**
   * Build a nested directory tree from the flat `GET /sessions/:id/files` list.
   *
   * Files are grouped by `/`-delimited segments. Directories are sorted before
   * their sibling files so the tree reads top-down; entries of the same kind are
   * sorted alphabetically (case-insensitive).
   *
   * @param {{path: string, name: string, size: number}[]} flatFiles
   * @returns {TreeNode[]}
   */
  function buildTree(flatFiles) {
    /** @type {Record<string, TreeNode>} */
    var root = { name: "", path: "", isDir: true, children: [] };

    for (var i = 0; i < flatFiles.length; i++) {
      var file = flatFiles[i];
      var segments = file.path.split("/");
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
        node = child;
      }
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
   * Compute the set of ancestor directory paths for every changed file so the
   * renderer can auto-expand exactly those directories on first paint.
   *
   * @param {TreeNode[]} _tree     - The built tree (unused; kept for API symmetry).
   * @param {string[]} changedFilePaths
   * @returns {Set<string>}
   */
  function computeExpandedPaths(_tree, changedFilePaths) {
    var expanded = new Set();
    for (var i = 0; i < changedFilePaths.length; i++) {
      var segments = String(changedFilePaths[i]).split("/");
      // Every ancestor except the file itself (the last segment).
      for (var s = 1; s < segments.length; s++) {
        expanded.add(segments.slice(0, s).join("/"));
      }
    }
    return expanded;
  }

  /**
   * Mark each present leaf with its changed-file status. Deleted files produce
   * no node, so they are removed from the tree entirely.
   *
   * Returns a new tree (the input is not mutated).
   *
   * @param {TreeNode[]} tree
   * @param {{path: string, status: string, size: number}[]} changedFiles
   * @returns {TreeNode[]}
   */
  function mergeChangedStatus(tree, changedFiles) {
    /** @type {Record<string, string>} */
    var byPath = {};
    for (var i = 0; i < changedFiles.length; i++) {
      byPath[changedFiles[i].path] = changedFiles[i].status;
    }
    return filterAndMark(tree, byPath);

    function filterAndMark(nodes, statuses) {
      var out = [];
      for (var k = 0; k < nodes.length; k++) {
        var node = nodes[k];
        if (!node.isDir) {
          var status = statuses[node.path];
          if (status === "deleted") continue; // deleted files produce no node
          out.push({
            name: node.name,
            path: node.path,
            isDir: false,
            status: status,
          });
        } else {
          var children = filterAndMark(node.children, statuses);
          out.push({
            name: node.name,
            path: node.path,
            isDir: true,
            children: children,
          });
        }
      }
      return out;
    }
  }

  /**
   * Find a node by its full path. Returns `undefined` when not present.
   *
   * @param {TreeNode[]} tree
   * @param {string} path
   * @returns {TreeNode|undefined}
   */
  function findNode(tree, path) {
    for (var i = 0; i < tree.length; i++) {
      var node = tree[i];
      if (node.path === path) return node;
      if (node.children) {
        var found = findNode(node.children, path);
        if (found) return found;
      }
    }
    return undefined;
  }

  // Reuse the shared status metadata from utils.js when available. The renderer
  // falls back to a minimal local copy so tests and standalone loads still work.
  function statusMeta() {
    if (typeof window !== "undefined" && window.FILE_STATUS_META)
      return window.FILE_STATUS_META;
    if (typeof FILE_STATUS_META !== "undefined") return FILE_STATUS_META;
    return {
      added: { badge: "+", cssClass: "file-status-new", color: "#51cf66" },
      modified: {
        badge: "~",
        cssClass: "file-status-changed",
        color: "#74c0fc",
      },
    };
  }

  /**
   * Default click handler: opens the file via the existing entry points and
   * switches the left frame, matching `utils.js:renderChangedFileRow`.
   */
  function defaultFileClick(path, status, sessionId) {
    if (status === "added" || status === undefined) {
      if (window.EditBuffer && window.EditBuffer.openFile) {
        window.EditBuffer.openFile(path);
      }
      if (window.switchFrameBuffer) {
        window.switchFrameBuffer("left", "edit");
      }
    } else if (status === "modified") {
      if (typeof openFileInPatchBuffer === "function") {
        openFileInPatchBuffer(path, sessionId);
      }
      // openFileInPatchBuffer already switches to the patches buffer.
    }
  }

  /**
   * Render a tree into a single root `<div class="tree-root">` element.
   *
   * @param {TreeNode[]} tree
   * @param {{expandedPaths: Set<string>, sessionId: string, onFileClick?: function, onToggleExpand?: function}} opts
   * @returns {HTMLElement}
   */
  function renderTree(tree, opts) {
    var root = document.createElement("div");
    root.className = "tree-root";
    root.setAttribute("data-help-id", "file-tree-root");
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
    // The directory is a block-level container so its children render below
    // its header row (not beside it). The header is the flex row the user
    // clicks to toggle expansion; the `.tree-children` block holds descendants.
    var el = document.createElement("div");
    el.className = "tree-dir" + (expanded ? " tree-dir--expanded" : "");
    el.setAttribute("data-path", node.path);
    el.setAttribute("data-help-id", "file-tree-dir");

    var header = document.createElement("div");
    header.className = "tree-row tree-dir-header";
    header.setAttribute("data-path", node.path);

    var caret = document.createElement("span");
    caret.className = "tree-caret";
    caret.textContent = expanded ? "▾" : "▸";
    header.appendChild(caret);

    var label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = node.name;
    header.appendChild(label);

    header.addEventListener("click", function (e) {
      e.stopPropagation();
      var next = new Set(opts.expandedPaths || []);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      if (opts.onToggleExpand) opts.onToggleExpand(next);
    });

    el.appendChild(header);

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
    el.className = "tree-leaf";
    el.setAttribute("data-path", node.path);
    el.setAttribute("data-help-id", "file-tree-leaf");

    // Use the same `.tree-row` layout as a directory header so leaves and
    // directory rows share alignment (caret column + label column).
    var row = document.createElement("div");
    row.className = "tree-row tree-leaf-row";
    row.setAttribute("data-path", node.path);
    row._isLeaf = true;

    // Reserve the caret column so file names line up under directory names.
    var spacer = document.createElement("span");
    spacer.className = "tree-caret-spacer";
    row.appendChild(spacer);

    var name = document.createElement("span");
    name.className = "tree-label";
    name.textContent = node.name;
    row.appendChild(name);

    if (node.status) {
      var meta = statusMeta()[node.status];
      if (meta) {
        var badge = document.createElement("span");
        badge.className = "tree-status " + meta.cssClass;
        badge.textContent = meta.badge;
        badge.style.color = meta.color;
        row.appendChild(badge);
      }
    }

    row.addEventListener("click", function (e) {
      e.stopPropagation();
      if (opts.onFileClick) {
        opts.onFileClick(node.path, node.status);
      } else {
        defaultFileClick(node.path, node.status, opts.sessionId);
      }
    });

    el.appendChild(row);
    return el;
  }

  /**
   * Attach the FileTree controller to a container element.
   *
   * The controller watches `isActive` transitions (via `setActive`) and, on a
   * `false → true` transition, issues parallel fetches to `/sessions/:id/files`
   * and `/sessions/:id/changed-files`, builds the tree, auto-expands the
   * ancestor directories of changed files, and renders into the container. No
   * fetches occur while inactive or while staying active (no polling).
   *
   * @param {HTMLElement} container
   * @param {{sessionId: string, fetchFn?: function, onFileClick?: function}} opts
   * @returns {{setActive: function, refresh: function, destroy: function}}
   */
  function attach(container, opts) {
    var sessionId = opts.sessionId;
    var fetchFn = opts.fetchFn || (typeof fetch !== "undefined" ? fetch : null);
    var onFileClick = opts.onFileClick;
    var active = false;
    var expandedPaths = new Set();
    var lastTree = [];

    function urls() {
      return {
        files: "/sessions/" + sessionId + "/files",
        changed: "/sessions/" + sessionId + "/changed-files",
      };
    }

    async function load() {
      if (!fetchFn) return;
      var u = urls();
      var _a, _b;
      var _f = fetchFn(u.files);
      var _c = fetchFn(u.changed);
      var _r = await Promise.all([_f, _c]);
      var filesRes = _r[0];
      var changedRes = _r[1];
      var files = filesRes.ok ? await filesRes.json() : [];
      var changed = changedRes.ok ? await changedRes.json() : { files: [] };
      var flat = files || [];
      var changedFiles = (changed && changed.files) || [];
      var tree = buildTree(flat);
      var merged = mergeChangedStatus(tree, changedFiles);
      expandedPaths = computeExpandedPaths(
        merged,
        changedFiles
          .filter(function (f) {
            return f.status !== "deleted";
          })
          .map(function (f) {
            return f.path;
          }),
      );
      lastTree = merged;
      render();
    }

    function render() {
      container._children = [];
      container.innerHTML = "";
      var root = renderTree(lastTree, {
        expandedPaths: expandedPaths,
        sessionId: sessionId,
        onFileClick: onFileClick,
        onToggleExpand: function (next) {
          expandedPaths = next;
          render();
        },
      });
      container.appendChild(root);
    }

    async function setActive(next) {
      if (next && !active) {
        active = true;
        await load();
      } else {
        active = !!next;
      }
    }

    async function refresh() {
      await load();
    }

    function destroy() {
      active = false;
      container._children = [];
      container.innerHTML = "";
    }

    return {
      setActive: setActive,
      refresh: refresh,
      destroy: destroy,
      isActive: function () {
        return active;
      },
    };
  }

  var MIMO_FILE_TREE = {
    buildTree: buildTree,
    computeExpandedPaths: computeExpandedPaths,
    mergeChangedStatus: mergeChangedStatus,
    findNode: findNode,
    renderTree: renderTree,
    attach: attach,
  };

  if (typeof window !== "undefined") {
    window.MIMO_FILE_TREE = MIMO_FILE_TREE;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MIMO_FILE_TREE;
  }

  // ─── Browser bootstrap ────────────────────────────────────────────────────
  // Wire the FileTree controller to its buffer panel: observe the panel's
  // `active`/`hidden` class toggles and drive `setActive` accordingly. Expose a
  // refresh button reusing the same load path. No-ops when the buffer is absent
  // (e.g. in unit tests that load this module for its pure helpers).
  function initFileTreeBuffer() {
    if (typeof document === "undefined" || !document.querySelector) return;
    var shell = document.querySelector(".file-tree-buffer[data-session-id]");
    if (!shell) return;
    var sessionId = shell.getAttribute("data-session-id");
    if (!sessionId) return;

    // Render the tree into the scrollable content area (not the shell), so the
    // header stays visible and the content can scroll. Falls back to the shell
    // if the content element is missing.
    var contentEl = document.querySelector("#file-tree-content");
    var container = contentEl || shell;
    var controller = attach(container, { sessionId: sessionId });
    window.MIMO_FILE_TREE_CONTROLLER = controller;

    // Resolve the frame-buffer-panel that wraps this shell. Its class toggles
    // between `active` and `hidden` when the user switches right-frame tabs.
    var panel = document.querySelector(
      '.frame-buffer-panel[data-buffer-panel="file-tree"]',
    );
    if (panel && typeof MutationObserver !== "undefined") {
      var observer = new MutationObserver(function () {
        var isActive = panel.classList.contains("active");
        controller.setActive(isActive);
      });
      observer.observe(panel, { attributes: true, attributeFilter: ["class"] });
      // Seed the initial state so a first paint isn't missed.
      controller.setActive(panel.classList.contains("active"));
    } else {
      // No observer available: load eagerly so the tree is visible on first paint.
      controller.setActive(true);
    }

    // Manual refresh affordance.
    var refreshBtn = document.querySelector("#file-tree-refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function (e) {
        e.preventDefault();
        controller.refresh();
      });
    }
  }

  if (typeof document !== "undefined" && document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFileTreeBuffer);
  } else if (typeof document !== "undefined") {
    // Defer so the buffer panel has a chance to render in the page.
    setTimeout(initFileTreeBuffer, 0);
  }
})();
