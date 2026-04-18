"use strict";

(function () {
  let shortcutBarPulseTimeout = null;

  const DEFAULT_KEYBINDINGS = {
    newThread: "Mod+Shift+N",
    nextThread: "Mod+Shift+ArrowRight",
    previousThread: "Mod+Shift+ArrowLeft",
    commit: "Mod+Shift+M",
    projectNotes: "Mod+Shift+,",
    sessionNotes: "Mod+Shift+.",
    shortcutsHelp: "Mod+Shift+/",
    closeModal: "Escape",
    openFileFinder: "Mod+Shift+F",
    closeFile: "Alt+Shift+W",
    nextFile: "Mod+Alt+ArrowRight",
    previousFile: "Mod+Alt+ArrowLeft",
    nextLeftBuffer: "Alt+Shift+PageDown",
    previousLeftBuffer: "Alt+Shift+PageUp",
  };

  function getConfiguredKeybindings() {
    const configured = Object.assign({}, DEFAULT_KEYBINDINGS);
    const raw = window.MIMO_SESSION_KEYBINDINGS;
    if (!raw || typeof raw !== "object") {
      return configured;
    }

    Object.keys(DEFAULT_KEYBINDINGS).forEach((key) => {
      const value = raw[key];
      if (typeof value === "string" && value.trim().length > 0) {
        configured[key] = value.trim();
      }
    });

    // Edit buffer keybindings (also configurable)
    ["openFileFinder", "closeFile", "nextFile", "previousFile"].forEach((key) => {
      const value = raw[key];
      if (typeof value === "string" && value.trim().length > 0) {
        configured[key] = value.trim();
      }
    });

    return configured;
  }

  const keybindings = getConfiguredKeybindings();

  function isModShift(event) {
    return (event.metaKey || event.ctrlKey) && event.shiftKey;
  }

  function normalizeBindingToken(token) {
    if (!token) {
      return "";
    }

    const trimmed = token.trim();
    const upper = trimmed.toUpperCase();

    if (upper === "MOD") return "MOD";
    if (upper === "SHIFT") return "SHIFT";
    if (upper === "CTRL" || upper === "CONTROL") return "CTRL";
    if (upper === "META" || upper === "CMD" || upper === "COMMAND") {
      return "META";
    }
    if (upper === "ALT" || upper === "OPTION") return "ALT";
    if (upper === "ARROWRIGHT") return "ARROWRIGHT";
    if (upper === "ARROWLEFT") return "ARROWLEFT";
    if (upper === "PAGEUP" || upper === "PGUP") return "PAGEUP";
    if (upper === "PAGEDOWN" || upper === "PGDOWN" || upper === "PGDN") return "PAGEDOWN";
    if (upper === "ESC" || upper === "ESCAPE") return "ESCAPE";
    if (upper === "COMMA") return ",";
    if (upper === "PERIOD" || upper === "DOT") return ".";
    if (upper === "SLASH" || upper === "QUESTION") return "/";
    if (trimmed === "," || trimmed === "." || trimmed === "/") {
      return trimmed;
    }

    if (trimmed.length === 1) {
      return trimmed.toUpperCase();
    }

    return upper;
  }

  function parseBinding(binding) {
    if (typeof binding !== "string") {
      return null;
    }

    const tokens = binding
      .split("+")
      .map((token) => token.trim())
      .filter(Boolean)
      .map(normalizeBindingToken);

    if (tokens.length === 0) {
      return null;
    }

    const parsed = {
      requiresMod: false,
      requiresCtrl: false,
      requiresMeta: false,
      requiresShift: false,
      requiresAlt: false,
      key: null,
    };

    tokens.forEach((token) => {
      if (token === "MOD") {
        parsed.requiresMod = true;
      } else if (token === "CTRL") {
        parsed.requiresCtrl = true;
      } else if (token === "META") {
        parsed.requiresMeta = true;
      } else if (token === "SHIFT") {
        parsed.requiresShift = true;
      } else if (token === "ALT") {
        parsed.requiresAlt = true;
      } else {
        parsed.key = token;
      }
    });

    if (!parsed.key) {
      return null;
    }

    return parsed;
  }

  function normalizeEventKey(event) {
    const raw = typeof event.key === "string" ? event.key : "";
    if (!raw) {
      return "";
    }

    if (raw === "Escape" || raw === "Esc") return "ESCAPE";
    if (raw === "ArrowRight") return "ARROWRIGHT";
    if (raw === "ArrowLeft") return "ARROWLEFT";
    if (raw === "PageUp") return "PAGEUP";
    if (raw === "PageDown") return "PAGEDOWN";
    if (raw === "<" || raw === ",") return ",";
    if (raw === ">" || raw === ".") return ".";
    if (raw === "?" || raw === "/") return "/";

    if (raw.length === 1) {
      return raw.toUpperCase();
    }

    return raw.toUpperCase();
  }

  function normalizeEventCode(event) {
    const code = typeof event.code === "string" ? event.code : "";
    if (!code) {
      return "";
    }

    if (code === "Escape") return "ESCAPE";
    if (code === "ArrowRight") return "ARROWRIGHT";
    if (code === "ArrowLeft") return "ARROWLEFT";
    if (code === "Comma") return ",";
    if (code === "Period") return ".";
    if (code === "Slash") return "/";

    if (code.length === 4 && code.startsWith("Key")) {
      return code.slice(3).toUpperCase();
    }

    return code.toUpperCase();
  }

  function bindingMatches(event, binding) {
    const parsed = parseBinding(binding);
    if (!parsed) {
      return false;
    }

    if (parsed.requiresMod && !(event.metaKey || event.ctrlKey)) {
      return false;
    }
    if (parsed.requiresCtrl && !event.ctrlKey) {
      return false;
    }
    if (parsed.requiresMeta && !event.metaKey) {
      return false;
    }
    if (parsed.requiresShift && !event.shiftKey) {
      return false;
    }
    if (parsed.requiresAlt && !event.altKey) {
      return false;
    }
    // Reject if Alt is pressed but not required (prevents misfires)
    if (!parsed.requiresAlt && event.altKey) {
      return false;
    }

    const eventKey = normalizeEventKey(event);
    const eventCode = normalizeEventCode(event);
    return parsed.key === eventKey || parsed.key === eventCode;
  }

  function switchLeftBuffer(direction) {
    const tabs = Array.from(document.querySelectorAll('.frame-tab[data-frame-id="left"]'));
    if (tabs.length <= 1) return false;
    const activeIndex = tabs.findIndex((t) => t.classList.contains("active"));
    const current = activeIndex >= 0 ? activeIndex : 0;
    const next = (current + direction + tabs.length) % tabs.length;
    tabs[next].click();
    return true;
  }

  function getThreadTabs() {
    return Array.from(document.querySelectorAll(".chat-thread-tab"));
  }

  function switchThread(direction) {
    const tabs = getThreadTabs();
    if (tabs.length <= 1) {
      return false;
    }

    const activeIndex = tabs.findIndex((tab) =>
      tab.classList.contains("active"),
    );
    const currentIndex = activeIndex >= 0 ? activeIndex : 0;
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    if (!nextTab) {
      return false;
    }

    nextTab.click();
    return true;
  }

  function openCreateThreadDialog() {
    const createButton = document.querySelector("#create-thread-btn");
    if (!createButton) {
      return false;
    }
    createButton.click();
    return true;
  }

  function openCommitDialog() {
    const commitButton = document.querySelector("#commit-btn");
    if (!commitButton) {
      return false;
    }
    commitButton.click();
    return true;
  }

  function isEscapeKey(event) {
    return (
      bindingMatches(event, keybindings.closeModal) || event.keyCode === 27
    );
  }

  function isCommitDialogOpen() {
    const commitDialog = document.querySelector("#commit-dialog");
    if (!commitDialog) {
      return false;
    }
    if (commitDialog.style.display === "none") {
      return false;
    }
    const computed = window.getComputedStyle(commitDialog);
    return computed.display !== "none" && computed.visibility !== "hidden";
  }

  function closeCommitDialog() {
    const cancelButton = document.querySelector("#commit-cancel");
    if (cancelButton) {
      cancelButton.click();
      return true;
    }
    const commitDialog = document.querySelector("#commit-dialog");
    if (!commitDialog) {
      return false;
    }
    commitDialog.style.display = "none";
    return true;
  }

  function highlightShortcutsBar() {
    const shortcutsBar = document.querySelector("#session-shortcuts-bar");
    if (!shortcutsBar) {
      return true;
    }
    shortcutsBar.classList.add("is-pulsing");
    if (shortcutBarPulseTimeout) {
      clearTimeout(shortcutBarPulseTimeout);
    }
    shortcutBarPulseTimeout = setTimeout(() => {
      shortcutsBar.classList.remove("is-pulsing");
    }, 800);
    return true;
  }

  function focusNotesInput(selector) {
    const notesTab = document.querySelector(
      '.frame-tab[data-frame-id="right"][data-buffer-id="notes"]',
    );
    if (notesTab) {
      notesTab.click();
    }

    const focusAction = () => {
      const input = document.querySelector(selector);
      if (!input) {
        return false;
      }
      input.focus();
      const length = typeof input.value === "string" ? input.value.length : 0;
      if (typeof input.setSelectionRange === "function") {
        input.setSelectionRange(length, length);
      }
      return true;
    };

    if (focusAction()) {
      return true;
    }

    requestAnimationFrame(() => {
      focusAction();
    });

    setTimeout(() => {
      focusAction();
    }, 70);

    return true;
  }

  function onKeyDown(event) {
    if (isEscapeKey(event) && isCommitDialogOpen()) {
      event.preventDefault();
      closeCommitDialog();
      return;
    }

    const isHelpShortcut = bindingMatches(event, keybindings.shortcutsHelp);

    let handled = false;

    // Edit buffer keybindings (checked before thread keybindings to keep them separate)
    if (bindingMatches(event, keybindings.openFileFinder)) {
      if (window.EditBuffer) {
        handled = window.EditBuffer.isFileFinderOpen()
          ? window.EditBuffer.closeFileFinder()
          : window.EditBuffer.openFileFinder();
      }
    } else if (isEscapeKey(event) && window.EditBuffer && window.EditBuffer.isFileFinderOpen()) {
      handled = window.EditBuffer.closeFileFinder();
    } else if (bindingMatches(event, keybindings.nextFile)) {
      if (window.EditBuffer) handled = window.EditBuffer.switchFile("right");
    } else if (bindingMatches(event, keybindings.previousFile)) {
      if (window.EditBuffer) handled = window.EditBuffer.switchFile("left");
    } else if (bindingMatches(event, keybindings.closeFile)) {
      if (window.EditBuffer) handled = window.EditBuffer.closeCurrentFile();
    } else if (bindingMatches(event, keybindings.nextLeftBuffer)) {
      handled = switchLeftBuffer(1);
    } else if (bindingMatches(event, keybindings.previousLeftBuffer)) {
      handled = switchLeftBuffer(-1);
    } else if (isHelpShortcut) {
      handled = highlightShortcutsBar();
    } else if (bindingMatches(event, keybindings.nextThread)) {
      handled = switchThread(1);
    } else if (bindingMatches(event, keybindings.previousThread)) {
      handled = switchThread(-1);
    } else if (bindingMatches(event, keybindings.newThread)) {
      handled = openCreateThreadDialog();
    } else if (bindingMatches(event, keybindings.commit)) {
      handled = isCommitDialogOpen() ? closeCommitDialog() : openCommitDialog();
    } else if (bindingMatches(event, keybindings.projectNotes)) {
      handled = focusNotesInput("#project-notes-input");
    } else if (bindingMatches(event, keybindings.sessionNotes)) {
      handled = focusNotesInput("#notes-input");
    }

    if (handled) {
      event.preventDefault();
      return;
    }

    if (isModShift(event)) {
      highlightShortcutsBar();
    }
  }

  function init() {
    document.addEventListener("keydown", onKeyDown, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
