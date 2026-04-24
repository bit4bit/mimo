(function () {
  "use strict";

  const DIALOG_ID = "session-finder-dialog";
  const INPUT_ID = "session-finder-input";
  const RESULTS_ID = "session-finder-results";

  let dialog = null;
  let input = null;
  let resultsEl = null;
  let highlightedIndex = -1;
  let currentResults = [];
  let debounceTimer = null;

  const DEFAULT_KEYBINDING = "Control+Shift+3";

  function getKeybinding() {
    return (
      window.MIMO_GLOBAL_KEYBINDINGS?.openSessionFinder || DEFAULT_KEYBINDING
    );
  }

  function parseKeybinding(kb) {
    const parts = kb.split("+");
    const modifiers = new Set(parts.slice(0, -1).map((m) => m.toLowerCase()));
    const key = parts[parts.length - 1].toLowerCase();
    return { modifiers, key };
  }

  function matchesKeybinding(e, kb) {
    const parts = kb.split("+");
    const requiredModifiers = parts.slice(0, -1).map((m) => m.toLowerCase());
    const requiredKey = parts[parts.length - 1].toLowerCase();

    // Check modifiers
    if (requiredModifiers.includes("control") && !e.ctrlKey) return false;
    if (requiredModifiers.includes("shift") && !e.shiftKey) return false;
    if (requiredModifiers.includes("alt") && !e.altKey) return false;
    if (requiredModifiers.includes("meta") && !e.metaKey) return false;

    // Reject extra modifiers (only allow if not required)
    if (!requiredModifiers.includes("control") && e.ctrlKey) return false;
    if (!requiredModifiers.includes("shift") && e.shiftKey) return false;
    if (!requiredModifiers.includes("alt") && e.altKey) return false;
    if (!requiredModifiers.includes("meta") && e.metaKey) return false;

    // Map config key names to their corresponding code for non-US keyboards
    // "Control+Shift+3" on US keyboard produces #, but on some keyboards the
    // physical key in that position produces ` (backtick) with key "Control+Shift+\\"
    const codeForKey = {
      "control+shift+3": "Equal",
      "control+shift+\\": "IntlBackslash",
      "control+shift+`": "Backquote",
      "control+shift+#": "Equal", // Spanish/Latin keyboards
    };
    
    const codeKey = kb.toLowerCase();
    if (codeForKey[codeKey]) {
      return e.code === codeForKey[codeKey];
    }
    
    // Fallback to key matching
    return e.key.toLowerCase() === requiredKey;
  }

  function openDialog() {
    if (!dialog) return;
    dialog.style.display = "flex";
    input.value = "";
    input.focus();
    highlightedIndex = -1;
    currentResults = [];
    fetchSessions("");
  }

  function closeDialog() {
    if (!dialog) return;
    dialog.style.display = "none";
    input.value = "";
    highlightedIndex = -1;
    currentResults = [];
    renderResults();
  }

  function isDialogOpen() {
    return dialog && dialog.style.display !== "none";
  }

  async function fetchSessions(q) {
    try {
      const url = q
        ? `/sessions/search?q=${encodeURIComponent(q)}`
        : "/sessions/search";
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/auth/login";
          return;
        }
        renderResults([{ error: "Failed to fetch sessions" }]);
        return;
      }
      currentResults = await res.json();
      highlightedIndex = currentResults.length > 0 ? 0 : -1;
      renderResults();
    } catch (err) {
      renderResults([{ error: "Network error" }]);
    }
  }

  function renderResults(results) {
    results = results || currentResults;
    if (!resultsEl) return;

    if (!results || results.length === 0) {
      resultsEl.innerHTML =
        '<div style="color: #888; font-size: 12px; padding: 8px 0;">No sessions found</div>';
      return;
    }

    if (results[0]?.error) {
      resultsEl.innerHTML = `<div style="color: #ff6b6b; font-size: 12px; padding: 8px 0;">${results[0].error}</div>`;
      return;
    }

    resultsEl.innerHTML = results
      .map(
        (r, i) => `
        <div class="session-finder-result ${i === highlightedIndex ? "highlighted" : ""}" 
             data-index="${i}"
             style="padding: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; ${i === highlightedIndex ? "background: #3a5a3a;" : ""}">
          <div>
            <div style="color: ${i === highlightedIndex ? "#fff" : "#d4d4d4"}; font-size: 13px;">${escapeHtml(r.sessionName)}</div>
            <div style="color: #888; font-size: 11px; margin-top: 2px;">${escapeHtml(r.projectName)}</div>
          </div>
          <span class="status-badge ${r.status}" style="font-size: 10px; padding: 2px 6px; border-radius: 3px; background: ${getStatusColor(r.status)};">${r.status}</span>
        </div>
      `,
      )
      .join("");

    resultsEl.querySelectorAll(".session-finder-result").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.dataset.index, 10);
        navigateToResult(idx);
      });
    });
  }

  function getStatusColor(status) {
    switch (status) {
      case "active":
        return "#2d5a2d";
      case "paused":
        return "#5a5a2d";
      case "closed":
        return "#5a2d2d";
      default:
        return "#333";
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function highlightResult(idx) {
    if (!currentResults || currentResults.length === 0) return;
    highlightedIndex = idx;
    renderResults();
  }

  function navigateToResult(idx) {
    const result = currentResults[idx];
    if (!result) return;
    window.open(
      `/projects/${result.projectId}/sessions/${result.sessionId}`,
      `session-${result.sessionId}`,
    );
    closeDialog();
  }

  function handleGlobalKeydown(e) {
    const targetKb = getKeybinding();
    const match = matchesKeybinding(e, targetKb);
    
    if (match) {
      e.preventDefault();
      if (isDialogOpen()) {
        closeDialog();
      } else {
        openDialog();
      }
      return;
    }
    
    if (isDialogOpen() && e.key === "Tab") {
      return;
    }
  }

  function handleInputKeydown(e) {
    if (!isDialogOpen()) return;

    if (e.altKey && e.shiftKey && e.key.toLowerCase() === "g") {
      e.preventDefault();
      closeDialog();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      console.log("[session-finder] Tab pressed, results:", currentResults.length);
      if (currentResults.length > 0) {
        if (e.shiftKey) {
          highlightedIndex =
            highlightedIndex <= 0
              ? currentResults.length - 1
              : highlightedIndex - 1;
        } else {
          highlightedIndex =
            highlightedIndex >= currentResults.length - 1
              ? 0
              : highlightedIndex + 1;
        }
        highlightResult(highlightedIndex);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      closeDialog();
      return;
    }

    if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      navigateToResult(highlightedIndex);
      return;
    }
  }

  function handleInputChange() {
    const q = input.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchSessions(q);
    }, 200);
  }

  function handleClickOutside(e) {
    if (!isDialogOpen()) return;
    if (e.target === dialog) {
      closeDialog();
    }
  }

  function init() {
    dialog = document.getElementById(DIALOG_ID);
    input = document.getElementById(INPUT_ID);
    resultsEl = document.getElementById(RESULTS_ID);

    if (!dialog || !input || !resultsEl) {
      return;
    }

    document.addEventListener("keydown", handleGlobalKeydown);
    input.addEventListener("keydown", handleInputKeydown, { capture: true });
    input.addEventListener("input", handleInputChange);
    dialog.addEventListener("click", handleClickOutside);

    document.addEventListener("mimo:openSessionFinder", () => {
      openDialog();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();