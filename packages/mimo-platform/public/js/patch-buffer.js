"use strict";

(function () {
  // ── PatchBuffer State ────────────────────────────────────────────────────────

  const PatchBufferState = (function () {
    let tabs = [];
    let activeIndex = -1;
    let sessionId = null;

    function setSessionId(id) {
      sessionId = id;
    }

    function getSessionId() {
      return sessionId;
    }

    function addTab(tab) {
      // Check if a tab for this originalPath already exists
      const existingIndex = tabs.findIndex(function (t) {
        return t.originalPath === tab.originalPath;
      });

      if (existingIndex !== -1) {
        // Update existing tab, preserve sourceBufferId if not overridden
        tabs[existingIndex] = { ...tabs[existingIndex], ...tab };
        if (tab.sourceBufferId) {
          tabs[existingIndex].sourceBufferId = tab.sourceBufferId;
        }
        activeIndex = existingIndex;
      } else {
        // Add new tab
        tabs.push({ ...tab, sourceBufferId: tab.sourceBufferId || null });
        activeIndex = tabs.length - 1;
      }
    }

    function removeTab(index) {
      if (index < 0 || index >= tabs.length) return;
      tabs.splice(index, 1);
      if (activeIndex >= tabs.length) {
        activeIndex = tabs.length - 1;
      }
    }

    function getActiveTab() {
      if (activeIndex < 0 || activeIndex >= tabs.length) return null;
      return tabs[activeIndex];
    }

    function setActiveIndex(index) {
      if (index >= 0 && index < tabs.length) {
        activeIndex = index;
      }
    }

    function getAllTabs() {
      return tabs;
    }

    function getActiveIndex() {
      return activeIndex;
    }

    function updateTabContent(index, originalContent, patchedContent) {
      if (index < 0 || index >= tabs.length) return;
      tabs[index].originalContent = originalContent;
      tabs[index].patchedContent = patchedContent;
    }

    return {
      setSessionId,
      getSessionId,
      addTab,
      removeTab,
      getActiveTab,
      setActiveIndex,
      getAllTabs,
      getActiveIndex,
      updateTabContent,
    };
  })();

  // ── Diff Rendering ───────────────────────────────────────────────────────────

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function unescapeHtml(str) {
    return str
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  function renderDiff(originalContent, patchedContent) {
    const originalPane = document.getElementById("patch-original-pane");
    const patchedPane = document.getElementById("patch-patched-pane");
    if (!originalPane || !patchedPane) return;

    const diff = window.MIMO_DIFF
      ? window.MIMO_DIFF.computeDiff(originalContent, patchedContent)
      : null;

    if (!diff) {
      originalPane.innerHTML =
        '<div style="padding:12px;color:#888;">Diff library not loaded.</div>';
      patchedPane.innerHTML = "";
      return;
    }

    // Render original pane (highlight removed lines)
    let originalHtml = "";
    diff.original.lines.forEach(function (line) {
      const isRemoved = line.type === "removed";
      const bg = isRemoved ? "#3a1a1a" : "transparent";
      const borderLeft = isRemoved ? "2px solid #f44336" : "2px solid transparent";
      const marker = isRemoved ? "─" : "";

      originalHtml +=
        '<div style="display:flex;background:' +
        bg +
        ";border-left:" +
        borderLeft +
        ';padding:0 8px;" data-line-type="' +
        line.type +
        '"" >' +
        '<span style="color:#555;text-align:right;user-select:none;min-width:40px;flex-shrink:0;padding-right:8px;">' +
        (line.lineNumber || "") +
        '</span><span style="color:#888;user-select:none;width:16px;">' +
        marker +
        '</span><span style="white-space:pre;flex:1;">' +
        escapeHtml(line.content) +
        "</span></div>";
    });

    // Render patched pane (highlight added lines)
    let patchedHtml = "";
    diff.modified.lines.forEach(function (line) {
      const isAdded = line.type === "added";
      const bg = isAdded ? "#1a3a1a" : "transparent";
      const borderLeft = isAdded ? "2px solid #4caf50" : "2px solid transparent";
      const marker = isAdded ? "+" : "";

      patchedHtml +=
        '<div style="display:flex;background:' +
        bg +
        ";border-left:" +
        borderLeft +
        ';padding:0 8px;" data-line-type="' +
        line.type +
        '"">' +
        '<span style="color:#555;text-align:right;user-select:none;min-width:40px;flex-shrink:0;padding-right:8px;">' +
        (line.lineNumber || "") +
        '</span><span style="color:#888;user-select:none;width:16px;">' +
        marker +
        '</span><span style="white-space:pre;flex:1;">' +
        escapeHtml(line.content) +
        "</span></div>";
    });

    originalPane.innerHTML = originalHtml;
    patchedPane.innerHTML = patchedHtml;

    // Sync scrolling
    let syncing = false;
    originalPane.addEventListener("scroll", function () {
      if (syncing) return;
      syncing = true;
      patchedPane.scrollTop = originalPane.scrollTop;
      syncing = false;
    });
    patchedPane.addEventListener("scroll", function () {
      if (syncing) return;
      syncing = true;
      originalPane.scrollTop = patchedPane.scrollTop;
      syncing = false;
    });
  }

  // ── UI Rendering ───────────────────────────────────────────────────────────

  function renderTabs() {
    const tabsEl = document.getElementById("patch-buffer-tabs");
    if (!tabsEl) return;

    const tabs = PatchBufferState.getAllTabs();
    const activeIndex = PatchBufferState.getActiveIndex();

    let html = "";
    tabs.forEach(function (tab, index) {
      const isActive = index === activeIndex;
      const fileName = tab.originalPath.split("/").pop() || tab.originalPath;
      html +=
        '<div class="patch-tab" data-index="' +
        index +
        '" style="display:flex;align-items:center;padding:8px 12px;cursor:pointer;border-right:1px solid #444;background:' +
        (isActive ? "#1a1a1a" : "transparent") +
        ';color:' +
        (isActive ? "#d4d4d4" : "#888") +
        ';font-family:monospace;font-size:12px;">' +
        '<span>' +
        fileName +
        '</span>' +
        '<span class="patch-tab-close" data-index="' +
        index +
        '" style="margin-left:8px;padding:2px 4px;cursor:pointer;color:#666;">✕</span>' +
        "</div>";
    });

    tabsEl.innerHTML = html;

    // Add click handlers
    tabsEl.querySelectorAll(".patch-tab").forEach(function (tabEl) {
      tabEl.addEventListener("click", function (e) {
        if (e.target.classList.contains("patch-tab-close")) {
          e.stopPropagation();
          const index = parseInt(e.target.getAttribute("data-index"), 10);
          declinePatch(index);
        } else {
          const index = parseInt(tabEl.getAttribute("data-index"), 10);
          activateTab(index);
        }
      });
    });
  }

  function updateContextBar() {
    const ctxBar = document.getElementById("patch-context-bar");
    const pathEl = document.getElementById("patch-file-path");
    const diffContainer = document.getElementById("patch-diff-container");
    const emptyState = document.getElementById("patch-empty-state");
    const approveBtn = document.getElementById("patch-approve-btn");
    const declineBtn = document.getElementById("patch-decline-btn");

    const activeTab = PatchBufferState.getActiveTab();

    if (!activeTab) {
      if (ctxBar) ctxBar.style.display = "none";
      if (diffContainer) diffContainer.style.display = "none";
      if (emptyState) emptyState.style.display = "flex";
      return;
    }

    if (ctxBar) {
      ctxBar.style.display = "flex";
      if (pathEl) pathEl.textContent = activeTab.originalPath;
    }

    if (diffContainer) {
      diffContainer.style.display = "flex";
    }

    if (emptyState) {
      emptyState.style.display = "none";
    }

    // Enable/disable buttons
    if (approveBtn) approveBtn.disabled = false;
    if (declineBtn) declineBtn.disabled = false;
  }

  function showToast(message, type) {
    const container = document.getElementById("patch-buffer-container");
    if (!container) return;

    let el = document.getElementById("patch-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "patch-toast";
      el.style.cssText =
        "position:absolute;bottom:50px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:4px;font-size:13px;z-index:1000;";
      container.appendChild(el);
    }

    el.textContent = message;
    el.style.background = type === "success" ? "#4caf50" : type === "error" ? "#f44336" : "#333";
    el.style.color = "#fff";
    el.style.display = "block";

    setTimeout(function () {
      if (el) el.style.display = "none";
    }, 2000);
  }

  function showStaleWarning(originalPath) {
    const container = document.getElementById("patch-buffer-container");
    if (!container) return;

    // Only show if we have an active tab for this path
    const activeTab = PatchBufferState.getActiveTab();
    if (!activeTab || activeTab.originalPath !== originalPath) return;

    let el = document.getElementById("patch-stale-warning");
    if (!el) {
      el = document.createElement("div");
      el.id = "patch-stale-warning";
      el.style.cssText =
        "position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#ff9800;color:#000;padding:8px 16px;border-radius:4px;font-size:13px;z-index:1000;font-weight:500;";
      container.appendChild(el);
    }

    el.textContent =
      "The original file has been modified externally. This diff may be stale.";
    el.style.display = "block";
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function loadPatchContent(tab) {
    const sessionId = PatchBufferState.getSessionId();
    if (!sessionId) return;

    try {
      // Fetch original file content
      const originalRes = await fetch(
        "/sessions/" +
          sessionId +
          "/files/content?path=" +
          encodeURIComponent(tab.originalPath)
      );
      if (!originalRes.ok) throw new Error("Failed to load original file");
      const originalData = await originalRes.json();
      const originalContent = unescapeHtml(originalData.content || "");

      // Fetch patched file content
      const patchedRes = await fetch(
        "/sessions/" +
          sessionId +
          "/files/content?path=" +
          encodeURIComponent(tab.patchPath)
      );
      if (!patchedRes.ok) throw new Error("Failed to load patch file");
      const patchedData = await patchedRes.json();
      const patchedContent = unescapeHtml(patchedData.content || "");

      // Update tab with loaded content
      const activeIndex = PatchBufferState.getActiveIndex();
      PatchBufferState.updateTabContent(
        activeIndex,
        originalContent,
        patchedContent
      );

      // Render diff
      renderDiff(originalContent, patchedContent);
    } catch (err) {
      console.error("[PatchBuffer] Failed to load patch content:", err);
      showToast("Failed to load patch content", "error");
    }
  }

  async function activateTab(index) {
    PatchBufferState.setActiveIndex(index);
    renderTabs();
    updateContextBar();

    const activeTab = PatchBufferState.getActiveTab();
    if (activeTab) {
      // Load content if not already loaded
      if (!activeTab.originalContent || !activeTab.patchedContent) {
        await loadPatchContent(activeTab);
      } else {
        renderDiff(activeTab.originalContent, activeTab.patchedContent);
      }
    }
  }

  async function approveActivePatch() {
    const activeTab = PatchBufferState.getActiveTab();
    if (!activeTab) return;

    const sessionId = PatchBufferState.getSessionId();
    if (!sessionId) return;

    try {
      const res = await fetch(
        "/sessions/" + sessionId + "/patches/approve",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalPath: activeTab.originalPath,
          }),
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to approve patch");
      }

      const result = await res.json();
      const fileName = activeTab.originalPath.split("/").pop();
      const sourceBufferId = activeTab.sourceBufferId;
      
      if (result.sent) {
        showToast("Sent to agent — " + fileName, "success");
      } else {
        showToast("Approved — " + fileName, "success");
      }

      // Remove tab and refresh
      const activeIndex = PatchBufferState.getActiveIndex();
      PatchBufferState.removeTab(activeIndex);
      renderTabs();
      updateContextBar();

      // Re-render if there's another active tab
      const newActiveTab = PatchBufferState.getActiveTab();
      if (newActiveTab && newActiveTab.originalContent) {
        renderDiff(newActiveTab.originalContent, newActiveTab.patchedContent);
      } else if (!newActiveTab && sourceBufferId) {
        var invokerTab = document.querySelector('.frame-tab[data-frame-id="left"][data-buffer-id="' + sourceBufferId + '"]');
        if (invokerTab) invokerTab.click();
      }
    } catch (err) {
      console.error("[PatchBuffer] Failed to approve patch:", err);
      showToast(err.message || "Failed to approve patch", "error");
    }
  }

  async function declinePatch(index) {
    const tabs = PatchBufferState.getAllTabs();
    if (index < 0 || index >= tabs.length) return;

    const tab = tabs[index];
    const sessionId = PatchBufferState.getSessionId();
    if (!sessionId) return;

    try {
      const res = await fetch("/sessions/" + sessionId + "/patches", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patchPath: tab.patchPath }),
      });

      if (!res.ok) throw new Error("Failed to decline patch");

      const fileName = tab.originalPath.split("/").pop();
      const sourceBufferId = tab.sourceBufferId;
      showToast("Declined — " + fileName, "success");

      // Remove tab
      const wasActive = PatchBufferState.getActiveIndex() === index;
      PatchBufferState.removeTab(index);

      // If we removed the active tab, activate another
      if (wasActive) {
        renderTabs();
        updateContextBar();
        const newActiveTab = PatchBufferState.getActiveTab();
        if (newActiveTab && newActiveTab.originalContent) {
          renderDiff(newActiveTab.originalContent, newActiveTab.patchedContent);
        } else if (!newActiveTab && sourceBufferId) {
          var invokerTab = document.querySelector('.frame-tab[data-frame-id="left"][data-buffer-id="' + sourceBufferId + '"]');
          if (invokerTab) invokerTab.click();
        }
      } else {
        renderTabs();
      }
    } catch (err) {
      console.error("[PatchBuffer] Failed to decline patch:", err);
      showToast("Failed to decline patch", "error");
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function addPatch({ sessionId, originalPath, patchPath, sourceBufferId }) {
    // Initialize session ID on first call
    if (!PatchBufferState.getSessionId()) {
      PatchBufferState.setSessionId(sessionId);
    }

    // Add or update tab
    PatchBufferState.addTab({
      sessionId,
      originalPath,
      patchPath,
      sourceBufferId: sourceBufferId || null,
      originalContent: null,
      patchedContent: null,
    });

    // Render UI
    renderTabs();
    updateContextBar();

    // Activate and load content
    activateTab(PatchBufferState.getActiveIndex());
  }

  function approveCurrentPatch() {
    approveActivePatch();
  }

  function declineCurrentPatch() {
    const activeIndex = PatchBufferState.getActiveIndex();
    if (activeIndex >= 0) {
      declinePatch(activeIndex);
    }
  }

  function init(sessionId) {
    PatchBufferState.setSessionId(sessionId);

    // Add button event listeners
    const approveBtn = document.getElementById("patch-approve-btn");
    const declineBtn = document.getElementById("patch-decline-btn");

    if (approveBtn) {
      approveBtn.addEventListener("click", approveActivePatch);
    }

    if (declineBtn) {
      declineBtn.addEventListener("click", function () {
        declineCurrentPatch();
      });
    }
  }

  // Expose global API
  window.MIMO_PATCH_BUFFER = {
    addPatch,
    approve: approveCurrentPatch,
    decline: declineCurrentPatch,
    showStaleWarning,
    init,
  };

  // Auto-initialize if container exists
  document.addEventListener("DOMContentLoaded", function () {
    const container = document.getElementById("patch-buffer-container");
    if (container) {
      const sessionId = container.getAttribute("data-session-id");
      if (sessionId) {
        init(sessionId);
      }
    }
  });
})();