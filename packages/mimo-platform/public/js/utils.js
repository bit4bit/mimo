/**
 * Shared utilities for changed-files rendering.
 * Pure functions only - no DOM mutation, no global state.
 */

const FILE_STATUS_META = {
  // Commit preview statuses
  added: { badge: "+", cssClass: "file-status-new", color: "#51cf66" },
  modified: { badge: "~", cssClass: "file-status-changed", color: "#74c0fc" },
  deleted: { badge: "-", cssClass: "file-status-deleted", color: "#ff6b6b" },
  // Impact buffer statuses
  new: { badge: "+", cssClass: "file-status-new", color: "#51cf66" },
  changed: { badge: "~", cssClass: "file-status-changed", color: "#74c0fc" },
};

function shortPath(path) {
  const parts = path.split("/");
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : path;
}

/**
 * Pure function: creates DOM element for a changed file row.
 * Dependencies injected: no global state, no side effects outside element creation.
 */
function renderChangedFileRow(file, options = {}) {
  const {
    showCheckbox = false,
    checked = false,
    onChange = null,
    sessionId = null,
    hideRepoId = false,
  } = options;
  const meta = FILE_STATUS_META[file.status] || {
    badge: "?",
    cssClass: "",
    color: "#888",
  };
  const isDeleted = file.status === "deleted";
  const isNew = file.status === "added" || file.status === "new";
  const isModified = file.status === "modified" || file.status === "changed";

  const row = document.createElement("div");
  row.className = "changed-file-row";
  if (isDeleted) {
    row.classList.add("deleted");
  }

  // Checkbox
  if (showCheckbox) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "changed-file-checkbox";
    checkbox.checked = checked;
    if (onChange) {
      checkbox.addEventListener("change", (e) => onChange(e.target.checked));
    }
    row.appendChild(checkbox);
  }

  // Status badge
  const badge = document.createElement("span");
  badge.className = `changed-file-status ${meta.cssClass}`;
  badge.textContent = meta.badge;
  badge.style.color = meta.color;
  row.appendChild(badge);

  // File path
  const pathSpan = document.createElement("span");
  pathSpan.className = "changed-file-path";
  pathSpan.textContent =
    file.repoId && !hideRepoId
      ? `${file.repoId}:${shortPath(file.path)}`
      : shortPath(file.path);
  pathSpan.title =
    file.repoId && !hideRepoId ? `${file.repoId}:${file.path}` : file.path;
  row.appendChild(pathSpan);

  // Click handler
  if (!isDeleted && sessionId) {
    row.style.cursor = "pointer";
    row.addEventListener("click", (e) => {
      // Don't trigger on checkbox click
      if (e.target.type === "checkbox") return;

      if (options.onClick) {
        options.onClick(e, file);
      } else if (isNew) {
        if (window.EditBuffer && window.EditBuffer.openFile) {
          window.EditBuffer.openFile(file.path, file.repoId);
        }
      } else if (isModified) {
        openFileInPatchBuffer(file.path, sessionId, {
          sourceBufferId: options.sourceBufferId,
          repoId: file.repoId,
        });
      }
    });
  }

  return row;
}

/**
 * Shared repository-select helpers.
 *
 * Every buffer (commit, impact, file-tree, review) needs to populate a
 * `<select>` with the session's repositories so the user can scope an action
 * to a single repo. Previously each buffer reimplemented this — and several
 * derived the list from changed-file previews only, hiding repositories
 * without changes. These helpers provide a single source: the
 * `/sessions/:sessionId/repos` endpoint returns every repository in the
 * session regardless of whether it has changes.
 *
 *   - fetchSessionRepoIds(sessionId): async, returns sorted unique repo IDs.
 *   - buildRepoOptions(repoIds): pure, returns the HTML for the option list
 *     (without the leading "All repositories" entry so callers control the
 *     label).
 *   - populateRepoSelect(selectEl, repoIds, currentValue?): builds the option
 *     list (with "All repositories" first), restores the previous selection
 *     when still present, else falls back to "".
 */

async function fetchSessionRepoIds(sessionId) {
  if (!sessionId) return [];
  try {
    const res = await fetch(`/sessions/${sessionId}/repos`);
    if (!res.ok) return [];
    const data = await res.json();
    const repos = (data && data.repos) || [];
    const ids = repos
      .map((repo) => repo.repoId)
      .filter(Boolean)
      .sort();
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

function buildRepoOptions(repoIds) {
  return (repoIds || [])
    .map((repoId) => `<option value="${repoId}">${repoId}</option>`)
    .join("");
}

function populateRepoSelectOptions(selectEl, repoIds, currentValue) {
  if (!selectEl) return;
  const ids = Array.from(new Set((repoIds || []).filter(Boolean))).sort();
  selectEl.innerHTML =
    '<option value="">All repositories</option>' + buildRepoOptions(ids);
  selectEl.value = ids.includes(currentValue) ? currentValue : "";
}

function openFileInPatchBuffer(path, sessionId, opts = {}) {
  if (!window.MIMO_PATCH_BUFFER) return;

  window.MIMO_PATCH_BUFFER.addPatch({
    sessionId,
    repoId: opts.repoId,
    originalPath: path,
    patchPath: path,
    originalEndpoint: "files/upstream-content",
    readOnly: true,
    sourceBufferId: opts.sourceBufferId || "commit",
  });

  if (window.switchFrameBuffer) {
    window.switchFrameBuffer("left", "patches").then(() => {
      if (window.MIMO_PATCH_BUFFER.focusDiffPane) {
        window.MIMO_PATCH_BUFFER.focusDiffPane();
      }
    });
  }
}
