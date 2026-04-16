"use strict";

(function () {
  const HELP_SEEN_KEY = "mimo.session.shortcuts-help.seen.v1";
  let hintTimeout = null;
  let autoHelpWasShown = false;

  function isModShift(event) {
    return (event.metaKey || event.ctrlKey) && event.shiftKey;
  }

  function isEditableTarget(target) {
    if (!target || typeof target.closest !== "function") {
      return false;
    }
    return Boolean(target.closest("input, textarea, select, [contenteditable]"));
  }

  function markHelpSeen() {
    try {
      window.localStorage.setItem(HELP_SEEN_KEY, "1");
    } catch {
      // Ignore storage failures
    }
  }

  function keyMatches(event, key, code) {
    const rawKey = typeof event.key === "string" ? event.key : "";
    const normalized = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
    if (normalized === key) {
      return true;
    }
    return event.code === code;
  }

  function getThreadTabs() {
    return Array.from(document.querySelectorAll(".chat-thread-tab"));
  }

  function switchThread(direction) {
    const tabs = getThreadTabs();
    if (tabs.length <= 1) {
      return false;
    }

    const activeIndex = tabs.findIndex((tab) => tab.classList.contains("active"));
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

  function showHint(message) {
    const hint = document.querySelector("#session-shortcuts-hint");
    if (!hint) {
      return;
    }

    hint.textContent = message;
    hint.style.display = "block";

    if (hintTimeout) {
      clearTimeout(hintTimeout);
    }

    hintTimeout = setTimeout(() => {
      hint.style.display = "none";
    }, 2600);
  }

  function getHelpModal() {
    return document.querySelector("#session-shortcuts-help");
  }

  function setHelpVisibility(visible) {
    const modal = getHelpModal();
    if (!modal) {
      return;
    }
    modal.style.display = visible ? "flex" : "none";
    modal.setAttribute("aria-hidden", visible ? "false" : "true");

    if (!visible && autoHelpWasShown) {
      markHelpSeen();
      autoHelpWasShown = false;
    }
  }

  function toggleHelp() {
    const modal = getHelpModal();
    if (!modal) {
      return false;
    }
    const isVisible = modal.style.display !== "none";
    setHelpVisibility(!isVisible);
    return true;
  }

  function showHelp() {
    const modal = getHelpModal();
    if (!modal) {
      return false;
    }
    setHelpVisibility(true);
    return true;
  }

  function focusNotesInput(selector) {
    const notesTab = document.querySelector('.frame-tab[data-frame-id="right"][data-buffer-id="notes"]');
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
    const isHelpShortcut =
      isModShift(event) &&
      (event.key === "?" || event.key === "/" || event.code === "Slash");

    if (!isModShift(event)) {
      return;
    }

    if (isEditableTarget(event.target) && !isHelpShortcut) {
      return;
    }

    let handled = false;

    if (isHelpShortcut) {
      handled = toggleHelp();
    } else if (event.key === "ArrowRight" || event.code === "ArrowRight") {
      handled = switchThread(1);
    } else if (event.key === "ArrowLeft" || event.code === "ArrowLeft") {
      handled = switchThread(-1);
    } else if (keyMatches(event, "N", "KeyN")) {
      handled = openCreateThreadDialog();
    } else if (keyMatches(event, "M", "KeyM")) {
      handled = openCommitDialog();
    } else if (event.key === "," || event.key === "<" || event.code === "Comma") {
      handled = focusNotesInput("#project-notes-input");
    } else if (event.key === "." || event.key === ">" || event.code === "Period") {
      handled = focusNotesInput("#notes-input");
    }

    if (handled) {
      event.preventDefault();
      return;
    }

    if (isModShift(event)) {
      showHint("Shortcut not mapped. Press Mod+Shift+/ for help.");
    }
  }

  function setupHelpUI() {
    const openButton = document.querySelector("#session-shortcuts-help-btn");
    if (openButton) {
      openButton.addEventListener("click", showHelp);
    }

    const closeButton = document.querySelector("#session-shortcuts-close");
    if (closeButton) {
      closeButton.addEventListener("click", () => setHelpVisibility(false));
    }

    const modal = getHelpModal();
    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          setHelpVisibility(false);
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && getHelpModal()?.style.display !== "none") {
        setHelpVisibility(false);
      }
    });
  }

  function showHelpOnFirstVisit() {
    try {
      if (window.localStorage.getItem(HELP_SEEN_KEY) === "1") {
        return;
      }
      if (showHelp()) {
        autoHelpWasShown = true;
      }
    } catch {
      showHelp();
    }
  }

  function init() {
    setupHelpUI();
    document.addEventListener("keydown", onKeyDown);
    showHelpOnFirstVisit();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
