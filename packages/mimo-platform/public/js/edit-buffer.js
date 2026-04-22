// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

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
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16);
    }

    function normalizePath(path) {
      if (!path) return "";
      return String(path)
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/\/+/g, "/");
    }

    function pathsMatch(a, b) {
      const ap = normalizePath(a);
      const bp = normalizePath(b);
      if (!ap || !bp) return false;
      if (ap === bp) return true;
      return ap.endsWith("/" + bp) || bp.endsWith("/" + ap);
    }

    function persist(sessionId) {
      if (!sessionId) return;
      try {
        var active = openFiles[activeIndex];
        var data = {
          openPaths: openFiles.map(function (f) {
            return f.path;
          }),
          activePath: active ? active.path : null,
        };
        localStorage.setItem(storageKey(sessionId), JSON.stringify(data));
      } catch (e) {
        // localStorage unavailable — ignore
      }
    }

    return {
      getAll: function () {
        return openFiles;
      },
      getActive: function () {
        return openFiles[activeIndex] ?? null;
      },
      getActiveIndex: function () {
        return activeIndex;
      },
      add: function (file, sessionId) {
        const existing = openFiles.findIndex(function (f) {
          return f.path === file.path;
        });
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
        const i = openFiles.findIndex(function (f) {
          return f.path === path;
        });
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
        const i = openFiles.findIndex(function (f) {
          return f.path === path;
        });
        if (i !== -1) {
          activeIndex = i;
          persist(sessionId);
        }
      },
      setScrollPosition: function (path, pos) {
        const f = openFiles.find(function (f) {
          return f.path === path;
        });
        if (f) f.scrollPosition = pos;
      },
      markOutdated: function (path) {
        const f = openFiles.find(function (f) {
          return pathsMatch(f.path, path);
        });
        if (f) {
          f.isOutdated = true;
        }
      },
      clearOutdated: function (path) {
        const f = openFiles.find(function (f) {
          return f.path === path;
        });
        if (f) {
          f.isOutdated = false;
        }
      },
      reloadFile: function (path, sessionId, newContent) {
        const f = openFiles.find(function (f) {
          return f.path === path;
        });
        if (f) {
          f.content = newContent;
          f.contentChecksum = computeChecksum(newContent);
          f.lineCount = newContent.split("\n").length;
          f.isOutdated = false;
          persist(sessionId);
        }
      },
      getChecksum: function (path) {
        const f = openFiles.find(function (f) {
          return pathsMatch(f.path, path);
        });
        return f ? f.contentChecksum : null;
      },
      matchesPath: function (a, b) {
        return pathsMatch(a, b);
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

  // ── Expert Mode ───────────────────────────────────────────────────────────────

  const ExpertMode = (function () {
    const EXPERT_STORAGE_KEY = "mimo:edit-buffer-expert:";

    function storageKey(sessionId) {
      return EXPERT_STORAGE_KEY + sessionId;
    }

    function getInitialState() {
      return {
        enabled: false,
        state: "off", // "off" | "idle" | "processing"
        inputVisible: false,
        originalPath: null,
        originalContent: null, // cleared after patch is dispatched
        instruction: "",
        focusRange: "1-1",
        focusGuideSize: 5, // default 5, min 1
        focusStartLine: null, // null means auto-center based on viewport
        chatThreadId: null,
      };
    }

    let state = getInitialState();

    function persist(sessionId) {
      if (!sessionId) return;
      try {
        localStorage.setItem(
          storageKey(sessionId),
          JSON.stringify({ enabled: state.enabled }),
        );
      } catch (e) {}
    }

    function loadPersisted(sessionId) {
      try {
        var raw = localStorage.getItem(storageKey(sessionId));
        if (raw) {
          var data = JSON.parse(raw);
          if (data.enabled) {
            state.enabled = true;
            state.state = "idle";
          }
        }
      } catch (e) {}
    }

    function getActiveFilePath() {
      const active = EditBufferState.getActive();
      return active ? active.path : null;
    }

    function getActiveThreadId() {
      if (state.chatThreadId) return state.chatThreadId;
      if (
        window.MIMO_CHAT_THREADS &&
        typeof window.MIMO_CHAT_THREADS.getActiveThreadId === "function"
      ) {
        return window.MIMO_CHAT_THREADS.getActiveThreadId();
      }
      return null;
    }

    function updateUI() {
      const toggleBtn = document.getElementById("expert-mode-toggle");
      const threadSelect = document.getElementById("expert-thread-select");
      const focusGuide = document.getElementById("expert-focus-guide");
      const inputContainer = document.getElementById(
        "expert-instruction-input",
      );
      const threadName = document.getElementById("expert-thread-name");

      const hasActiveFile = !!getActiveFilePath();
      const showExpert = state.enabled && hasActiveFile;

      if (toggleBtn)
        toggleBtn.style.display = showExpert ? "inline-flex" : "none";
      if (focusGuide)
        focusGuide.style.display =
          state.enabled && state.state !== "off" ? "block" : "none";
      if (inputContainer)
        inputContainer.style.display =
          state.enabled && state.state === "idle" && state.inputVisible
            ? "block"
            : "none";

      // Show thread selector in context bar when expert mode is enabled
      if (threadSelect) {
        if (showExpert) {
          threadSelect.style.display = "inline-block";
          populateThreadSelector(threadSelect);
        } else {
          threadSelect.style.display = "none";
        }
      }

      if (state.enabled && state.state !== "off") {
        const tid = state.chatThreadId || getActiveThreadId();
        if (threadName) {
          if (tid) {
            const threads =
              window.MIMO_CHAT_THREADS && window.MIMO_CHAT_THREADS.threads
                ? window.MIMO_CHAT_THREADS.threads
                : [];
            const t = threads.find(function (th) {
              return th.id === tid;
            });
            threadName.textContent = t ? t.name : tid.slice(0, 8);
          } else {
            threadName.textContent = "No thread selected";
          }
          threadName.style.display = "inline-block";
        }
      } else if (threadName) {
        threadName.style.display = "none";
      }

      if (state.enabled && state.state === "processing") {
        showExpertStatus("Processing...");
        const cancelBtn = document.getElementById("expert-cancel-btn");
        if (cancelBtn) cancelBtn.style.display = "inline-flex";
      } else {
        clearExpertStatus();
        const cancelBtn = document.getElementById("expert-cancel-btn");
        if (cancelBtn) cancelBtn.style.display = "none";
      }
    }

    function populateThreadSelector(selectEl) {
      if (!selectEl) return;
      const currentId =
        state.chatThreadId ||
        (window.MIMO_CHAT_THREADS &&
        typeof window.MIMO_CHAT_THREADS.getActiveThreadId === "function"
          ? window.MIMO_CHAT_THREADS.getActiveThreadId()
          : null);
      const threads =
        window.MIMO_CHAT_THREADS && window.MIMO_CHAT_THREADS.threads
          ? window.MIMO_CHAT_THREADS.threads
          : [];

      selectEl.innerHTML = '<option value="">Select thread...</option>';
      threads.forEach(function (t) {
        const details = [t.model || "", t.mode || ""]
          .filter(Boolean)
          .join(" / ");
        const label = t.name + (details ? " (" + details + ")" : "");
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = label;
        if (t.id === currentId) {
          opt.selected = true;
          if (!state.chatThreadId) state.chatThreadId = t.id;
        }
        selectEl.appendChild(opt);
      });
    }

    function showExpertStatus(msg) {
      const badge = document.getElementById("expert-status-badge");
      if (badge) {
        badge.textContent = msg;
        badge.style.display = "inline";
      }
    }

    function clearExpertStatus() {
      const badge = document.getElementById("expert-status-badge");
      if (badge) badge.style.display = "none";
    }

    function showExternalModifyWarning() {
      if (state.state !== "processing" || !state.originalPath) return;

      let el = document.getElementById("expert-external-warning");
      if (!el) {
        el = document.createElement("div");
        el.id = "expert-external-warning";
        el.style.cssText =
          "position:absolute;top:10px;left:50%;transform:translateX(-50%);background:#ff9800;color:#000;padding:8px 16px;border-radius:4px;font-size:13px;z-index:1000;font-weight:500;";
        document.getElementById("edit-buffer-container").appendChild(el);
      }
      el.textContent =
        "The original file has been modified externally. The patch may be stale.";
      el.style.display = "block";
    }

    function clearExternalModifyWarning() {
      const el = document.getElementById("expert-external-warning");
      if (el) el.style.display = "none";
    }

    function computeFocusGuide(firstVisibleLine, lastVisibleLine, lineCount) {
      // If focusStartLine is explicitly set (not null), use it directly
      // Otherwise center on viewport
      let start;

      if (state.focusStartLine !== null) {
        // Use explicit start line, but clamp to valid range
        start = Math.max(
          1,
          Math.min(state.focusStartLine, lineCount || state.focusStartLine),
        );
      } else {
        // Auto-center based on viewport
        const center = Math.floor((firstVisibleLine + lastVisibleLine) / 2);
        const half = Math.floor(state.focusGuideSize / 2);
        start = Math.max(1, center - half);
      }

      // Calculate end based on start and size
      let end = start + state.focusGuideSize - 1;

      // Clamp end to line count, but allow focusing the last line
      if (lineCount && end > lineCount) {
        // If size exceeds remaining lines, we could shift start back
        // to show full size, or just clamp at lineCount
        // For now, clamp to line count to ensure last line is focusable
        end = lineCount;
      }

      return { start, end, lines: state.focusGuideSize };
    }

    function getVisibleLineRange(contentEl) {
      const rows = document.querySelectorAll(
        "#edit-buffer-lines-body tr[data-line-number]",
      );
      if (!rows || rows.length === 0) return null;

      const viewport = contentEl.getBoundingClientRect();
      let first = null;
      let last = null;

      rows.forEach(function (row) {
        const rect = row.getBoundingClientRect();
        const isVisible =
          rect.bottom >= viewport.top && rect.top <= viewport.bottom;
        if (!isVisible) return;

        const lineNumber = parseInt(row.getAttribute("data-line-number"), 10);
        if (Number.isNaN(lineNumber)) return;

        if (first === null || lineNumber < first) first = lineNumber;
        if (last === null || lineNumber > last) last = lineNumber;
      });

      if (first === null || last === null) return null;
      return { first, last };
    }

    function renderFocusGuide() {
      const container = document.getElementById("expert-focus-guide");
      if (!container) return;
      const content = document.getElementById("edit-buffer-content");
      if (!content) return;

      const activeFile = EditBufferState.getActive();
      const lineCount = activeFile ? activeFile.lineCount : 1;
      const visible = getVisibleLineRange(content);

      let firstVisibleLine;
      let lastVisibleLine;
      let lineHeight = 20;

      if (visible) {
        firstVisibleLine = visible.first;
        lastVisibleLine = visible.last;
      } else {
        const scrollTop = content.scrollTop;
        firstVisibleLine = Math.floor(scrollTop / lineHeight) + 1;
        const visibleLines = Math.ceil(content.clientHeight / lineHeight);
        lastVisibleLine = firstVisibleLine + visibleLines - 1;
      }

      const guide = computeFocusGuide(
        firstVisibleLine,
        lastVisibleLine,
        lineCount,
      );

      // Store current focus range for expert instruction
      state.focusRange = guide.start + "-" + guide.end;

      container.innerHTML = "";
      const rows = document.querySelectorAll(
        "#edit-buffer-lines-body tr[data-line-number]",
      );
      const rowsByLine = new Map();
      rows.forEach(function (row) {
        const line = parseInt(row.getAttribute("data-line-number"), 10);
        if (!Number.isNaN(line)) {
          rowsByLine.set(line, row);
        }
      });

      // Create a single rounded rectangle for the entire focus area
      const firstRow = rowsByLine.get(guide.start);
      const lastRow = rowsByLine.get(Math.min(guide.end, lineCount));

      if (firstRow) {
        const focusRect = document.createElement("div");
        focusRect.className = "focus-guide-rect";

        const firstTop = firstRow.offsetTop;
        const lastBottom = lastRow
          ? lastRow.offsetTop + lastRow.offsetHeight
          : firstTop + lineHeight * (guide.end - guide.start + 1);
        const totalHeight = lastBottom - firstTop;

        // Use the actual row height for consistency
        lineHeight = firstRow.offsetHeight || lineHeight;

        focusRect.style.cssText =
          "position:absolute;" +
          "left:4px;" +
          "right:4px;" +
          "top:" +
          firstTop +
          "px;" +
          "height:" +
          totalHeight +
          "px;" +
          "background:rgba(76, 175, 80, 0.12);" +
          "border:1px solid rgba(76, 175, 80, 0.4);" +
          "border-radius:6px;" +
          "pointer-events:none;" +
          "z-index:10;";

        container.appendChild(focusRect);
      }
    }

    function increaseFocusGuideSize() {
      state.focusGuideSize += 1;
      renderFocusGuide();
    }

    function decreaseFocusGuideSize() {
      state.focusGuideSize = Math.max(1, state.focusGuideSize - 1);
      renderFocusGuide();
    }

    function moveFocusUp() {
      const activeFile = EditBufferState.getActive();
      const lineCount = activeFile ? activeFile.lineCount : 1;
      const currentRange = state.focusRange || "1-1";
      const parts = currentRange.split("-");
      const currentStart = parseInt(parts[0], 10) || 1;

      // Move start up by 1, but not below 1
      const newStart = Math.max(1, currentStart - 1);
      state.focusStartLine = newStart;

      // Ensure we don't exceed line count
      const newEnd = Math.min(newStart + state.focusGuideSize - 1, lineCount);
      state.focusRange = newStart + "-" + newEnd;

      renderFocusGuide();
    }

    function moveFocusDown() {
      const activeFile = EditBufferState.getActive();
      const lineCount = activeFile ? activeFile.lineCount : 1;
      const currentRange = state.focusRange || "1-1";
      const parts = currentRange.split("-");
      const currentStart = parseInt(parts[0], 10) || 1;

      // Move start down by 1, but ensure we can still show focusGuideSize lines
      // or at least reach the last line
      const maxStart = Math.max(1, lineCount - state.focusGuideSize + 1);
      const newStart = Math.min(maxStart, currentStart + 1);
      state.focusStartLine = newStart;

      const newEnd = Math.min(newStart + state.focusGuideSize - 1, lineCount);
      state.focusRange = newStart + "-" + newEnd;

      renderFocusGuide();
    }

    function centerFocusOnViewport() {
      const activeFile = EditBufferState.getActive();
      const lineCount = activeFile ? activeFile.lineCount : 1;
      const content = document.getElementById("edit-buffer-content");
      if (!content) return;

      const visible = getVisibleLineRange(content);
      if (!visible) return;

      // Calculate center of viewport
      const centerLine = Math.floor((visible.first + visible.last) / 2);
      const half = Math.floor(state.focusGuideSize / 2);

      // Position focus so centerLine is in the middle
      let newStart = Math.max(1, centerLine - half);
      let newEnd = newStart + state.focusGuideSize - 1;

      // Adjust if we go past the end
      if (newEnd > lineCount) {
        newEnd = lineCount;
        // Shift start to maintain size if possible
        newStart = Math.max(1, newEnd - state.focusGuideSize + 1);
      }

      state.focusStartLine = newStart;
      state.focusRange = newStart + "-" + newEnd;
      renderFocusGuide();
    }

    function renderInput() {
      const container = document.getElementById("expert-instruction-input");
      if (!container) return;

      const activeThreadId = getActiveThreadId();

      if (!activeThreadId) {
        container.innerHTML =
          '<div style="padding: 12px; color: #888; font-size: 13px; text-align: center;">Create a chat thread first</div>';
        return;
      }

      // Clear container and set background
      container.innerHTML = "";
      container.style.background = "#1a1a1a";
      container.style.borderTop = "1px solid #3b3b3b";

      // Create input container with padding like chat
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "padding: 10px;";

      // Create the editable bubble with exact chat styling
      const bubble = document.createElement("div");
      bubble.className = "message message-user";
      bubble.style.cssText =
        "background: #2d2d2d; padding: 10px; border-radius: 4px; border-left: 3px solid #74c0fc;";

      // Header with label, status, spacer, and send button
      const header = document.createElement("div");
      header.style.cssText =
        "display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #888; margin-bottom: 5px; text-transform: uppercase;";

      const leftSection = document.createElement("div");
      leftSection.style.cssText =
        "display: flex; align-items: center; gap: 6px;";

      // Label
      const label = document.createElement("span");
      label.textContent = "Expert Edit";

      // Status indicator
      const status = document.createElement("span");
      status.textContent = "●";
      status.style.cssText = "color: #4a90e2; font-size: 10px;";

      leftSection.appendChild(label);
      leftSection.appendChild(status);

      // Send button
      const sendBtn = document.createElement("button");
      sendBtn.type = "button";
      sendBtn.textContent = "⌃↵ Send";
      sendBtn.style.cssText =
        "background: none; border: 1px solid #777; color: #aaa; font-family: monospace; font-size: 11px; line-height: 1.2; padding: 2px 8px; border-radius: 3px; cursor: pointer;";

      sendBtn.addEventListener("mouseenter", function () {
        sendBtn.style.color = "#d4d4d4";
        sendBtn.style.borderColor = "#888";
      });
      sendBtn.addEventListener("mouseleave", function () {
        sendBtn.style.color = "#aaa";
        sendBtn.style.borderColor = "#777";
      });

      // Assemble header
      header.appendChild(leftSection);
      header.appendChild(sendBtn);

      // Content area
      const content = document.createElement("div");
      content.contentEditable = "true";
      content.setAttribute("data-placeholder", "Describe the edit you want...");
      content.style.cssText =
        "white-space: pre-wrap; word-break: break-word; color: #d4d4d4; min-height: 40px; outline: none; cursor: text;";

      // Assemble bubble
      bubble.appendChild(header);
      bubble.appendChild(content);
      wrapper.appendChild(bubble);
      container.appendChild(wrapper);

      // Event handlers
      sendBtn.addEventListener("click", function () {
        const message = content.innerText.trim();
        if (!message) return;

        // Convert to static message
        header.remove();
        content.contentEditable = "false";
        content.style.cursor = "default";
        const staticHeader = document.createElement("div");
        staticHeader.style.cssText =
          "font-size: 11px; color: #888; margin-bottom: 5px; text-transform: uppercase;";
        staticHeader.textContent = "Expert Edit";
        bubble.insertBefore(staticHeader, content);

        state.instruction = message;
        sendExpertInstruction();
      });

      content.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && e.ctrlKey) {
          e.preventDefault();
          sendBtn.click();
        }
      });

      content.addEventListener("paste", function (e) {
        e.preventDefault();
        var text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      });

      // Focus the content area
      setTimeout(function () {
        content.focus();
      }, 0);
    }

    async function sendExpertInstruction() {
      if (!state.instruction) return;

      const sessionId = getSessionId();
      const filePath = getActiveFilePath();
      const threadId = getActiveThreadId();
      if (!sessionId || !filePath) return;
      if (!threadId) {
        showExpertStatus("Select a chat thread first");
        setTimeout(clearExpertStatus, 3000);
        return;
      }

      try {
        const contentRes = await fetch(
          "/sessions/" +
            sessionId +
            "/files/content?path=" +
            encodeURIComponent(filePath),
        );
        if (!contentRes.ok) throw new Error("Failed to read file");
        const contentData = await contentRes.json();
        const rawContent = unescapeHtml(contentData.content || "");

        state.originalPath = filePath;
        state.originalContent = rawContent;

        var focusRange = state.focusRange || "1-1";
        var focusParts = focusRange.includes("-")
          ? focusRange.split("-")
          : [focusRange, focusRange];
        var focusStart = focusParts[0];
        var focusEnd = focusParts[1];

        // Extract focused text (1-based to 0-based indexing)
        var lines = rawContent.split("\n");
        var startIdx = parseInt(focusStart, 10) - 1;
        var endIdx = parseInt(focusEnd, 10);
        var focusedText = lines.slice(startIdx, endIdx).join("\n");

        var fullPrompt =
          "You are a constrained single-file patching assistant.\n\n" +
          "You will receive:\n\n" +
          "* a target file path\n" +
          "* the full file content\n" +
          "* a focus line range (anchor region)\n" +
          "* a user request\n\n" +
          "Your ONLY job is to analyze the request and return SEARCH/REPLACE blocks describing what patches should be applied.\n" +
          "You do NOT execute any patches, modify any files, or make any tool calls.\n" +
          "You ONLY return SEARCH/REPLACE blocks.\n\n" +
          "Important behavior rules:\n\n" +
          "Scope rules:\n\n" +
          "* You ONLY analyze the active file shown in the editor (see Target file below).\n" +
          "* The focus line range is a starting anchor for analysis, NOT a restriction.\n" +
          "* You may read and analyze code outside the focus range if required for correctness.\n" +
          "* You MUST NOT create new files, delete files, or modify any files.\n" +
          "* You MUST NOT make any tool calls, function calls, or use any external tools.\n" +
          "* You MUST NOT read from or write to the filesystem, execute commands, or access external resources.\n" +
          "* You ONLY return SEARCH/REPLACE blocks - you do NOT perform any actions.\n\n" +
          "Correctness requirements:\n\n" +
          "* All patches MUST maintain syntactically valid code.\n" +
          "* Patches MUST NOT break the code structure or compilation.\n" +
          "* Patches MUST be semantically correct and preserve intended behavior.\n" +
          "* Each patch MUST integrate correctly with surrounding code.\n" +
          "* Prefer complete, working patches over partial or broken code.\n\n" +
          "Output rules:\n" +
          "Return one or more SEARCH/REPLACE blocks only. Do not return JSON, markdown, or explanation text.\n\n" +
          "Each block MUST use this exact format:\n" +
          "<<<<<<< SEARCH\n" +
          "[exact old code]\n" +
          "=======\n" +
          "[new code]\n" +
          ">>>>>>> REPLACE\n\n" +
          "CRITICAL: Copy the EXACT old code from the file into SEARCH blocks, including indentation and spacing.\n" +
          "If SEARCH is not exact, the patch may fail.\n\n" +
          "Examples:\n" +
          "1) Replace code:\n" +
          "<<<<<<< SEARCH\n" +
          "def add(x, y):\n" +
          "    return x + y\n" +
          "=======\n" +
          "def add(x, y):\n" +
          "    return safe_add(x, y)\n" +
          ">>>>>>> REPLACE\n\n" +
          "2) Insert code (anchor pattern):\n" +
          "<<<<<<< SEARCH\n" +
          "def existing():\n" +
          "    pass\n" +
          "=======\n" +
          "def existing():\n" +
          "    pass\n\n" +
          "def inserted():\n" +
          "    return 42\n" +
          ">>>>>>> REPLACE\n\n" +
          "3) Delete code (empty REPLACE block):\n" +
          "<<<<<<< SEARCH\n" +
          "def remove_me():\n" +
          "    pass\n" +
          "=======\n" +
          ">>>>>>> REPLACE\n\n" +
          "If the task cannot be completed within this file alone, return exactly:\n\n" +
          "OUT_OF_SCOPE_CHANGE_REQUIRED\n\n" +
          "Input:\n\n" +
          "Target file: " +
          filePath +
          "\n\n" +
          "Focus lines (line numbering starts at 1): " +
          focusStart +
          "-" +
          focusEnd +
          "\n\n" +
          "Focused text:\n" +
          focusedText +
          "\n\n" +
          "Request: " +
          state.instruction +
          "\n\n" +
          "File content (first line of file content is line 1):\n" +
          rawContent;

        var chatWs = window.MIMO_CHAT_SOCKET;
        if (chatWs && chatWs.readyState === WebSocket.OPEN) {
          chatWs.send(
            JSON.stringify({
              type: "expert_instruction",
              sessionId: sessionId,
              chatThreadId: threadId,
              originalPath: filePath,
              instruction: state.instruction,
              focusRange: focusRange,
            }),
          );

          chatWs.send(
            JSON.stringify({
              type: "send_message",
              sessionId: sessionId,
              chatThreadId: threadId,
              content: fullPrompt,
              metadata: { expertMode: true },
            }),
          );

          state.state = "processing";
          state.inputVisible = false;
          updateUI();
        } else {
          throw new Error("Chat connection not available");
        }
      } catch (err) {
        alert("Error: " + err.message);
        state.state = "idle";
        updateUI();
      }
    }

    async function handleExpertDiffReady(data) {
      if (!state.originalContent) {
        console.error("[EXPERT] No originalContent in state");
        showExpertStatus("Error: No original content available");
        setTimeout(clearExpertStatus, 3000);
        state.state = "idle";
        updateUI();
        return;
      }

      const sessionId = getSessionId();
      const threadId = getActiveThreadId();

      if (!sessionId || !threadId) {
        console.error("[EXPERT] Missing sessionId or threadId");
        showExpertStatus("Error: Session or thread not available");
        setTimeout(clearExpertStatus, 3000);
        state.state = "idle";
        updateUI();
        return;
      }

      try {
        let llmResponse = "";

        if (typeof window.MIMO_GET_STREAMING_CONTENT === "function") {
          const streamingData = window.MIMO_GET_STREAMING_CONTENT();
          if (streamingData) {
            if (streamingData.content && streamingData.content.length > 0) {
              llmResponse = streamingData.content;
            } else if (
              streamingData.thoughtContent &&
              streamingData.thoughtContent.length > 0
            ) {
              llmResponse = streamingData.thoughtContent;
            }
          }
        }

        if (!llmResponse) {
          const url =
            "/sessions/" +
            sessionId +
            "/chat-threads/" +
            threadId +
            "/messages";
          const messagesRes = await fetch(url);
          if (!messagesRes.ok)
            throw new Error("Failed to fetch messages: " + messagesRes.status);

          const messages = await messagesRes.json();
          if (!messages || messages.length === 0) {
            throw new Error("No messages found");
          }

          const lastAssistantMessage = messages
            .filter(function (m) {
              return m.role === "assistant";
            })
            .pop();

          if (!lastAssistantMessage) {
            throw new Error("No assistant response found");
          }

          llmResponse = lastAssistantMessage.content;
        }

        const parsedReplacement = window.MIMO_EXPERT_UTILS
          ? window.MIMO_EXPERT_UTILS.extractReplacement(llmResponse)
          : null;

        if (!parsedReplacement) {
          throw new Error("LLM did not return a valid edit");
        }

        if (parsedReplacement.error) {
          if (parsedReplacement.error === "OUT_OF_SCOPE_CHANGE_REQUIRED") {
            throw new Error(
              "Error received: OUT_OF_SCOPE_CHANGE_REQUIRED (the request needs changes outside this file)",
            );
          }
          throw new Error("Error received: " + parsedReplacement.error);
        }

        // Apply the patches to get patched content
        let patchedContent;
        try {
          patchedContent = window.MIMO_EXPERT_UTILS
            ? window.MIMO_EXPERT_UTILS.applyReplacements(
                state.originalContent,
                parsedReplacement,
              )
            : state.originalContent;
        } catch (applyErr) {
          throw new Error("Failed to apply patches: " + applyErr.message);
        }

        // Write patch file to server
        const patchRes = await fetch("/sessions/" + sessionId + "/patches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originalPath: state.originalPath,
            content: patchedContent,
          }),
        });

        if (!patchRes.ok) throw new Error("Failed to write patch file");

        const patchData = await patchRes.json();
        const patchPath = patchData.patchPath;

        // Dispatch to PatchBuffer
        if (
          window.MIMO_PATCH_BUFFER &&
          typeof window.MIMO_PATCH_BUFFER.addPatch === "function"
        ) {
          window.MIMO_PATCH_BUFFER.addPatch({
            sessionId: sessionId,
            originalPath: state.originalPath,
            patchPath: patchPath,
            sourceBufferId: "edit",
          });

          var patchesTab = document.querySelector(
            '.frame-tab[data-frame-id="left"][data-buffer-id="patches"]',
          );
          if (patchesTab) {
            patchesTab.click();
            setTimeout(function () {
              if (
                window.MIMO_PATCH_BUFFER &&
                typeof window.MIMO_PATCH_BUFFER.focusDiffPane === "function"
              ) {
                window.MIMO_PATCH_BUFFER.focusDiffPane();
              }
            }, 0);
          }
        }

        // Clear originalContent and transition to idle
        state.originalContent = null;
        state.state = "idle";
        updateUI();

        // Show toast
        showExpertStatus("Patch sent to PatchBuffer");
        setTimeout(clearExpertStatus, 2000);
      } catch (err) {
        console.error("[EXPERT] Error in handleExpertDiffReady:", err);
        showExpertStatus(err.message || "Error processing diff");
        setTimeout(clearExpertStatus, 3000);
        state.originalContent = null;
        state.state = "idle";
        updateUI();
      }
    }

    function unescapeHtml(str) {
      return str
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    }

    function abortProcessing() {
      if (state.state !== "processing") return;
      state.originalContent = null;
      state.state = "idle";
      clearExternalModifyWarning();
      clearExpertStatus();
      updateUI();
    }

    async function cancelExpertProcessing() {
      if (state.state !== "processing") return;

      const sessionId = getSessionId();
      const threadId = getActiveThreadId();

      const chatWs = window.MIMO_CHAT_SOCKET;
      if (chatWs && chatWs.readyState === WebSocket.OPEN) {
        chatWs.send(
          JSON.stringify({
            type: "cancel_request",
            sessionId: sessionId,
            chatThreadId: threadId,
          }),
        );
      }

      // Clear state - no patch file was written, nothing to clean up
      state.originalContent = null;
      state.state = "idle";
      clearExternalModifyWarning();
      updateUI();

      showExpertStatus("Cancelled");
      setTimeout(clearExpertStatus, 2000);
    }

    function resetState() {
      clearExternalModifyWarning();
      state = getInitialState();
      const sessionId = getSessionId();
      if (sessionId) {
        loadPersisted(sessionId);
      }
      updateUI();
    }

    async function recoverPendingPatches(sessionId) {
      try {
        const res = await fetch("/sessions/" + sessionId + "/patches");
        if (!res.ok) return;

        const data = await res.json();
        if (!data.patches || data.patches.length === 0) return;
        data.patches.forEach(function (patch) {
          if (
            window.MIMO_PATCH_BUFFER &&
            typeof window.MIMO_PATCH_BUFFER.addPatch === "function"
          ) {
            window.MIMO_PATCH_BUFFER.addPatch({
              sessionId: sessionId,
              originalPath: patch.originalPath,
              patchPath: patch.patchPath,
              sourceBufferId: "edit",
            });
          }
        });
      } catch (e) {}
    }

    return {
      init: function (sessionId) {
        loadPersisted(sessionId);
        if (state.enabled) {
          state.state = "idle";
          state.inputVisible = false;
          updateUI();
          renderFocusGuide();
        }
        // Recover pending patches on init
        recoverPendingPatches(sessionId);
      },
      toggle: function (sessionId) {
        if (state.state === "processing") {
          return;
        }
        state.enabled = !state.enabled;
        state.state = state.enabled ? "idle" : "off";
        state.inputVisible = false;
        // Reset focus guide size and position when toggling
        state.focusGuideSize = 5;
        state.focusStartLine = null;
        persist(sessionId);
        updateUI();
        if (state.enabled) {
          renderFocusGuide();
        }
      },
      toggleInput: function () {
        if (!state.enabled || state.state !== "idle") return;
        state.inputVisible = !state.inputVisible;
        if (state.inputVisible) {
          renderInput();
        }
        updateUI();
        if (state.inputVisible) {
          setTimeout(function () {
            var textEl = document.getElementById("expert-instruction-text");
            if (textEl) textEl.focus();
          }, 50);
        }
      },
      updateFocusGuide: renderFocusGuide,
      increaseFocusGuideSize: increaseFocusGuideSize,
      decreaseFocusGuideSize: decreaseFocusGuideSize,
      moveFocusUp: moveFocusUp,
      moveFocusDown: moveFocusDown,
      centerFocusOnViewport: centerFocusOnViewport,
      handleDiffReady: handleExpertDiffReady,
      showExternalModifyWarning: showExternalModifyWarning,
      cancelProcessing: cancelExpertProcessing,
      abortProcessing: abortProcessing,
      updateUI: updateUI,
      getState: function () {
        return state;
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

  function normalizeQuery(query) {
    return String(query || "")
      .replace(/\\\\/g, "/")
      .replace(/^\.\//, "")
      .trim()
      .toLowerCase();
  }

  function queryBasename(query) {
    const normalized = normalizeQuery(query);
    if (!normalized) return "";
    const parts = normalized.split("/");
    return parts[parts.length - 1] || normalized;
  }

  function matchScore(file, pattern) {
    const normalizedPattern = normalizeQuery(pattern);
    if (!normalizedPattern) return 0;

    const pathLower = String(file.path || "").toLowerCase();
    const nameLower = String(file.name || "").toLowerCase();
    const namePattern = queryBasename(normalizedPattern);

    if (pathLower === normalizedPattern) return 0;
    if (normalizedPattern.endsWith("/" + pathLower)) return 1;
    if (pathLower.startsWith(normalizedPattern)) return 2;
    if (pathLower.includes(normalizedPattern)) return 3;
    if (nameLower === namePattern) return 4;
    if (nameLower.startsWith(namePattern)) return 5;
    if (nameLower.includes(namePattern)) return 6;

    return Number.POSITIVE_INFINITY;
  }

  function openFileFinder(initialPattern) {
    const dialog = document.getElementById("file-finder-dialog");
    if (!dialog) return false;

    const isEventObject =
      initialPattern &&
      typeof initialPattern === "object" &&
      typeof initialPattern.preventDefault === "function";
    const pattern = isEventObject ? "" : String(initialPattern || "");

    dialog.style.display = "flex";
    const input = document.getElementById("file-finder-input");
    if (input) {
      input.value = pattern;
      input.focus();
      if (pattern) input.select();
    }

    if (!fileFinderLoaded) {
      loadFileList(pattern);
    } else {
      filterResults(pattern);
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
    const url = "/sessions/" + sessionId + "/files";
    fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (files) {
        allFiles = files;
        fileFinderLoaded = true;
        filterResults(pattern);
      })
      .catch(function () {
        const resultsEl = document.getElementById("file-finder-results");
        if (resultsEl)
          resultsEl.innerHTML =
            '<div style="color:#ff6b6b;padding:8px;font-size:12px;">Failed to load files.</div>';
      });
  }

  function filterResults(pattern) {
    const pat = String(pattern || "").trim();
    if (!pat) {
      filteredFiles = allFiles.slice();
    } else {
      filteredFiles = allFiles
        .map(function (f) {
          return { file: f, score: matchScore(f, pat) };
        })
        .filter(function (entry) {
          return Number.isFinite(entry.score);
        })
        .sort(function (a, b) {
          if (a.score !== b.score) return a.score - b.score;
          return String(a.file.path).localeCompare(String(b.file.path));
        })
        .map(function (entry) {
          return entry.file;
        });
    }

    selectedResultIndex = 0;
    renderResults(filteredFiles);
  }

  function renderResults(files) {
    const resultsEl = document.getElementById("file-finder-results");
    if (!resultsEl) return;
    if (!files.length) {
      resultsEl.innerHTML =
        '<div style="color:#888;padding:8px;font-size:12px;">No files found.</div>';
      return;
    }
    const MAX = 50;
    const shown = files.slice(0, MAX);
    resultsEl.innerHTML = shown
      .map(function (f, i) {
        const active = i === selectedResultIndex;
        return (
          '<div class="file-finder-result" data-path="' +
          escapeAttr(f.path) +
          '" data-index="' +
          i +
          '" style="padding:7px 10px;cursor:pointer;font-family:monospace;font-size:12px;background:' +
          (active ? "#3a3a5a" : "transparent") +
          ";color:" +
          (active ? "#d4d4d4" : "#aaa") +
          ';">' +
          '<span style="color:' +
          (active ? "#d4d4d4" : "#ccc") +
          ';">' +
          escapeHtml(f.name) +
          "</span>" +
          '<span style="color:#666;margin-left:8px;font-size:11px;">' +
          escapeHtml(f.path) +
          "</span>" +
          "</div>"
        );
      })
      .join("");

    resultsEl.querySelectorAll(".file-finder-result").forEach(function (el) {
      el.addEventListener("mousedown", function (e) {
        e.preventDefault();
        const path = el.getAttribute("data-path");
        const file = files.find(function (f) {
          return f.path === path;
        });
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
      selectedResultIndex =
        (selectedResultIndex - 1 + filteredFiles.length) % filteredFiles.length;
    }
    renderResults(filteredFiles);
    scrollResultIntoView();
  }

  function scrollResultIntoView() {
    const resultsEl = document.getElementById("file-finder-results");
    if (!resultsEl) return;
    const active = resultsEl.querySelector(
      '[data-index="' + selectedResultIndex + '"]',
    );
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function confirmSelection() {
    const file = filteredFiles[selectedResultIndex];
    if (file) selectFile(file);
  }

  function fetchAndAddFile(sessionId, path, callback) {
    fetch(
      "/sessions/" +
        sessionId +
        "/files/content?path=" +
        encodeURIComponent(path),
    )
      .then(function (r) {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(function (data) {
        EditBufferState.add(
          {
            path: data.path,
            name: data.name,
            language: data.language,
            lineCount: data.lineCount,
            content: data.content,
            scrollPosition: 0,
          },
          sessionId,
        );
        // Notify server to watch this file
        notifyWatchFile(sessionId, {
          path: data.path,
          contentChecksum: EditBufferState.getChecksum(data.path),
        });
        if (callback) callback();
      })
      .catch(function () {
        /* file gone — skip */
      });
  }

  function selectFile(fileInfo) {
    closeFileFinder();
    const sessionId = getSessionId();
    if (!sessionId) return;
    fetchAndAddFile(sessionId, fileInfo.path, function () {
      renderEditBuffer();
      // Switch to the Files buffer so the opened file is visible
      var filesTab = document.querySelector(
        '.frame-tab[data-frame-id="left"][data-buffer-id="edit"]',
      );
      if (filesTab) filesTab.click();
      // Focus the edit buffer content area so scrolling works immediately
      var contentEl = document.getElementById("edit-buffer-content");
      if (contentEl) contentEl.focus();
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
      tab.style.cssText =
        "padding:8px 16px;border:none;border-right:1px solid #444;background:" +
        (isActive ? "#1a1a1a" : "transparent") +
        ";color:" +
        (isActive ? "#d4d4d4" : "#888") +
        ";cursor:pointer;font-family:monospace;font-size:12px;white-space:nowrap;";
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
      btn.style.cssText =
        "padding:8px 12px;border:none;border-right:1px solid #444;background:transparent;color:#888;cursor:pointer;font-family:monospace;font-size:12px;white-space:nowrap;flex-shrink:0;";
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
    const outdatedEl = document.getElementById(
      "edit-buffer-outdated-indicator",
    );
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
    linesBody.innerHTML = lines
      .map(function (line, i) {
        return (
          '<tr data-line-number="' +
          (i + 1) +
          '"><td style="padding:0 12px 0 8px;color:#555;text-align:right;user-select:none;font-size:12px;min-width:40px;">' +
          (i + 1) +
          '</td><td style="padding:0 8px;white-space:pre;"><code class="language-' +
          escapeAttr(active.language) +
          '">' +
          line +
          "</code></td></tr>"
        );
      })
      .join("");

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
      if (contentEl)
        EditBufferState.setScrollPosition(current.path, contentEl.scrollTop);
    }
    EditBufferState.switchFile(dir, sessionId);
    renderEditBuffer();
    return true;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getFileIcon(language) {
    const icons = {
      typescript: "TS",
      javascript: "JS",
      python: "PY",
      rust: "RS",
      go: "GO",
      json: "{}",
      markdown: "MD",
      html: "HT",
      css: "CS",
    };
    return icons[language] || "[]";
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(text) {
    return String(text).replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // ── Scroll in content area ───────────────────────────────────────────────────

  function scrollContent(dir) {
    const contentEl = document.getElementById("edit-buffer-content");
    if (!contentEl) return false;
    const amount =
      dir === "up"
        ? -contentEl.clientHeight * 0.9
        : contentEl.clientHeight * 0.9;
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
    fetch(
      "/sessions/" +
        sessionId +
        "/files/content?path=" +
        encodeURIComponent(active.path),
    )
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
          contentChecksum: EditBufferState.getChecksum(active.path),
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
      setTimeout(initFileWatchWebSocket, 1000);
      return;
    }

    if (fileWatchSocket && fileWatchSocket.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl =
      protocol + "//" + window.location.host + "/ws/files/" + sessionId;

    try {
      fileWatchSocket = new WebSocket(wsUrl);
    } catch (err) {
      console.error("[FileWatcher] Failed to create WebSocket:", err);
      return;
    }

    fileWatchSocket.onopen = function () {
      fileWatchReconnectAttempts = 0;

      const files = EditBufferState.getAll();
      files.forEach(function (file) {
        notifyWatchFile(sessionId, file);
      });
    };

    fileWatchSocket.onmessage = function (event) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "file_outdated") {
          EditBufferState.markOutdated(data.path);
          const expertState = ExpertMode.getState();
          if (
            expertState.originalPath &&
            EditBufferState.matchesPath(data.path, expertState.originalPath)
          ) {
            ExpertMode.showExternalModifyWarning();
          }
          renderEditBuffer();
        } else if (data.type === "file_deleted") {
          EditBufferState.markOutdated(data.path);
          const expertState = ExpertMode.getState();
          if (
            expertState.originalPath &&
            EditBufferState.matchesPath(data.path, expertState.originalPath)
          ) {
            ExpertMode.showExternalModifyWarning();
          }
          renderEditBuffer();
        } else if (data.type === "open_file_in_editbuffer") {
          if (typeof data.path === "string" && data.path.length > 0) {
            fetchAndAddFile(sessionId, data.path, function () {
              renderEditBuffer();
              var editTab = document.querySelector(
                '.frame-tab[data-frame-id="left"][data-buffer-id="edit"]',
              );
              if (editTab) editTab.click();
              var contentEl = document.getElementById("edit-buffer-content");
              if (contentEl) contentEl.focus();
            });
          }
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
      fileWatchSocket = null;

      if (fileWatchReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        fileWatchReconnectAttempts++;
        const delay = Math.min(3000 * fileWatchReconnectAttempts, 15000);
        setTimeout(initFileWatchWebSocket, delay);
      }
    };

    if (typeof window.EditBuffer !== "undefined") {
      window.EditBuffer.ws = fileWatchSocket;
    }
  }

  function notifyWatchFile(sessionId, file) {
    if (!fileWatchSocket) {
      return;
    }
    if (fileWatchSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    const checksum =
      file.contentChecksum || EditBufferState.getChecksum(file.path);

    fileWatchSocket.send(
      JSON.stringify({
        type: "watch_file",
        path: file.path,
        checksum: checksum,
      }),
    );
  }

  function notifyUnwatchFile(sessionId, filePath) {
    if (fileWatchSocket && fileWatchSocket.readyState === WebSocket.OPEN) {
      fileWatchSocket.send(
        JSON.stringify({
          type: "unwatch_file",
          path: filePath,
        }),
      );
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
      openFile: function (path) {
        var sessionId = getSessionId();
        if (!sessionId) return;
        fetchAndAddFile(sessionId, path, function () {
          renderEditBuffer();
          var filesTab = document.querySelector(
            '.frame-tab[data-frame-id="left"][data-buffer-id="edit"]',
          );
          if (filesTab) filesTab.click();
          var contentEl = document.getElementById("edit-buffer-content");
          if (contentEl) contentEl.focus();
        });
      },
      ws: null,
      toggleExpertMode: function () {
        var sid = getSessionId();
        if (sid) ExpertMode.toggle(sid);
      },
      toggleExpertInput: function () {
        ExpertMode.toggleInput();
      },
      increaseFocusGuideSize: function () {
        ExpertMode.increaseFocusGuideSize();
      },
      decreaseFocusGuideSize: function () {
        ExpertMode.decreaseFocusGuideSize();
      },
      getExpertModeState: function () {
        return ExpertMode.getState();
      },
      moveFocusUp: function () {
        ExpertMode.moveFocusUp();
      },
      moveFocusDown: function () {
        ExpertMode.moveFocusDown();
      },
      centerFocusOnViewport: function () {
        ExpertMode.centerFocusOnViewport();
      },
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
        if (e.key === "ArrowDown") {
          e.preventDefault();
          navigateResults("down");
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          navigateResults("up");
        } else if (e.key === "Enter") {
          e.preventDefault();
          confirmSelection();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeFileFinder();
        }
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
        if (active)
          EditBufferState.setScrollPosition(active.path, contentEl.scrollTop);
      });
    }

    // Initialize file watching WebSocket (after window.EditBuffer is defined)
    initFileWatchWebSocket();

    // Restore previously open files from localStorage
    var sessionId = getSessionId();
    if (sessionId) {
      var stored = EditBufferState.loadStored(sessionId);
      if (
        stored &&
        Array.isArray(stored.openPaths) &&
        stored.openPaths.length > 0
      ) {
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

      // Initialize expert mode
      ExpertMode.init(sessionId);

      // Wire Expert Mode Cancel button
      const expertCancelBtn = document.getElementById("expert-cancel-btn");
      if (expertCancelBtn) {
        expertCancelBtn.addEventListener("click", function () {
          ExpertMode.cancelProcessing();
        });
      }

      // Wire Expert Mode toggle button
      const expertToggleBtn = document.getElementById("expert-mode-toggle");
      if (expertToggleBtn) {
        expertToggleBtn.addEventListener("click", function () {
          ExpertMode.toggle(sessionId);
        });
      }

      // Fallback hook in case chat.js cannot call window.EditBuffer directly
      window.addEventListener("mimo_expert_diff_ready", function (event) {
        var detail = event && event.detail ? event.detail : null;
        if (!detail) return;
        ExpertMode.handleDiffReady(detail);
      });

      // Wire Expert Mode thread selector
      const expertThreadSelect = document.getElementById(
        "expert-thread-select",
      );
      if (expertThreadSelect) {
        expertThreadSelect.addEventListener("change", function () {
          var expertState = ExpertMode.getState();
          if (this.value) {
            expertState.chatThreadId = this.value;
            if (
              window.MIMO_CHAT_THREADS &&
              window.MIMO_CHAT_THREADS.setActiveThread
            ) {
              window.MIMO_CHAT_THREADS.setActiveThread(this.value);
            }
            setTimeout(function () {
              ExpertMode.updateUI();
            }, 100);
          }
        });
      }
    }

    // Expert mode focus guide scroll handler
    const contentEl2 = document.getElementById("edit-buffer-content");
    if (contentEl2) {
      contentEl2.addEventListener("scroll", function () {
        var state = ExpertMode.getState();
        if (
          state.enabled &&
          state.state !== "off" &&
          state.state !== "processing"
        ) {
          ExpertMode.updateFocusGuide();
        }
      });
    }

    // Cleanup on page unload if in processing state
    window.addEventListener("beforeunload", function () {
      var expState = ExpertMode.getState();
      if (expState.enabled && expState.state === "processing") {
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
