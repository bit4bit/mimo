// SPDX-License-Identifier: AGPL-3.0-only
// CommitBuffer — the commit review surface as a left-frame buffer.
//
// Replaces the former commit modal (`#commit-dialog`) and the three footer
// action buttons (`#commit-btn`, `#sync-now-btn`, `#force-push-btn`). The
// buffer is registered with id "commit" in frame "left", next to "patches".
//
// Lifecycle:
//   - activate():  fetch preview on first activation only; render list;
//                   start sync-status polling.
//   - deactivate(): retain message + selection in module state; stop polling.
//   - refresh():    re-fetch preview on demand.
//
// Module state (previewFetched, currentFiles, selectedPaths, commitMessage,
// lastFilter, active) survives buffer switches so the in-progress commit is
// not lost when navigating to Patches and back.
"use strict";

(function () {
  const sessionId =
    window.MIMO_SESSION_ID || window.location.pathname.split("/").pop();

  // ── Module state (survives buffer switches) ────────────────────────────────
  let previewFetched = false;
  let previewData = null;
  let selectedPaths = new Set();
  let expandedFiles = new Set();
  let expandedDirs = new Set();
  let commitMessage = "";
  let statusFilters = { added: true, modified: true, deleted: false };
  let active = false;

  // Overview controllers for each rendered file diff; the active one is the
  // navigation target for the change-navigation keybindings.
  let fileOverviewControllers = [];
  let activeCommitController = null;

  // Cache for file hunks fetched on demand so re-expanding a file is instant.
  const fileHunkCache = new Map();
  const pendingHunkRequests = new Map();

  let syncStatusIntervalId = null;

  // ── DOM lookups (lazily, since the panel may not exist at load time) ───────
  function el(id) {
    return document.getElementById(id);
  }

  function getCommitTree() {
    return el("commit-tree");
  }
  function getCommitMessage() {
    return el("commit-message");
  }
  function getCommitConfirm() {
    return el("commit-confirm");
  }
  function getCommitStatus() {
    return el("commit-status");
  }
  function getCommitError() {
    return el("commit-error");
  }
  function getSyncStatus() {
    return el("sync-status");
  }

  function navigateCommitChange(direction) {
    if (!activeCommitController) return false;
    if (direction < 0) activeCommitController.prev();
    else activeCommitController.next();
    return true;
  }

  function destroyFileOverviews() {
    fileOverviewControllers.forEach((controller) => {
      try {
        controller.destroy();
      } catch {
        // ignore teardown errors
      }
    });
    fileOverviewControllers = [];
    activeCommitController = null;
  }

  function formatSyncStatus(status) {
    if (!status) return "Sync: unknown";
    if (status.syncState === "error") {
      return `Sync error: ${status.lastSyncError || "Unknown error"}`;
    }
    if (status.syncState === "syncing") return "Sync: syncing...";
    if (status.lastSyncAt) {
      const time = new Date(status.lastSyncAt).toLocaleTimeString();
      return `Synced at ${time}`;
    }
    return "Sync: idle";
  }

  async function refreshSyncStatus() {
    if (!sessionId) return;
    const syncStatus = getSyncStatus();
    if (!syncStatus) return;
    try {
      const response = await fetch(`/sessions/${sessionId}/sync-status`);
      if (!response.ok) return;
      const status = await response.json();
      syncStatus.textContent = formatSyncStatus(status);
      syncStatus.style.color = status.syncState === "error" ? "#ff6b6b" : "#888";
    } catch {
      // Ignore polling errors
    }
  }

  async function fetchPreview() {
    if (!sessionId) return;
    const commitTree = getCommitTree();
    try {
      const response = await fetch(`/commits/${sessionId}/preview`);
      if (!response.ok) throw new Error("Failed to fetch preview");
      const result = await response.json();
      if (result.success && result.preview) {
        previewData = result.preview;
        // Preserve selection across refreshes: drop paths no longer present.
        const known = new Set((previewData.files || []).map((f) => f.path));
        selectedPaths = new Set(
          Array.from(selectedPaths).filter((p) => known.has(p)),
        );
        previewFetched = true;
        updateUI();
      } else {
        showError(result.error || "Failed to load preview");
      }
    } catch (error) {
      showError("Failed to load preview: " + error.message);
      if (commitTree) {
        commitTree.innerHTML =
          '<div class="commit-empty-state">Failed to load changes</div>';
      }
    }
  }

  function getVisibleFiles() {
    if (!previewData || !previewData.files) return [];
    return previewData.files.filter((f) => {
      if (f.status === "added" && !statusFilters.added) return false;
      if (f.status === "modified" && !statusFilters.modified) return false;
      if (f.status === "deleted" && !statusFilters.deleted) return false;
      return true;
    });
  }

  function buildTree(files) {
    const root = {};
    files.forEach((file) => {
      const parts = file.path.split("/");
      let current = root;
      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1;
        const pathSoFar = parts.slice(0, index + 1).join("/");
        if (!current[part]) {
          current[part] = {
            name: part,
            path: pathSoFar,
            type: isLast ? "file" : "directory",
            file: isLast ? file : null,
            children: isLast ? null : {},
            expanded: isLast
              ? expandedFiles.has(pathSoFar)
              : expandedDirs.has(pathSoFar),
          };
        }
        if (!isLast) current = current[part].children;
      });
    });
    return root;
  }

  function getDescendantFiles(node) {
    const files = [];
    function collect(n) {
      if (n.type === "file") files.push(n.path);
      else if (n.children) Object.values(n.children).forEach(collect);
    }
    collect(node);
    return files;
  }

  function renderTree() {
    destroyFileOverviews();
    const commitTree = getCommitTree();
    if (!commitTree) return;
    if (!previewData || previewData.files.length === 0) {
      commitTree.innerHTML =
        '<div class="commit-empty-state">No changes to commit</div>';
      return;
    }
    const visibleFiles = getVisibleFiles();
    if (visibleFiles.length === 0) {
      commitTree.innerHTML =
        '<div class="commit-empty-state">No files match the selected filters</div>';
      return;
    }
    const treeRoot = buildTree(visibleFiles);
    commitTree.innerHTML = "";
    commitTree.appendChild(renderTreeNodes(treeRoot, ""));
  }

  function renderTreeNodes(nodes, parentPath) {
    const container = document.createElement("div");
    container.className = "tree-children";
    if (!parentPath) container.className = "";

    const sorted = Object.values(nodes).sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    sorted.forEach((node) => {
      const nodeEl = document.createElement("div");
      nodeEl.className = `tree-node tree-node--${node.type}`;

      const nodeRow = document.createElement("div");
      nodeRow.className = "tree-node-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "tree-checkbox";
      checkbox.dataset.path = node.path;

      checkbox.addEventListener("keydown", (e) => {
        handleCommitKeyboard(e);
      });

      if (node.type === "file") {
        checkbox.checked = selectedPaths.has(node.path);
        checkbox.addEventListener("change", (e) => {
          if (e.target.checked) selectedPaths.add(node.path);
          else selectedPaths.delete(node.path);
          updateUI();
        });
      } else {
        const descendantFiles = getDescendantFiles(node);
        const selectedDescendants = descendantFiles.filter((p) =>
          selectedPaths.has(p),
        );
        if (selectedDescendants.length === 0) checkbox.checked = false;
        else if (selectedDescendants.length === descendantFiles.length)
          checkbox.checked = true;
        else checkbox.indeterminate = true;

        checkbox.addEventListener("change", (e) => {
          const files = getDescendantFiles(node);
          if (e.target.checked)
            files.forEach((p) => selectedPaths.add(p));
          else files.forEach((p) => selectedPaths.delete(p));
          updateUI();
        });
      }

      const toggle = document.createElement("span");
      toggle.className = "tree-toggle";
      if (node.type === "directory") {
        toggle.textContent = node.expanded ? "▼" : "▶";
        toggle.addEventListener("click", () => {
          if (node.expanded) expandedDirs.delete(node.path);
          else expandedDirs.add(node.path);
          updateUI();
        });
      }

      const label = document.createElement("span");
      label.className = "tree-label";

      const icon = document.createElement("span");
      icon.className = "tree-icon";
      if (node.type === "directory") {
        icon.className += " tree-icon--folder";
        icon.textContent = node.expanded ? "📂" : "📁";
      } else {
        icon.className += " tree-icon--file";
        icon.textContent = "📄";
      }

      const name = document.createElement("span");
      name.textContent = node.name;

      label.appendChild(icon);
      label.appendChild(name);

      if (node.type === "file") {
        const statusMeta = {
          added: { badge: "+", color: "#51cf66" },
          modified: { badge: "~", color: "#74c0fc" },
          deleted: { badge: "-", color: "#ff6b6b" },
        };
        const meta = statusMeta[node.file.status] || {
          badge: "?",
          color: "#888",
        };
        const statusBadge = document.createElement("span");
        statusBadge.className = `file-status file-status--${node.file.status}`;
        statusBadge.textContent = meta.badge;
        statusBadge.style.color = meta.color;
        label.appendChild(statusBadge);
      }

      nodeRow.appendChild(checkbox);
      if (node.type === "directory") nodeRow.appendChild(toggle);
      else nodeRow.appendChild(document.createElement("span"));
      nodeRow.appendChild(label);
      nodeEl.appendChild(nodeRow);

      if (
        node.type === "file" &&
        node.file.status === "modified" &&
        !node.file.isBinary &&
        expandedFiles.has(node.path)
      ) {
        const diffEl = renderFileDiff(node.file);
        nodeEl.appendChild(diffEl);
        if (!node.file.hunks) loadFileHunks(node.file, diffEl);
      }

      if (
        node.type === "file" &&
        node.file.status === "modified" &&
        !node.file.isBinary
      ) {
        label.style.cursor = "pointer";
        label.addEventListener("click", () => {
          // Cross-nav to Patches buffer for diff inspection.
          openFileInPatchBuffer(node.file.path, sessionId, {
            sourceBufferId: "commit",
          });
        });
      }

      container.appendChild(nodeEl);

      if (
        node.type === "directory" &&
        node.expanded &&
        Object.keys(node.children).length > 0
      ) {
        container.appendChild(renderTreeNodes(node.children, node.path));
      }
    });

    return container;
  }

  async function loadFileHunks(file, diffEl) {
    if (pendingHunkRequests.has(file.path)) return;
    const cached = fileHunkCache.get(file.path);
    if (cached) {
      file.hunks = cached.hunks;
      file.isBinary = cached.isBinary;
      updateUI();
      return;
    }
    pendingHunkRequests.set(file.path, true);
    setDiffLoading(diffEl, true);
    try {
      const response = await fetch(
        `/commits/${sessionId}/files/${encodeURIComponent(file.path)}/hunks`,
      );
      if (!response.ok) throw new Error("Failed to fetch diff");
      const result = await response.json();
      if (result.success) {
        file.hunks = result.hunks || [];
        file.isBinary = result.isBinary || false;
        fileHunkCache.set(file.path, {
          hunks: file.hunks,
          isBinary: file.isBinary,
        });
        updateUI();
      } else {
        setDiffError(diffEl, result.error || "Failed to load diff");
      }
    } catch (error) {
      setDiffError(diffEl, error.message || "Failed to load diff");
    } finally {
      pendingHunkRequests.delete(file.path);
    }
  }

  function setDiffLoading(diffEl, loading) {
    const body = diffEl.querySelector(".file-diff-body-wrap");
    if (!body) return;
    body.innerHTML = loading
      ? '<div class="diff-loading">Loading diff…</div>'
      : "";
  }

  function setDiffError(diffEl, message) {
    const body = diffEl.querySelector(".file-diff-body-wrap");
    if (!body) return;
    body.innerHTML = `<div class="diff-error">${escapeHtml(message)}</div>`;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function renderFileDiff(file) {
    const diffEl = document.createElement("div");
    diffEl.className = "file-diff";

    const header = document.createElement("div");
    header.className = "file-diff-header";

    const title = document.createElement("span");
    title.className = "file-diff-title";
    title.textContent = "Unified Diff";

    const counter = document.createElement("span");
    counter.className = "diff-change-counter";

    const closeBtn = document.createElement("button");
    closeBtn.className = "file-diff-close";
    closeBtn.innerHTML = "×";
    closeBtn.addEventListener("click", () => {
      expandedFiles.delete(file.path);
      updateUI();
    });

    header.appendChild(title);
    header.appendChild(counter);
    header.appendChild(closeBtn);
    diffEl.appendChild(header);

    const bodyWrap = document.createElement("div");
    bodyWrap.className = "file-diff-body-wrap";

    if (!file.hunks || file.hunks.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "diff-loading";
      placeholder.textContent = "Loading diff…";
      bodyWrap.appendChild(placeholder);
      diffEl.appendChild(bodyWrap);
      return diffEl;
    }

    const body = document.createElement("div");
    body.className = "file-diff-body";
    const track = document.createElement("div");
    track.className = "diff-overview-track";

    file.hunks.forEach((hunk) => {
      const hunkEl = document.createElement("div");
      hunkEl.className = "diff-hunk";

      const hunkHeader = document.createElement("div");
      hunkHeader.className = "diff-hunk-header";
      hunkHeader.textContent = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
      hunkEl.appendChild(hunkHeader);

      hunk.lines.slice(1).forEach((line) => {
        const lineEl = document.createElement("div");
        lineEl.className = "diff-line";
        if (line.startsWith("+")) lineEl.className += " diff-line--added";
        else if (line.startsWith("-"))
          lineEl.className += " diff-line--removed";
        else lineEl.className += " diff-line--context";
        lineEl.textContent = line;
        hunkEl.appendChild(lineEl);
      });

      body.appendChild(hunkEl);
    });

    bodyWrap.appendChild(body);
    bodyWrap.appendChild(track);
    diffEl.appendChild(bodyWrap);

    attachFileOverview(body, track, counter);

    return diffEl;
  }

  function attachFileOverview(body, track, counter) {
    if (!window.MIMO_DIFF_OVERVIEW) return;
    const rows = Array.from(
      body.querySelectorAll(".diff-hunk-header, .diff-line"),
    );
    const hunks = window.MIMO_DIFF_OVERVIEW.collectHunks(rows, (e) => {
      if (e.classList.contains("diff-line--added")) return "added";
      if (e.classList.contains("diff-line--removed")) return "removed";
      return "unchanged";
    });
    const controller = window.MIMO_DIFF_OVERVIEW.attach({
      scrollEl: body,
      trackEl: track,
      counterEl: counter,
      totalRows: rows.length,
      hunks,
    });
    fileOverviewControllers.push(controller);
    activeCommitController = controller;
    const makeActive = () => {
      activeCommitController = controller;
    };
    body.addEventListener("mousedown", makeActive);
    track.addEventListener("mousedown", makeActive);
  }

  function showError(message) {
    const err = getCommitError();
    if (err) err.textContent = message;
  }

  function clearError() {
    const err = getCommitError();
    if (err) err.textContent = "";
  }

  function updateUI() {
    const countAdded = el("count-added");
    const countModified = el("count-modified");
    const countDeleted = el("count-deleted");
    const selectedCount = el("selected-count");
    const totalCount = el("total-count");
    const confirm = getCommitConfirm();

    if (!previewData || !previewData.summary) {
      renderTree();
      return;
    }

    if (countAdded) countAdded.textContent = previewData.summary.added || 0;
    if (countModified)
      countModified.textContent = previewData.summary.modified || 0;
    if (countDeleted) countDeleted.textContent = previewData.summary.deleted || 0;

    const visibleFiles = getVisibleFiles();
    const selectedVisible = visibleFiles.filter((f) =>
      selectedPaths.has(f.path),
    );
    if (selectedCount) selectedCount.textContent = selectedVisible.length;
    if (totalCount) totalCount.textContent = visibleFiles.length;

    if (confirm) {
      const message = commitMessage.trim();
      const hasSelection = selectedVisible.length > 0;
      confirm.disabled = !message || !hasSelection;
    }

    renderTree();
  }

  // ── Buffer lifecycle ───────────────────────────────────────────────────────
  async function activate() {
    active = true;
    const commitTree = getCommitTree();
    if (commitTree) {
      commitTree.innerHTML =
        '<div class="commit-empty-state">Loading changes...</div>';
    }
    // Restore the persisted message into the textarea on activation.
    const msg = getCommitMessage();
    if (msg) msg.value = commitMessage;
    if (msg) {
      msg.oninput = () => {
        commitMessage = msg.value;
        updateUI();
      };
    }
    wireFilters();
    wireRefreshButton();
    wireActionButtons();
    if (!previewFetched) {
      await fetchPreview();
    } else {
      updateUI();
    }
    refreshSyncStatus();
    if (syncStatusIntervalId == null) {
      syncStatusIntervalId = setInterval(refreshSyncStatus, 15000);
    }
  }

  function deactivate() {
    active = false;
    // Persist the textarea value to module state before the panel is hidden.
    const msg = getCommitMessage();
    if (msg) commitMessage = msg.value;
    if (syncStatusIntervalId != null) {
      clearInterval(syncStatusIntervalId);
      syncStatusIntervalId = null;
    }
  }

  function wireFilters() {
    const fa = el("filter-added");
    const fm = el("filter-modified");
    const fd = el("filter-deleted");
    if (fa)
      fa.onchange = (e) => {
        statusFilters.added = e.target.checked;
        updateUI();
      };
    if (fm)
      fm.onchange = (e) => {
        statusFilters.modified = e.target.checked;
        updateUI();
      };
    if (fd)
      fd.onchange = (e) => {
        statusFilters.deleted = e.target.checked;
        updateUI();
      };
  }

  async function refresh() {
    await fetchPreview();
  }

  function wireRefreshButton() {
    const btn = el("commit-refresh-btn");
    if (btn) btn.onclick = () => {
      refresh();
    };
  }

  function wireActionButtons() {
    const confirm = getCommitConfirm();
    if (confirm) confirm.onclick = () => {
      submit();
    };
    const syncBtn = el("sync-now-btn");
    if (syncBtn) syncBtn.onclick = () => {
      syncNow();
    };
    const forceBtn = el("force-push-btn");
    if (forceBtn) forceBtn.onclick = () => {
      forcePush();
    };
  }

  function isEscapeKey(e) {
    return e.key === "Escape" || e.key === "Esc" || e.keyCode === 27;
  }

  function handleCommitKeyboard(e) {
    const isEnter =
      e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
    const isMetaShiftEnter = e.metaKey && e.shiftKey && isEnter;
    const isCtrlEnter =
      (e.ctrlKey || e.metaKey) && isEnter && !e.shiftKey;
    if (isMetaShiftEnter || isCtrlEnter) {
      const confirm = getCommitConfirm();
      if (active && confirm && !confirm.disabled) {
        e.preventDefault();
        submit();
      }
      return;
    }
    if (isEscapeKey(e)) {
      e.preventDefault();
      if (window.switchFrameBuffer) {
        // Escape switches away from the buffer rather than closing a modal.
        const prev = previousLeftBufferId();
        if (prev) window.switchFrameBuffer("left", prev);
      }
    }
  }

  function previousLeftBufferId() {
    const tabs = Array.from(
      document.querySelectorAll('.frame-tab[data-frame-id="left"]'),
    );
    if (tabs.length === 0) return null;
    const activeIdx = tabs.findIndex((t) => t.classList.contains("active"));
    if (activeIdx === -1) return tabs[0].getAttribute("data-buffer-id");
    // "patches" sits directly before "commit" in the left frame; fall back to
    // the tab before the active one, then to patches, then to chat.
    const candidates = ["patches", "chat"];
    for (const c of candidates) {
      const idx = tabs.findIndex(
        (t) => t.getAttribute("data-buffer-id") === c,
      );
      if (idx !== -1) return c;
    }
    return tabs[0].getAttribute("data-buffer-id");
  }

  async function submit() {
    const message = (getCommitMessage()?.value || commitMessage).trim();
    if (!message) {
      showError("Please enter a commit message");
      return;
    }
    const visibleFiles = getVisibleFiles();
    const selectedVisible = visibleFiles.filter((f) =>
      selectedPaths.has(f.path),
    );
    if (selectedVisible.length === 0) {
      showError("Please select at least one file to commit");
      return;
    }
    const confirm = getCommitConfirm();
    if (confirm) {
      confirm.disabled = true;
      confirm.textContent = "Committing...";
    }
    clearError();
    try {
      const response = await fetch(`/commits/${sessionId}/commit-and-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          selectedPaths: selectedVisible.map((f) => f.path),
          applyStatuses: statusFilters,
        }),
      });
      const result = await response.json();
      if (result.success) {
        const status = getCommitStatus();
        if (status) {
          status.textContent =
            result.message || "Changes committed and pushed successfully!";
          status.style.color = "#51cf66";
          setTimeout(() => {
            if (status) status.textContent = "";
          }, 5000);
        }
        // Clear the in-progress commit on success.
        commitMessage = "";
        selectedPaths.clear();
        const msg = getCommitMessage();
        if (msg) msg.value = "";
        await refresh();
        window.location.reload();
      } else {
        if (result.step === "push") {
          const status = getCommitStatus();
          if (status) {
            status.textContent = `Committed but push failed: ${result.error || "Unknown error"}`;
            status.style.color = "#ffd43b";
          }
        } else {
          showError(result.error || result.message || "Commit failed");
        }
      }
    } catch (error) {
      showError(`Error: ${error.message}`);
    } finally {
      if (confirm) {
        confirm.disabled = false;
        confirm.textContent = "Commit & Push";
      }
    }
  }

  async function syncNow() {
    const syncBtn = el("sync-now-btn");
    if (!sessionId) return;
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.textContent = "Syncing...";
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(`/sessions/${sessionId}/sync`, {
        method: "POST",
        signal: controller.signal,
      });
      const result = await response.json();
      const status = getCommitStatus();
      if (result.success) {
        if (status) {
          status.textContent = result.message || "Sync completed";
          status.style.color = "#51cf66";
        }
      } else {
        if (status) {
          status.textContent =
            result.error || result.message || "Sync failed";
          status.style.color = "#ff6b6b";
        }
      }
    } catch (error) {
      const status = getCommitStatus();
      const message =
        error.name === "AbortError"
          ? "Sync request timed out while waiting for agent response"
          : error.message;
      if (status) {
        status.textContent = `Sync failed: ${message}`;
        status.style.color = "#ff6b6b";
      }
    } finally {
      clearTimeout(timeoutId);
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.textContent = "Sync Now";
      }
      await refreshSyncStatus();
    }
  }

  async function forcePush() {
    const forceBtn = el("force-push-btn");
    if (!sessionId) return;
    if (forceBtn) {
      forceBtn.disabled = true;
      forceBtn.textContent = "Force pushing...";
    }
    const status = getCommitStatus();
    if (status) status.textContent = "";
    try {
      const response = await fetch(`/commits/${sessionId}/push-force`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (result.success) {
        if (status) {
          status.textContent =
            result.message || "Force push completed successfully!";
          status.style.color = "#51cf66";
        }
      } else {
        if (status) {
          status.textContent =
            result.error || result.message || "Force push failed";
          status.style.color = "#ff6b6b";
        }
      }
    } catch (error) {
      if (status) {
        status.textContent = `Force push failed: ${error.message}`;
        status.style.color = "#ff6b6b";
      }
    } finally {
      if (forceBtn) {
        forceBtn.disabled = false;
        forceBtn.textContent = "Force Push";
      }
      setTimeout(() => {
        if (status) status.textContent = "";
      }, 5000);
    }
  }

  function isActive() {
    return active;
  }

  function openFileInPatchBuffer(path, sid, opts) {
    if (!window.MIMO_PATCH_BUFFER) return;
    window.MIMO_PATCH_BUFFER.addPatch({
      sessionId: sid,
      originalPath: path,
      patchPath: path,
      originalEndpoint: "files/upstream-content",
      readOnly: true,
      sourceBufferId: (opts && opts.sourceBufferId) || "commit",
    });
    if (window.switchFrameBuffer) {
      window.switchFrameBuffer("left", "patches").then(() => {
        if (window.MIMO_PATCH_BUFFER.focusDiffPane)
          window.MIMO_PATCH_BUFFER.focusDiffPane();
      });
    }
  }

  // Expose the buffer surface for the keybinding registry and tests.
  window.MIMO_COMMIT_BUFFER = {
    navigateChange: navigateCommitChange,
    isActive,
    refresh,
    activate,
    deactivate,
    submit,
    syncNow,
    forcePush,
    selectFile: (path, selected) => {
      if (selected) selectedPaths.add(path);
      else selectedPaths.delete(path);
    },
  };

  // ── Auto-attach to the buffer panel via MutationObserver ───────────────────
  // The buffer panel is always in the DOM (rendered by Frame). We watch its
  // class toggling between "active" and "hidden" to drive lazy fetch and
  // message persistence across buffer switches.
  function setupActivationObserver() {
    const panel = document.querySelector('[data-buffer-panel="commit"]');
    if (!panel || typeof MutationObserver === "undefined") return;
    let lastActive = false;
    const observer = new MutationObserver(() => {
      const nowActive = panel.classList.contains("active");
      if (nowActive && !lastActive) {
        lastActive = true;
        activate();
      } else if (!nowActive && lastActive) {
        lastActive = false;
        deactivate();
      }
    });
    observer.observe(panel, {
      attributes: true,
      attributeFilter: ["class"],
    });
    // If the panel is already active on load (e.g. persisted frame state),
    // activate immediately.
    if (panel.classList.contains("active")) {
      lastActive = true;
      activate();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupActivationObserver);
  } else {
    setupActivationObserver();
  }

  // Keyboard handler bound to the tree/panel for Ctrl+Enter / Escape.
  const tree = getCommitTree();
  if (tree) tree.addEventListener("keydown", handleCommitKeyboard);
})();