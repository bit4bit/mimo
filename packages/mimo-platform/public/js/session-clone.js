// Clone workspace modal + clipboard copy behavior
(function () {
  const openBtn = document.getElementById("clone-workspace-btn");
  const dialog = document.getElementById("clone-workspace-dialog");
  const closeBtn = document.getElementById("clone-workspace-close");
  const commandEl = document.getElementById("clone-workspace-command");
  const statusEl = document.getElementById("clone-workspace-copy-status");
  const selectEl = document.getElementById("clone-repo-select");

  if (!openBtn || !dialog || !closeBtn || !commandEl) {
    return;
  }

  // Per-repo command map (present for multi-repo sessions). Keyed by repoId.
  const commandsJson = commandEl.dataset.commands;
  const commandsMap = commandsJson ? JSON.parse(commandsJson) : null;

  function currentCommand() {
    if (commandsMap && selectEl) {
      return commandsMap[selectEl.value] || "";
    }
    return commandEl.dataset.command || commandEl.textContent || "";
  }

  function setStatus(message, color) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = color;
  }

  async function copyCommand() {
    const command = currentCommand();
    if (!command.trim()) {
      setStatus("No command available", "#ff6b6b");
      return;
    }

    try {
      await navigator.clipboard.writeText(command);
      setStatus("Copied!", "#51cf66");
      setTimeout(function () {
        setStatus("", "#888");
      }, 1500);
    } catch {
      setStatus("Copy failed. Select command and copy manually.", "#ff6b6b");
    }
  }

  openBtn.addEventListener("click", function () {
    dialog.style.display = "flex";
    setStatus("", "#888");
  });

  closeBtn.addEventListener("click", function () {
    dialog.style.display = "none";
  });

  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) {
      dialog.style.display = "none";
    }
  });

  if (selectEl && commandsMap) {
    selectEl.addEventListener("change", function () {
      commandEl.textContent = currentCommand();
    });
  }

  commandEl.addEventListener("click", copyCommand);
})();
