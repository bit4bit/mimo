// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Terminal buffer client-side module.
 *
 * UI follows the same pattern as ChatThreadsBuffer:
 * - Tab bar with + button and per-terminal tabs
 * - Context bar with terminal info and Delete button
 * - xterm.js container below
 *
 * Handles:
 * - New terminal creation dialog (agent selector, subpath, scrollback)
 * - xterm.js initialization with WebSocket connection
 * - Terminal tab switching and deletion
 */

(function () {
  "use strict";

  let xtermInstance = null;
  let fitAddon = null;
  let resizeObserver = null;
  let terminalWs = null;
  let activeTerminalId = null;
  let terminalState = {
    terminals: [],
  };

  function getSessionId() {
    const container = document.querySelector(".terminal-threads-container");
    return container?.dataset?.sessionId || "";
  }

  function activeStorageKey() {
    return `mimo.terminal.active.${getSessionId()}`;
  }

  function getStoredActiveTerminalId() {
    try {
      return window.localStorage.getItem(activeStorageKey()) || null;
    } catch {
      return null;
    }
  }

  function setStoredActiveTerminalId(terminalId) {
    try {
      window.localStorage.setItem(activeStorageKey(), terminalId);
    } catch {
      // storage unavailable; re-attach falls back to first active terminal
    }
  }

  function clearStoredActiveTerminalId() {
    try {
      window.localStorage.removeItem(activeStorageKey());
    } catch {
      // ignore
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function fetchOnlineAgents() {
    try {
      const res = await fetch("/agents/list?status=online");
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  async function fetchTerminals() {
    const sessionId = getSessionId();
    if (!sessionId) return [];
    const res = await fetch(
      `/projects/any/sessions/${sessionId}/terminals`,
      { credentials: "same-origin" },
    ).catch(() => null);
    if (!res || !res.ok) return [];
    const data = await res.json();
    return data.terminals || [];
  }

  async function createTerminal(name, assignedAgentId, command, subpath, scrollback, cols, rows) {
    const sessionId = getSessionId();
    const res = await fetch(
      `/projects/any/sessions/${sessionId}/terminals`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name, assignedAgentId, command, subpath, scrollback, cols, rows }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create terminal");
    }
    return res.json();
  }

  async function deleteTerminal(terminalId) {
    const sessionId = getSessionId();
    const res = await fetch(
      `/projects/any/sessions/${sessionId}/terminals/${terminalId}`,
      {
        method: "DELETE",
        credentials: "same-origin",
      },
    );
    return res.ok;
  }

  async function showCreateTerminalDialog() {
    if (document.querySelector("#create-terminal-dialog")) return;

    const agents = await fetchOnlineAgents();

    let defaultCols = 80;
    let defaultRows = 24;
    if (fitAddon && typeof fitAddon.proposeDimensions === "function") {
      const dims = fitAddon.proposeDimensions();
      if (dims && dims.cols > 0 && dims.rows > 0) {
        defaultCols = dims.cols;
        defaultRows = dims.rows;
      }
    }

    const dialog = document.createElement("div");
    dialog.id = "create-terminal-dialog";
    dialog.className = "modal";
    dialog.style.cssText =
      "position:fixed;z-index:1000;left:0;top:0;width:100%;height:100%;background-color:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;";

    const selectStyle =
      "width:100%;padding:8px;background:#1a1a1a;border:1px solid #444;color:#d4d4d4;font-family:monospace;font-size:13px;border-radius:3px;box-sizing:border-box;";

    const agentOptions = agents.length
      ? ['<option value="" disabled selected>Select an agent</option>']
          .concat(
            agents.map(
              (a) =>
                `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`,
            ),
          )
          .join("")
      : '<option value="" disabled selected>No online agents available</option>';

    dialog.innerHTML = `
      <div style="background:#2d2d2d;padding:24px;border-radius:8px;min-width:400px;max-width:500px;">
        <h2 style="margin:0 0 16px;color:#d4d4d4;font-size:18px;">New Terminal</h2>
        <div style="margin-bottom:12px;">
          <label style="display:block;margin-bottom:4px;color:#888;font-size:12px;text-transform:uppercase;">Name</label>
          <input id="terminal-name-input" type="text" placeholder="my-shell"
            style="${selectStyle}" />
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block;margin-bottom:4px;color:#888;font-size:12px;text-transform:uppercase;">Agent</label>
          <select id="terminal-agent-select" style="${selectStyle}">
            ${agentOptions}
          </select>
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block;margin-bottom:4px;color:#888;font-size:12px;text-transform:uppercase;">Command</label>
          <input id="terminal-command-input" type="text" value="/bin/sh" placeholder="/bin/sh"
            style="${selectStyle}" />
        </div>
        <div style="margin-bottom:12px;">
          <label style="display:block;margin-bottom:4px;color:#888;font-size:12px;text-transform:uppercase;">Folder (optional)</label>
          <input id="terminal-subpath-input" type="text" placeholder="(root)"
            style="${selectStyle}" />
        </div>
        <div style="margin-bottom:16px;">
          <label style="display:block;margin-bottom:4px;color:#888;font-size:12px;text-transform:uppercase;">Scrollback (lines)</label>
          <input id="terminal-scrollback-input" type="number" value="1000" min="1"
            style="${selectStyle}" />
        </div>
        <div style="margin-bottom:16px;display:flex;gap:8px;">
          <div style="flex:1;">
            <label style="display:block;margin-bottom:4px;color:#888;font-size:12px;text-transform:uppercase;">Columns</label>
            <input id="terminal-cols-input" type="number" value="${defaultCols}" min="1"
              style="${selectStyle}" />
          </div>
          <div style="flex:1;">
            <label style="display:block;margin-bottom:4px;color:#888;font-size:12px;text-transform:uppercase;">Rows</label>
            <input id="terminal-rows-input" type="number" value="${defaultRows}" min="1"
              style="${selectStyle}" />
          </div>
        </div>
        <div id="terminal-create-error" style="color:#f85149;font-size:12px;margin-bottom:8px;display:none;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button id="terminal-cancel-btn" type="button"
            style="padding:8px 16px;background:#444;color:#d4d4d4;border:none;border-radius:3px;cursor:pointer;">Cancel</button>
          <button id="terminal-create-btn" type="button"
            style="padding:8px 16px;background:#74c0fc;color:#000;border:none;border-radius:3px;cursor:pointer;">Create</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    function closeDialog() {
      dialog.remove();
    }

    function showError(msg) {
      const err = dialog.querySelector("#terminal-create-error");
      err.textContent = msg;
      err.style.display = "block";
    }

    dialog.querySelector("#terminal-cancel-btn").addEventListener("click", closeDialog);

    dialog.querySelector("#terminal-create-btn").addEventListener("click", async () => {
      const name = dialog.querySelector("#terminal-name-input").value.trim();
      const agentId = dialog.querySelector("#terminal-agent-select").value;
      const command = dialog.querySelector("#terminal-command-input").value.trim();
      const subpath = dialog.querySelector("#terminal-subpath-input").value.trim();
      const scrollback = parseInt(dialog.querySelector("#terminal-scrollback-input").value, 10);
      const cols = parseInt(dialog.querySelector("#terminal-cols-input").value, 10);
      const rows = parseInt(dialog.querySelector("#terminal-rows-input").value, 10);

      if (!name) {
        showError("Name is required");
        return;
      }
      if (!agentId) {
        showError("Agent is required");
        return;
      }

      try {
        const terminal = await createTerminal(
          name,
          agentId,
          command || "/bin/sh",
          subpath || undefined,
          scrollback || 1000,
          cols || 80,
          rows || 24,
        );
        closeDialog();
        await refreshTerminals();
        if (terminal && terminal.id) {
          await switchToTerminal(terminal.id);
        }
      } catch (err) {
        showError(err.message || "Failed to create terminal");
      }
    });
  }

  async function refreshTerminals() {
    terminalState.terminals = await fetchTerminals();
    renderTerminalTabs();
    renderContextBar();

    const emptyState = document.getElementById("terminal-empty-state");
    const container = document.getElementById("terminal-xterm-container");
    if (terminalState.terminals.length === 0) {
      if (emptyState) emptyState.style.display = "flex";
      if (container) container.style.display = "none";
    } else {
      if (emptyState) emptyState.style.display = "none";
      if (container) container.style.display = "block";
    }
  }

  function renderTerminalTabs() {
    const tabsContainer = document.querySelector(".terminal-threads-tabs");
    if (!tabsContainer) return;

    // Keep the + button, remove old tabs
    const plusBtn = document.getElementById("create-terminal-btn");
    tabsContainer.innerHTML = "";
    if (plusBtn) {
      tabsContainer.appendChild(plusBtn);
    }

    terminalState.terminals.forEach((t) => {
      const icon = t.state === "dead" ? "🔴" : "🟢";
      const title =
        t.state === "dead"
          ? "Terminal process has exited"
          : "Terminal is active";

      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `terminal-thread-tab ${t.id === activeTerminalId ? "active" : ""}`;
      tab.dataset.terminalId = t.id;

      const indicator = document.createElement("span");
      indicator.className = "terminal-status-indicator";
      indicator.dataset.terminalState = t.state;
      indicator.title = title;
      indicator.textContent = icon;

      tab.appendChild(indicator);
      tab.appendChild(document.createTextNode(t.name));

      tab.addEventListener("click", () => {
        switchToTerminal(t.id);
      });

      tabsContainer.appendChild(tab);
    });
  }

  function renderContextBar() {
    const contextBar = document.querySelector(".terminal-context-bar");
    if (!contextBar) return;

    const activeTerminal =
      terminalState.terminals.find((t) => t.id === activeTerminalId) ??
      terminalState.terminals.find((t) => t.state === "active") ??
      terminalState.terminals[0];

    if (!activeTerminal) {
      contextBar.innerHTML =
        '<div class="text-small text-muted">No active terminal. Use + to get started.</div>';
      return;
    }

    let html = `
      <div class="terminal-context-item text-muted">
        Terminal: <span class="text-primary">${escapeHtml(activeTerminal.name)}</span>
      </div>
      <div class="terminal-context-item text-muted">
        Command: <span class="text-primary">${escapeHtml(activeTerminal.command)}</span>
      </div>
    `;

    if (activeTerminal.subpath) {
      html += `
        <div class="terminal-context-item text-muted">
          Folder: <span class="text-primary">${escapeHtml(activeTerminal.subpath)}</span>
        </div>
      `;
    }

    html += `
      <div class="terminal-context-item text-muted">
        Scrollback: <span class="text-primary">${activeTerminal.scrollback}</span>
      </div>
    `;

    html += `
      <div class="flex-grow"></div>
      <button
        type="button"
        id="delete-terminal-btn"
        data-terminal-id="${activeTerminal.id}"
        class="terminal-delete-btn"
        title="Delete this terminal"
      >Delete</button>
    `;

    contextBar.innerHTML = html;

    const deleteBtn = document.getElementById("delete-terminal-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        handleDeleteTerminal(activeTerminal.id);
      });
    }
  }

  async function switchToTerminal(terminalId) {
    if (activeTerminalId === terminalId && xtermInstance) {
      renderTerminalTabs();
      renderContextBar();
      fitXterm();
      return;
    }

    disposeXterm();

    activeTerminalId = terminalId;
    setStoredActiveTerminalId(terminalId);
    const terminal = terminalState.terminals.find((t) => t.id === terminalId);
    if (!terminal) return;

    renderTerminalTabs();
    renderContextBar();
    initXterm(terminal);
  }

  function initXterm(terminal) {
    const container = document.getElementById("terminal-xterm-container");
    if (!container) return;

    if (typeof Terminal === "undefined") {
      console.error("[terminal] xterm.js not loaded");
      return;
    }

    const scrollback = terminal.scrollback || 1000;
    xtermInstance = new Terminal({
      scrollback: scrollback,
      cols: terminal.cols || 80,
      rows: terminal.rows || 24,
      cursorBlink: true,
      fontFamily: "monospace",
      fontSize: 13,
    });

    if (typeof FitAddon !== "undefined") {
      fitAddon = new FitAddon.FitAddon();
      xtermInstance.loadAddon(fitAddon);
    }

    xtermInstance.open(container);

    fitXterm();

    resizeObserver = new ResizeObserver(() => fitXterm());
    resizeObserver.observe(container);

    const sessionId = getSessionId();
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/terminal/${sessionId}/${terminal.id}`;

    terminalWs = new WebSocket(wsUrl);
    terminalWs.binaryType = "arraybuffer";

    console.log("[terminal] WS connecting to", wsUrl);

    let wsClosedByExit = false;

    terminalWs.onopen = () => {
      console.log("[terminal] WS connected");
    };

    terminalWs.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        console.log("[terminal] received binary:", event.data.byteLength, "bytes");
        xtermInstance.write(new Uint8Array(event.data));
      } else {
        console.log("[terminal] received text:", event.data);
        const msg = JSON.parse(event.data);
        if (msg.type === "terminal_exited") {
          xtermInstance.write(`\r\n[Process exited with code ${msg.exitCode}]\r\n`);
          wsClosedByExit = true;
          if (terminalWs) {
            terminalWs.close();
            terminalWs = null;
          }
        }
      }
    };

    terminalWs.onerror = (err) => {
      console.error("[terminal] WS error:", err);
    };

    terminalWs.onclose = (event) => {
      console.log("[terminal] WS closed:", event.code, event.reason);
      if (xtermInstance && !wsClosedByExit) {
        xtermInstance.write("\r\n[Connection closed]\r\n");
      }
      wsClosedByExit = false;
    };

    xtermInstance.onData((data) => {
      if (terminalWs && terminalWs.readyState === WebSocket.OPEN) {
        console.log("[terminal] sending stdin:", JSON.stringify(data));
        terminalWs.send(data);
      }
    });
  }

  function fitXterm() {
    const container = document.getElementById("terminal-xterm-container");
    if (!fitAddon || !container || container.offsetParent === null) return;
    try {
      fitAddon.fit();
    } catch {
      // container may not be measurable yet
    }
  }

  function disposeXterm() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    fitAddon = null;
    if (terminalWs) {
      terminalWs.close();
      terminalWs = null;
    }
    if (xtermInstance) {
      xtermInstance.dispose();
      xtermInstance = null;
    }
    activeTerminalId = null;
  }

  async function handleDeleteTerminal(terminalId) {
    if (!confirm("Delete this terminal?")) return;
    await deleteTerminal(terminalId);
    if (activeTerminalId === terminalId) {
      disposeXterm();
    }
    if (getStoredActiveTerminalId() === terminalId) {
      clearStoredActiveTerminalId();
    }
    await refreshTerminals();
  }

  function resolveReattachTargetId() {
    const terminals = terminalState.terminals;
    if (terminals.length === 0) return null;

    const storedId = getStoredActiveTerminalId();
    if (storedId) {
      const stored = terminals.find(
        (t) => t.id === storedId && t.state !== "dead",
      );
      if (stored) return stored.id;
    }

    const firstActive = terminals.find((t) => t.state === "active");
    return firstActive ? firstActive.id : null;
  }

  async function init() {
    const createBtn = document.getElementById("create-terminal-btn");
    if (createBtn) {
      createBtn.addEventListener("click", showCreateTerminalDialog);
    }

    await refreshTerminals();

    const targetId = resolveReattachTargetId();
    if (targetId) {
      await switchToTerminal(targetId);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.MimoTerminal = {
    init,
    refreshTerminals,
    showCreateTerminalDialog,
    switchToTerminal,
    disposeXterm,
  };
})();