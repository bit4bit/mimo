// SPDX-License-Identifier: AGPL-3.0-only
// Client behavior for the global pinned-sessions drawer.
//
// Renders each pinned entry with a per-entry selection checkbox (default
// checked) and a title/branch link that navigates to the session page. The
// "View selected in parallel" action in the footer navigates to
// `/pinned?ids=<sid1,sid2,...>` carrying only the checked session ids, so
// the parallel view renders exactly the selected sessions.
//
// The JWT `token` cookie is HttpOnly (not readable from JS), so fetches rely
// on the browser sending the cookie automatically on same-origin requests
// (the internal auth middleware honors the `token` cookie as a fallback).
(function () {
  "use strict";

  var root = document.getElementById("pinned-drawer-root");
  var list = document.getElementById("pinned-drawer-list");
  var parallelLink = document.getElementById("pinned-drawer-parallel-link");
  if (!root || !list) return;

  // selection[sessionId] = boolean (true = show in parallel view).
  // Defaults to true (checked) for every entry as it renders.
  var selection = {};

  function username() {
    var m = document.cookie.match(/username=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "me";
  }

  function open() {
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    document.addEventListener("keydown", onKey);
    selection = {};
    load();
  }
  function close() {
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }

  function emptyState() {
    list.innerHTML =
      '<div class="pinned-drawer-empty" id="pinned-drawer-empty">No pinned sessions yet</div>';
    updateParallelAction();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      switch (c) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        case "'": return "&#39;";
      }
      return c;
    });
  }

  function updateParallelAction() {
    if (!parallelLink) return;
    var checkedIds = Object.keys(selection).filter(function (id) {
      return selection[id];
    });
    var count = checkedIds.length;
    if (count === 0) {
      parallelLink.textContent = "View selected in parallel (0)";
      parallelLink.setAttribute("href", "/pinned?ids=");
    } else {
      parallelLink.textContent =
        "View selected in parallel (" + count + ")";
      parallelLink.setAttribute(
        "href",
        "/pinned?ids=" + checkedIds.map(encodeURIComponent).join(","),
      );
    }
  }

  function renderEntry(pin) {
    var outer = document.createElement("div");
    outer.className = "pinned-drawer-entry";
    outer.dataset.sessionId = pin.sessionId;

    var checkboxId = "pinned-drawer-cb-" + pin.sessionId;
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = checkboxId;
    cb.className = "pinned-drawer-entry-checkbox";
    cb.checked = true;
    cb.dataset.sessionId = pin.sessionId;
    cb.addEventListener("change", function () {
      selection[pin.sessionId] = cb.checked;
      updateParallelAction();
    });
    cb.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    var textCol = document.createElement("div");
    textCol.className = "pinned-drawer-entry-text";

    var titleSpan = document.createElement("span");
    titleSpan.className = "pinned-drawer-entry-title";
    if (pin.stale) {
      titleSpan.textContent = "session no longer exists";
    } else {
      titleSpan.textContent = pin.sessionTitle || "Untitled";
    }

    var branchSpan = document.createElement("span");
    branchSpan.className = "pinned-drawer-entry-branch";
    if (!pin.stale && pin.branch) {
      branchSpan.innerHTML = "&#8637; " + escapeHtml(pin.branch);
    }

    textCol.appendChild(titleSpan);
    textCol.appendChild(branchSpan);

    outer.appendChild(cb);
    outer.appendChild(textCol);

    function navigateToSession() {
      window.location.href =
        "/projects/" + encodeURIComponent(pin.projectId) +
        "/sessions/" + encodeURIComponent(pin.sessionId);
      close();
    }

    if (pin.stale) {
      var staleNote = document.createElement("span");
      staleNote.className = "pinned-drawer-entry-stale";
      staleNote.textContent = "This session was deleted.";
      textCol.appendChild(staleNote);
      var unpinBtn = document.createElement("button");
      unpinBtn.type = "button";
      unpinBtn.className = "pinned-drawer-entry-unpin";
      unpinBtn.textContent = "unpin";
      unpinBtn.dataset.unpin = pin.sessionId;
      unpinBtn.addEventListener("click", async function (e) {
        e.preventDefault();
        e.stopPropagation();
        await unpin(pin.sessionId);
        load();
      });
      textCol.appendChild(unpinBtn);
    } else {
      // Clicking the title/branch (not the checkbox) navigates.
      titleSpan.style.cursor = "pointer";
      branchSpan.style.cursor = "pointer";
      titleSpan.addEventListener("click", navigateToSession);
      branchSpan.addEventListener("click", navigateToSession);
    }

    selection[pin.sessionId] = true;
    return outer;
  }

  async function load() {
    var res = await fetch(
      "/api/internal/users/" + encodeURIComponent(username()) + "/pinned-sessions",
      { credentials: "same-origin" },
    );
    if (!res.ok) {
      emptyState();
      return;
    }
    var json = await res.json();
    var pins = (json && json.data && json.data.pins) || [];
    if (pins.length === 0) {
      emptyState();
      return;
    }
    list.innerHTML = "";
    selection = {};
    pins.forEach(function (p) {
      list.appendChild(renderEntry(p));
    });
    updateParallelAction();
  }

  async function unpin(sessionId) {
    await fetch(
      "/api/internal/users/" +
        encodeURIComponent(username()) +
        "/pinned-sessions/" +
        encodeURIComponent(sessionId),
      { method: "DELETE", credentials: "same-origin" },
    );
  }

  document.addEventListener("mimo:pinned-drawer-open", open);
  document.addEventListener("mimo:pinned-drawer-close", close);
  document.addEventListener("click", function (e) {
    if (root.hidden) return;
    // Close on outside-click (clicks not inside the drawer).
    var drawer = document.getElementById("pinned-drawer");
    if (drawer && !drawer.contains(e.target) && e.target.id !== "pinned-menu-btn") {
      close();
    }
  });
})();