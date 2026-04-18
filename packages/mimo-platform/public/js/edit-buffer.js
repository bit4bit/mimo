"use strict";

(function () {
  // ── State ────────────────────────────────────────────────────────────────────

  const EditBufferState = (function () {
    let openFiles = [];
    let activeIndex = 0;

    function storageKey(sessionId) {
      return "mimo:edit-buffer:" + sessionId;
    }

    // Compute MD5 checksum of content (simple hash for browser)
    function computeChecksum(content) {
      // Simple string hash for browser compatibility
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16);
    }

    function persist(sessionId) {
      if (!sessionId) return;
      try {
        var active = openFiles[activeIndex];
        var data = {
          openPaths: openFiles.map(function (f) { return f.path; }),
          activePath: active ? active.path : null,
        };
        localStorage.setItem(storageKey(sessionId), JSON.stringify(data));
      } catch (e) {
        // localStorage unavailable — ignore
      }
    }

    return {
      getAll: function () { return openFiles; },
      getActive: function () { return openFiles[activeIndex] ?? null; },
      getActiveIndex: function () { return activeIndex; },
      add: function (file, sessionId) {
        const existing = openFiles.findIndex(function (f) { return f.path === file.path; });
        if (existing !== -1) {
          activeIndex = existing;
          persist(sessionId);
          return;
        }
        // Add checksum and isOutdated fields
        file.contentChecksum = computeChecksum(file.content);
        file.isOutdated = false;
        openFiles.push(file);
        activeIndex = openFiles.length - 1;
        persist(sessionId);
      },
      remove: function (path, sessionId) {
        const i = openFiles.findIndex(function (f) { return f.path === path; });
        if (i === -1) return;
        openFiles.splice(i, 1);
        activeIndex = Math.min(activeIndex, Math.max(0, openFiles.length - 1));
        persist(sessionId);
      },
      switchFile: function (dir, sessionId) {
        if (!openFiles.length) return;
        if (dir === "right") {
          activeIndex = (activeIndex + 1) % openFiles.length;
        } else {
          activeIndex = (activeIndex - 1 + openFiles.length) % openFiles.length;
        }
        persist(sessionId);
      },
      setActive: function (path, sessionId) {
        const i = openFiles.findIndex(function (f) { return f.path === path; });
        if (i !== -1) {
          activeIndex = i;
          persist(sessionId);
        }
      },
      setScrollPosition: function (path, pos) {
        const f = openFiles.find(function (f) { return f.path === path; });
        if (f) f.scrollPosition = pos;
      },
      markOutdated: function (path) {
        const f = openFiles.find(function (f) { return f.path === path; });
        if (f) {
          f.isOutdated = true;
        }
      },
      clearOutdated: function (path) {
        const f = openFiles.find(function (f) { return f.path === path; });
        if (f) {
          f.isOutdated = false;
        }
      },
      reloadFile: function (path, sessionId, newContent) {
        const f = openFiles.find(function (f) { return f.path === path; });
        if (f) {
          f.content = newContent;
          f.contentChecksum = computeChecksum(newContent);
          f.lineCount = newContent.split("\n").length;
          f.isOutdated = false;
          persist(sessionId);
        }
      },
      getChecksum: function (path) {
        const f = openFiles.find(function (f) { return f.path === path; });
        return f ? f.contentChecksum : null;
      },
      loadStored: function (sessionId) {
        try {
          var raw = localStorage.getItem(storageKey(sessionId));
          if (!raw) return null;
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      },
    };
  })();

  // ── File Finder ──────────────────────────────────────────────────────────────

  let allFiles = [];
  let filteredFiles = [];
  let selectedResultIndex = 0;
  let fileFinderLoaded = false;

  function getSessionId() {
    const el = document.getElementById("edit-buffer-container");
    return el ? el.getAttribute("data-session-id") : null;
  }

  function isFileFinderOpen() {
    const dialog = document.getElementById("file-finder-dialog");
    return dialog && dialog.style.display !== "none";
  }

  function openFileFinder() {
    const dialog = document.getElementById("file-finder-dialog");
    if (!dialog) return false;
    dialog.style.display = "flex";
    const input = document.getElementById("file-finder-input");
    if (input) {
      input.value = "";
      input.focus();
    }
    if (!fileFinderLoaded) {
      loadFileList("");
    } else {
      renderResults(allFiles);
    }
    return true;
  }

  function closeFileFinder() {
    const dialog = document.getElementById("file-finder-dialog");
    if (!dialog) return false;
    dialog.style.display = "none";
    return true;
  }

  function loadFileList(pattern) {
    const sessionId = getSessionId();
    if (!sessionId) return;
    const url = "/sessions/" + sessionId + "/files" + (pattern ? "?pattern=" + encodeURIComponent(pattern) : "");
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (files) {
        allFiles = files;
        fileFinderLoaded = true;
        filterResults(pattern);
      })
      .catch(function () {
        const resultsEl = document.getElementById("file-finder-results");
        if (resultsEl) resultsEl.innerHTML = '<div style="color:#ff6b6b;padding:8px;font-size:12px;">Failed to load files.</div>';
      });
  }

  function filterResults(pattern) {
    const pat = (pattern || "").toLowerCase().trim();
    filteredFiles = pat
      ? allFiles.filter(function (f) { return f.path.toLowerCase().includes(pat); })
      : allFiles.slice();
    selectedResultIndex = 0;
    renderResults(filteredFiles);
  }

  function renderResults(files) {
    const resultsEl = document.getElementById("file-finder-results");
    if (!resultsEl) return;
    if (!files.length) {
      resultsEl.innerHTML = '<div style="color:#888;padding:8px;font-size:12px;">No files found.</div>';
      return;
    }
    const MAX = 50;
    const shown = files.slice(0, MAX);
    resultsEl.innerHTML = shown.map(function (f, i) {
      const active = i === selectedResultIndex;
      return '<div class="file-finder-result" data-path="' + escapeAttr(f.path) + '" data-index="' + i + '" style="padding:7px 10px;cursor:pointer;font-family:monospace;font-size:12px;background:' + (active ? "#3a3a5a" : "transparent") + ';color:' + (active ? "#d4d4d4" : "#aaa") + ';">' +
        '<span style="color:' + (active ? "#d4d4d4" : "#ccc") + ';">' + escapeHtml(f.name) + '</span>' +
        '<span style="color:#666;margin-left:8px;font-size:11px;">' + escapeHtml(f.path) + '</span>' +
        '</div>';
    }).join("");

    resultsEl.querySelectorAll(".file-finder-result").forEach(function (el) {
      el.addEventListener("mousedown", function (e) {
        e.preventDefault();
        const path = el.getAttribute("data-path");
        const file = files.find(function (f) { return f.path === path; });
        if (file) selectFile(file);
      });
      el.addEventListener("mouseenter", function () {
        const idx = parseInt(el.getAttribute("data-index"), 10);
        selectedResultIndex = idx;
        renderResults(filteredFiles);
      });
    });
  }

  function navigateResults(dir) {
    if (!filteredFiles.length) return;
    if (dir === "down") {
      selectedResultIndex = (selectedResultIndex + 1) % filteredFiles.length;
    } else {
      selectedResultIndex = (selectedResultIndex - 1 + filteredFiles.length) % filteredFiles.length;
    }
    renderResults(filteredFiles);
    scrollResultIntoView();
  }

  function scrollResultIntoView() {
    const resultsEl = document.getElementById("file-finder-results");
    if (!resultsEl) return;
    const active = resultsEl.querySelector('[data-index="' + selectedResultIndex + '"]');
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function confirmSelection() {
    const file = filteredFiles[selectedResultIndex];
    if (file) selectFile(file);
  }

  function fetchAndAddFile(sessionId, path, callback) {
    fetch("/sessions/" + sessionId + "/files/content?path=" + encodeURIComponent(path))
      .then(function (r) {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(function (data) {
        EditBufferState.add({
          path: data.path,
          name: data.name,
          language: data.language,
          lineCount: data.lineCount,
          content: data.content,
          scrollPosition: 0,
        }, sessionId);
        // Notify server to watch this file
        notifyWatchFile(sessionId, {
          path: data.path,
          contentChecksum: EditBufferState.getChecksum(data.path)
        });
        if (callback) callback();
      })
      .catch(function () { /* file gone — skip */ });
  }

  function selectFile(fileInfo) {
    closeFileFinder();
    const sessionId = getSessionId();
    if (!sessionId) return;
    fetchAndAddFile(sessionId, fileInfo.path, function () {
      renderEditBuffer();
      // Switch to the Files buffer so the opened file is visible
      var filesTab = document.querySelector('.frame-tab[data-frame-id="left"][data-buffer-id="edit"]');
      if (filesTab) filesTab.click();
    });
  }

  // ── Edit Buffer Rendering ────────────────────────────────────────────────────

  function renderEditBuffer() {
    renderTabs();
    renderContextBar();
    renderContent();
  }

  function renderTabs() {
    const tabsEl = document.getElementById("edit-buffer-tabs");
    if (!tabsEl) return;

    // Remove existing dynamic tabs (all except the "+ Open File" button)
    const openBtn = document.getElementById("open-file-finder-btn");
    tabsEl.innerHTML = "";

    const files = EditBufferState.getAll();
    const active = EditBufferState.getActive();

    files.forEach(function (file) {
      const isActive = active && file.path === active.path;
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "edit-file-tab" + (isActive ? " active" : "");
      tab.setAttribute("data-file-path", file.path);
      tab.style.cssText = "padding:8px 16px;border:none;border-right:1px solid #444;background:" + (isActive ? "#1a1a1a" : "transparent") + ";color:" + (isActive ? "#d4d4d4" : "#888") + ";cursor:pointer;font-family:monospace;font-size:12px;white-space:nowrap;";
      tab.title = file.path;
      tab.textContent = getFileIcon(file.language) + " " + file.name;
      tab.addEventListener("click", function () {
        EditBufferState.setActive(file.path, getSessionId());
        renderEditBuffer();
      });
      tabsEl.appendChild(tab);
    });

    if (openBtn) {
      tabsEl.appendChild(openBtn);
    } else {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "open-file-finder-btn";
      btn.style.cssText = "padding:8px 12px;border:none;border-right:1px solid #444;background:transparent;color:#888;cursor:pointer;font-family:monospace;font-size:12px;white-space:nowrap;flex-shrink:0;";
      btn.title = "Open file (Mod+Shift+F)";
      btn.textContent = "+ Open File";
      btn.addEventListener("click", openFileFinder);
      tabsEl.appendChild(btn);
    }
  }

  function renderContextBar() {
    const ctx = document.getElementById("edit-buffer-context");
    if (!ctx) return;
    const active = EditBufferState.getActive();
    if (!active) {
      ctx.style.display = "none";
      return;
    }
    ctx.style.display = "flex";
    const pathEl = document.getElementById("edit-buffer-filepath");
    const linesEl = document.getElementById("edit-buffer-linecount");
    const langEl = document.getElementById("edit-buffer-language");
    const outdatedEl = document.getElementById("edit-buffer-outdated-indicator");
    const reloadBtn = document.getElementById("reload-file-btn");
    
    if (pathEl) pathEl.textContent = active.path;
    if (linesEl) linesEl.textContent = "Lines: " + active.lineCount;
    if (langEl) langEl.textContent = active.language;
    
    // Show/hide outdated indicator and reload button
    if (outdatedEl) {
      outdatedEl.style.display = active.isOutdated ? "inline" : "none";
    }
    if (reloadBtn) {
      reloadBtn.style.display = active.isOutdated ? "inline-block" : "none";
    }
  }

  function renderContent() {
    const emptyEl = document.getElementById("edit-buffer-empty");
    const linesTable = document.getElementById("edit-buffer-lines");
    const linesBody = document.getElementById("edit-buffer-lines-body");
    if (!emptyEl || !linesTable || !linesBody) return;

    const active = EditBufferState.getActive();
    if (!active) {
      emptyEl.style.display = "block";
      linesTable.style.display = "none";
      return;
    }

    emptyEl.style.display = "none";
    linesTable.style.display = "table";

    const lines = active.content.split("\n");
    linesBody.innerHTML = lines.map(function (line, i) {
      return '<tr><td style="padding:0 12px 0 8px;color:#555;text-align:right;user-select:none;font-size:12px;min-width:40px;">' + (i + 1) + '</td><td style="padding:0 8px;white-space:pre;"><code class="language-' + escapeAttr(active.language) + '">' + line + '</code></td></tr>';
    }).join("");

    // Run highlight.js if available (client-side)
    requestAnimationFrame(function () {
      if (typeof window !== "undefined" && window.hljs) {
        linesBody.querySelectorAll("code").forEach(function (el) {
          window.hljs.highlightElement(el);
        });
      }
    });

    // Restore scroll
    const contentEl = document.getElementById("edit-buffer-content");
    if (contentEl && active.scrollPosition) {
      contentEl.scrollTop = active.scrollPosition;
    }
  }

  function closeCurrentFile() {
    const active = EditBufferState.getActive();
    if (!active) return false;
    const sessionId = getSessionId();
    // Unwatch the file before closing
    notifyUnwatchFile(sessionId, active.path);
    EditBufferState.remove(active.path, sessionId);
    renderEditBuffer();
    return true;
  }

  function switchFile(dir) {
    if (EditBufferState.getAll().length <= 1) return false;
    const sessionId = getSessionId();
    // Save scroll position of current file before switching
    const current = EditBufferState.getActive();
    if (current) {
      const contentEl = document.getElementById("edit-buffer-content");
      if (contentEl) EditBufferState.setScrollPosition(current.path, contentEl.scrollTop);
    }
    EditBufferState.switchFile(dir, sessionId);
    renderEditBuffer();
    return true;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getFileIcon(language) {
    const icons = { typescript: "TS", javascript: "JS", python: "PY", rust: "RS", go: "GO", json: "{}",  markdown: "MD", html: "HT", css: "CS" };
    return icons[language] || "[]";
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(text) {
    return String(text).replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // ── Scroll in content area ───────────────────────────────────────────────────

  function scrollContent(dir) {
    const contentEl = document.getElementById("edit-buffer-content");
    if (!contentEl) return false;
    const amount = dir === "up" ? -contentEl.clientHeight * 0.9 : contentEl.clientHeight * 0.9;
    contentEl.scrollBy({ top: amount, behavior: "smooth" });
    return true;
  }

  // ── File Reload ───────────────────────────────────────────────────────────────

  function reloadCurrentFile() {
    const active = EditBufferState.getActive();
    if (!active || !active.isOutdated) return false;

    const sessionId = getSessionId();
    if (!sessionId) return false;

    // Save scroll position before reload
    const contentEl = document.getElementById("edit-buffer-content");
    if (contentEl) {
      EditBufferState.setScrollPosition(active.path, contentEl.scrollTop);
    }

    // Fetch fresh content
    fetch("/sessions/" + sessionId + "/files/content?path=" + encodeURIComponent(active.path))
      .then(function (r) {
        if (!r.ok) throw new Error("Failed to reload file");
        return r.json();
      })
      .then(function (data) {
        // Update file content and clear outdated flag
        EditBufferState.reloadFile(active.path, sessionId, data.content);
        renderEditBuffer();

        // Notify server of new checksum
        notifyWatchFile(sessionId, {
          path: active.path,
          contentChecksum: EditBufferState.getChecksum(active.path)
        });
      })
      .catch(function (err) {
        console.error("Failed to reload file:", err);
      });

    return true;
  }

  // ── WebSocket File Watching ───────────────────────────────────────────────────

  let fileWatchSocket = null;
  let fileWatchReconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;

  function initFileWatchWebSocket() {
    const sessionId = getSessionId();
    if (!sessionId) {
      console.log("[FileWatcher] No session ID available, retrying in 1s...");
      setTimeout(initFileWatchWebSocket, 1000);
      return;
    }

    // Prevent multiple connections
    if (fileWatchSocket && fileWatchSocket.readyState === WebSocket.OPEN) {
      console.log("[FileWatcher] Already connected");
      return;
    }

    // Determine WebSocket URL
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = protocol + "//" + window.location.host + "/ws/files/" + sessionId;

    console.log("[FileWatcher] Connecting to:", wsUrl);

    try {
      fileWatchSocket = new WebSocket(wsUrl);
    } catch (err) {
      console.error("[FileWatcher] Failed to create WebSocket:", err);
      return;
    }

    fileWatchSocket.onopen = function () {
      console.log("[FileWatcher] Connected successfully");
      fileWatchReconnectAttempts = 0;
      
      // Watch all currently open files
      const files = EditBufferState.getAll();
      console.log("[FileWatcher] Watching", files.length, "files");
      files.forEach(function (file) {
        notifyWatchFile(sessionId, file);
      });
    };

    fileWatchSocket.onmessage = function (event) {
      console.log("[FileWatcher] Received message:", event.data);
      try {
        const data = JSON.parse(event.data);
        if (data.type === "file_outdated") {
          EditBufferState.markOutdated(data.path);
          renderEditBuffer();
        } else if (data.type === "file_deleted") {
          EditBufferState.markOutdated(data.path);
          renderEditBuffer();
        } else if (data.type === "error") {
          console.error("[FileWatcher] Server error:", data.error);
        }
      } catch (err) {
        console.error("[FileWatcher] Failed to parse message:", err);
      }
    };

    fileWatchSocket.onerror = function (error) {
      console.error("[FileWatcher] WebSocket error:", error);
    };

    fileWatchSocket.onclose = function (event) {
      console.log("[FileWatcher] Disconnected:", event.code, event.reason);
      fileWatchSocket = null;
      
      // Attempt to reconnect with backoff
      if (fileWatchReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        fileWatchReconnectAttempts++;
        const delay = Math.min(3000 * fileWatchReconnectAttempts, 15000);
        console.log(`[FileWatcher] Reconnecting in ${delay}ms (attempt ${fileWatchReconnectAttempts})`);
        setTimeout(initFileWatchWebSocket, delay);
      } else {
        console.log("[FileWatcher] Max reconnect attempts reached, giving up");
      }
    };

    // Store reference for external access (will be available after init)
    if (typeof window.EditBuffer !== 'undefined') {
      window.EditBuffer.ws = fileWatchSocket;
    }
  }

  function notifyWatchFile(sessionId, file) {
    if (!fileWatchSocket) {
      console.log("[FileWatcher] Cannot notify - socket not initialized");
      return;
    }
    if (fileWatchSocket.readyState !== WebSocket.OPEN) {
      console.log("[FileWatcher] Cannot notify - socket not open (state:", fileWatchSocket.readyState + ")");
      return;
    }
    
    const checksum = file.contentChecksum || EditBufferState.getChecksum(file.path);
    console.log("[FileWatcher] Sending watch_file for:", file.path, "checksum:", checksum);
    
    fileWatchSocket.send(JSON.stringify({
      type: "watch_file",
      path: file.path,
      checksum: checksum
    }));
  }

  function notifyUnwatchFile(sessionId, filePath) {
    if (fileWatchSocket && fileWatchSocket.readyState === WebSocket.OPEN) {
      fileWatchSocket.send(JSON.stringify({
        type: "unwatch_file",
        path: filePath
      }));
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function init() {
    // Expose for session-keybindings.js FIRST
    window.EditBuffer = {
      openFileFinder: openFileFinder,
      closeFileFinder: closeFileFinder,
      isFileFinderOpen: isFileFinderOpen,
      closeCurrentFile: closeCurrentFile,
      switchFile: switchFile,
      scrollContent: scrollContent,
      reloadCurrentFile: reloadCurrentFile,
      ws: null,
    };

    // Wire "Open File" button
    const openBtn = document.getElementById("open-file-finder-btn");
    if (openBtn) openBtn.addEventListener("click", openFileFinder);

    // Wire "Reload File" button
    const reloadBtn = document.getElementById("reload-file-btn");
    if (reloadBtn) reloadBtn.addEventListener("click", reloadCurrentFile);

    // Wire "Close File" button
    const closeBtn = document.getElementById("close-file-btn");
    if (closeBtn) closeBtn.addEventListener("click", closeCurrentFile);

    // Wire file finder input
    const input = document.getElementById("file-finder-input");
    if (input) {
      input.addEventListener("input", function () {
        filterResults(input.value);
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); navigateResults("down"); }
        else if (e.key === "ArrowUp") { e.preventDefault(); navigateResults("up"); }
        else if (e.key === "Enter") { e.preventDefault(); confirmSelection(); }
        else if (e.key === "Escape") { e.preventDefault(); closeFileFinder(); }
      });
    }

    // Close dialog when clicking outside modal content
    const dialog = document.getElementById("file-finder-dialog");
    if (dialog) {
      dialog.addEventListener("mousedown", function (e) {
        if (e.target === dialog) closeFileFinder();
      });
    }

    // Save scroll on scroll
    const contentEl = document.getElementById("edit-buffer-content");
    if (contentEl) {
      contentEl.addEventListener("scroll", function () {
        const active = EditBufferState.getActive();
        if (active) EditBufferState.setScrollPosition(active.path, contentEl.scrollTop);
      });
    }

    // Initialize file watching WebSocket (after window.EditBuffer is defined)
    initFileWatchWebSocket();

    // Restore previously open files from localStorage
    var sessionId = getSessionId();
    if (sessionId) {
      var stored = EditBufferState.loadStored(sessionId);
      if (stored && Array.isArray(stored.openPaths) && stored.openPaths.length > 0) {
        var paths = stored.openPaths.slice();
        var activePath = stored.activePath;
        var loaded = 0;
        paths.forEach(function (path) {
          fetchAndAddFile(sessionId, path, function () {
            loaded++;
            if (loaded === paths.length) {
              // All files restored — set active and render
              if (activePath) {
                EditBufferState.setActive(activePath, sessionId);
              }
              renderEditBuffer();
            }
          });
        });
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
