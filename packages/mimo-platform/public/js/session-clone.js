// Clone workspace modal + clipboard copy behavior
(function () {
  const openBtn = document.getElementById("clone-workspace-btn");
  const dialog = document.getElementById("clone-workspace-dialog");
  const closeBtn = document.getElementById("clone-workspace-close");
  const commandEl = document.getElementById("clone-workspace-command");
  const statusEl = document.getElementById("clone-workspace-copy-status");

  if (!openBtn || !dialog || !closeBtn || !commandEl) {
    return;
  }

  const command = commandEl.dataset.command || commandEl.textContent || "";

  function setStatus(message, color) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = color;
  }

  async function copyCommand() {
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

  commandEl.addEventListener("click", copyCommand);
})();
