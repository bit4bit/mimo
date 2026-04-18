// Commit dialog functionality with change tree preview
(function () {
  const commitBtn = document.getElementById("commit-btn");
  const commitDialog = document.getElementById("commit-dialog");
  const commitMessage = document.getElementById("commit-message");
  const commitConfirm = document.getElementById("commit-confirm");
  const commitCancel = document.getElementById("commit-cancel");
  const commitError = document.getElementById("commit-error");
  const commitStatus = document.getElementById("commit-status");
  const syncNowBtn = document.getElementById("sync-now-btn");
  const syncStatus = document.getElementById("sync-status");

  // Tree elements
  const commitTree = document.getElementById("commit-tree");
  const filterAdded = document.getElementById("filter-added");
  const filterModified = document.getElementById("filter-modified");
  const filterDeleted = document.getElementById("filter-deleted");
  const countAdded = document.getElementById("count-added");
  const countModified = document.getElementById("count-modified");
  const countDeleted = document.getElementById("count-deleted");
  const selectedCount = document.getElementById("selected-count");
  const totalCount = document.getElementById("total-count");

  if (!commitBtn || !commitDialog) return;

  const sessionId =
    window.MIMO_SESSION_ID || window.location.pathname.split("/").pop();

  // State
  let previewData = null;
  let selectedPaths = new Set();
  let expandedFiles = new Set();
  let expandedDirs = new Set();
  let statusFilters = { added: true, modified: true, deleted: true };

  function formatSyncStatus(status) {
    if (!status) {
      return "Sync: unknown";
    }

    if (status.syncState === "error") {
      return `Sync error: ${status.lastSyncError || "Unknown error"}`;
    }

    if (status.syncState === "syncing") {
      return "Sync: syncing...";
    }

    if (status.lastSyncAt) {
      const time = new Date(status.lastSyncAt).toLocaleTimeString();
      return `Synced at ${time}`;
    }

    return "Sync: idle";
  }

  async function refreshSyncStatus() {
    if (!sessionId || !syncStatus) {
      return;
    }

    try {
      const response = await fetch(`/sessions/${sessionId}/sync-status`);
      if (!response.ok) {
        return;
      }

      const status = await response.json();
      syncStatus.textContent = formatSyncStatus(status);
      syncStatus.style.color =
        status.syncState === "error" ? "#ff6b6b" : "#888";
    } catch {
      // Ignore polling errors
    }
  }

  // Fetch preview from server
  async function fetchPreview() {
    if (!sessionId) return;

    try {
      const response = await fetch(`/commits/${sessionId}/preview`);
      if (!response.ok) {
        throw new Error("Failed to fetch preview");
      }

      const result = await response.json();
      if (result.success && result.preview) {
        previewData = result.preview;
        // Start with nothing selected - user picks what to commit
        selectedPaths = new Set();
        updateUI();
      } else {
        showError(result.error || "Failed to load preview");
      }
    } catch (error) {
      showError("Failed to load preview: " + error.message);
      // Show empty state
      commitTree.innerHTML =
        '<div class="commit-empty-state">Failed to load changes</div>';
    }
  }

  // Update all UI elements
  function updateUI() {
    if (!previewData) return;

    // Update status counts
    countAdded.textContent = previewData.summary.added;
    countModified.textContent = previewData.summary.modified;
    countDeleted.textContent = previewData.summary.deleted;

    // Update selected/total counts
    const visibleFiles = getVisibleFiles();
    const selectedVisible = visibleFiles.filter((f) =>
      selectedPaths.has(f.path),
    );
    selectedCount.textContent = selectedVisible.length;
    totalCount.textContent = visibleFiles.length;

    // Update commit button state
    const message = commitMessage.value.trim();
    const hasSelection = selectedVisible.length > 0;
    commitConfirm.disabled = !message || !hasSelection;

    // Render tree
    renderTree();
  }

  // Get files filtered by status
  function getVisibleFiles() {
    if (!previewData) return [];
    return previewData.files.filter((f) => {
      if (f.status === "added" && !statusFilters.added) return false;
      if (f.status === "modified" && !statusFilters.modified) return false;
      if (f.status === "deleted" && !statusFilters.deleted) return false;
      return true;
    });
  }

  // Render the file tree
  function renderTree() {
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

    // Build tree from visible files
    const treeRoot = buildTree(visibleFiles);
    commitTree.innerHTML = "";
    commitTree.appendChild(renderTreeNodes(treeRoot, ""));
  }

  // Build tree structure from files
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

        if (!isLast) {
          current = current[part].children;
        }
      });
    });

    return root;
  }

  // Render tree nodes recursively
  function renderTreeNodes(nodes, parentPath) {
    const container = document.createElement("div");
    container.className = "tree-children";
    if (!parentPath) container.className = "";

    // Sort: directories first, then alphabetically
    const sorted = Object.values(nodes).sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    sorted.forEach((node) => {
      const nodeEl = document.createElement("div");
      nodeEl.className = `tree-node tree-node--${node.type}`;

      // Row holds checkbox + toggle + label horizontally
      const nodeRow = document.createElement("div");
      nodeRow.className = "tree-node-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "tree-checkbox";
      checkbox.dataset.path = node.path;

      if (node.type === "file") {
        checkbox.checked = selectedPaths.has(node.path);
        checkbox.addEventListener("change", (e) => {
          if (e.target.checked) {
            selectedPaths.add(node.path);
          } else {
            selectedPaths.delete(node.path);
          }
          updateParentCheckboxes();
          updateUI();
        });
      } else {
        // Directory - compute tri-state
        const descendantFiles = getDescendantFiles(node);
        const selectedDescendants = descendantFiles.filter((p) =>
          selectedPaths.has(p),
        );

        if (selectedDescendants.length === 0) {
          checkbox.checked = false;
        } else if (selectedDescendants.length === descendantFiles.length) {
          checkbox.checked = true;
        } else {
          checkbox.indeterminate = true;
        }

        checkbox.addEventListener("change", (e) => {
          const files = getDescendantFiles(node);
          if (e.target.checked) {
            files.forEach((p) => selectedPaths.add(p));
          } else {
            files.forEach((p) => selectedPaths.delete(p));
          }
          updateUI();
        });
      }

      const toggle = document.createElement("span");
      toggle.className = "tree-toggle";
      if (node.type === "directory") {
        toggle.textContent = node.expanded ? "▼" : "▶";
        toggle.addEventListener("click", () => {
          if (node.expanded) {
            expandedDirs.delete(node.path);
          } else {
            expandedDirs.add(node.path);
          }
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
        const statusBadge = document.createElement("span");
        statusBadge.className = `file-status file-status--${node.file.status}`;
        if (node.file.isBinary) {
          statusBadge.className += " file-status--binary";
          statusBadge.textContent = "Binary";
        } else {
          statusBadge.textContent =
            node.file.status.charAt(0).toUpperCase() +
            node.file.status.slice(1);
        }
        label.appendChild(statusBadge);
      }

      nodeRow.appendChild(checkbox);
      if (node.type === "directory") {
        nodeRow.appendChild(toggle);
      } else {
        nodeRow.appendChild(document.createElement("span")); // Spacer
      }
      nodeRow.appendChild(label);
      nodeEl.appendChild(nodeRow);

      // Add diff preview for expanded modified files — below the row, not inside it
      if (
        node.type === "file" &&
        node.file.status === "modified" &&
        !node.file.isBinary &&
        expandedFiles.has(node.path)
      ) {
        const diffEl = renderFileDiff(node.file);
        nodeEl.appendChild(diffEl);
      }

      // Make file labels clickable to expand diff
      if (
        node.type === "file" &&
        node.file.status === "modified" &&
        !node.file.isBinary
      ) {
        label.style.cursor = "pointer";
        label.addEventListener("click", () => {
          if (expandedFiles.has(node.path)) {
            expandedFiles.delete(node.path);
          } else {
            expandedFiles.add(node.path);
          }
          updateUI();
        });
      }

      container.appendChild(nodeEl);

      // Recursively render children for directories
      if (
        node.type === "directory" &&
        node.expanded &&
        Object.keys(node.children).length > 0
      ) {
        const childrenEl = renderTreeNodes(node.children, node.path);
        container.appendChild(childrenEl);
      }
    });

    return container;
  }

  // Get all file paths under a directory node
  function getDescendantFiles(node) {
    const files = [];

    function collect(n) {
      if (n.type === "file") {
        files.push(n.path);
      } else if (n.children) {
        Object.values(n.children).forEach(collect);
      }
    }

    collect(node);
    return files;
  }

  // Update parent checkboxes based on child state
  function updateParentCheckboxes() {
    // This is handled by re-rendering the tree in updateUI()
  }

  // Render diff for a modified file
  function renderFileDiff(file) {
    const diffEl = document.createElement("div");
    diffEl.className = "file-diff";

    const header = document.createElement("div");
    header.className = "file-diff-header";

    const title = document.createElement("span");
    title.className = "file-diff-title";
    title.textContent = "Unified Diff";

    const closeBtn = document.createElement("button");
    closeBtn.className = "file-diff-close";
    closeBtn.innerHTML = "×";
    closeBtn.addEventListener("click", () => {
      expandedFiles.delete(file.path);
      updateUI();
    });

    header.appendChild(title);
    header.appendChild(closeBtn);
    diffEl.appendChild(header);

    if (!file.hunks || file.hunks.length === 0) {
      const noDiff = document.createElement("div");
      noDiff.className = "diff-binary";
      noDiff.textContent = "No diff content available";
      diffEl.appendChild(noDiff);
      return diffEl;
    }

    file.hunks.forEach((hunk) => {
      const hunkEl = document.createElement("div");
      hunkEl.className = "diff-hunk";

      const hunkHeader = document.createElement("div");
      hunkHeader.className = "diff-hunk-header";
      hunkHeader.textContent = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
      hunkEl.appendChild(hunkHeader);

      // Skip the hunk header line in lines array
      hunk.lines.slice(1).forEach((line) => {
        const lineEl = document.createElement("div");
        lineEl.className = "diff-line";

        if (line.startsWith("+")) {
          lineEl.className += " diff-line--added";
        } else if (line.startsWith("-")) {
          lineEl.className += " diff-line--removed";
        } else {
          lineEl.className += " diff-line--context";
        }

        lineEl.textContent = line;
        hunkEl.appendChild(lineEl);
      });

      diffEl.appendChild(hunkEl);
    });

    return diffEl;
  }

  function showError(message) {
    commitError.textContent = message;
  }

  function clearError() {
    commitError.textContent = "";
  }

  function cancelCommitDialog() {
    if (commitCancel) {
      commitCancel.click();
      return;
    }
    commitDialog.style.display = "none";
  }

  function isEscapeKey(e) {
    return e.key === "Escape" || e.key === "Esc" || e.keyCode === 27;
  }

  function isCommitDialogOpen() {
    return commitDialog?.style.display !== "none";
  }

  // Open dialog - fetch preview
  commitBtn.addEventListener("click", async () => {
    commitDialog.style.display = "flex";
    commitMessage.value = "";
    clearError();
    previewData = null;
    selectedPaths.clear();
    expandedFiles.clear();
    expandedDirs.clear();

    // Reset filters: added and modified enabled, deleted disabled
    filterAdded.checked = true;
    filterModified.checked = true;
    filterDeleted.checked = false;
    statusFilters = { added: true, modified: true, deleted: false };

    commitTree.innerHTML =
      '<div class="commit-empty-state">Loading changes...</div>';

    await fetchPreview();
    commitMessage.focus();
  });

  // Status filter handlers
  filterAdded?.addEventListener("change", (e) => {
    statusFilters.added = e.target.checked;
    updateUI();
  });

  filterModified?.addEventListener("change", (e) => {
    statusFilters.modified = e.target.checked;
    updateUI();
  });

  filterDeleted?.addEventListener("change", (e) => {
    statusFilters.deleted = e.target.checked;
    updateUI();
  });

  // Cancel
  commitCancel?.addEventListener("click", () => {
    commitDialog.style.display = "none";
  });

  // Message change handler
  commitMessage?.addEventListener("input", () => {
    updateUI();
  });

  // Commit and push
  commitConfirm?.addEventListener("click", async () => {
    const message = commitMessage.value.trim();
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

    commitConfirm.disabled = true;
    commitConfirm.textContent = "Committing...";
    clearError();

    try {
      const response = await fetch(`/commits/${sessionId}/commit-and-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          selectedPaths: selectedVisible.map((f) => f.path),
          applyStatuses: statusFilters,
        }),
      });

      const result = await response.json();

      if (result.success) {
        commitDialog.style.display = "none";
        commitStatus.textContent =
          result.message || "Changes committed and pushed successfully!";
        commitStatus.style.color = "#51cf66";
        setTimeout(() => {
          commitStatus.textContent = "";
        }, 5000);
        // Refresh page to show updated changes
        window.location.reload();
      } else {
        // Handle different failure cases based on the step
        if (result.step === "push") {
          commitDialog.style.display = "none";
          commitStatus.textContent = `Committed but push failed: ${result.error || "Unknown error"}`;
          commitStatus.style.color = "#ffd43b";
        } else {
          showError(result.error || result.message || "Commit failed");
        }
      }
    } catch (error) {
      showError(`Error: ${error.message}`);
    } finally {
      commitConfirm.disabled = false;
      commitConfirm.textContent = "Commit & Push";
    }
  });

  // Handle Escape key
  commitDialog?.addEventListener("keydown", (e) => {
    const isMetaShiftEnter =
      e.metaKey &&
      e.shiftKey &&
      (e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter");

    if (isMetaShiftEnter) {
      const isDialogOpen = commitDialog.style.display !== "none";
      if (isDialogOpen && commitConfirm && !commitConfirm.disabled) {
        e.preventDefault();
        commitConfirm.click();
      }
      return;
    }

    if (isEscapeKey(e)) {
      e.preventDefault();
      cancelCommitDialog();
    }
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (!isEscapeKey(e)) {
        return;
      }
      if (!isCommitDialogOpen()) {
        return;
      }
      e.preventDefault();
      cancelCommitDialog();
    },
    true,
  );

  // Close on backdrop click
  commitDialog?.addEventListener("click", (e) => {
    if (e.target === commitDialog) {
      commitDialog.style.display = "none";
    }
  });

  syncNowBtn?.addEventListener("click", async () => {
    if (!sessionId) {
      return;
    }

    syncNowBtn.disabled = true;
    syncNowBtn.textContent = "Syncing...";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const response = await fetch(`/sessions/${sessionId}/sync`, {
        method: "POST",
        signal: controller.signal,
      });
      const result = await response.json();

      if (result.success) {
        commitStatus.textContent = result.message || "Sync completed";
        commitStatus.style.color = "#51cf66";
      } else {
        commitStatus.textContent =
          result.error || result.message || "Sync failed";
        commitStatus.style.color = "#ff6b6b";
      }
    } catch (error) {
      const message =
        error.name === "AbortError"
          ? "Sync request timed out while waiting for agent response"
          : error.message;
      commitStatus.textContent = `Sync failed: ${message}`;
      commitStatus.style.color = "#ff6b6b";
    } finally {
      clearTimeout(timeoutId);
      syncNowBtn.disabled = false;
      syncNowBtn.textContent = "Sync Now";
      await refreshSyncStatus();
    }
  });

  refreshSyncStatus();
  setInterval(refreshSyncStatus, 15000);
})();
