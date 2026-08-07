// SPDX-License-Identifier: AGPL-3.0-only
// Client behavior for the session-page pin checkbox + inline group picker.
// Listens for `mimo:pin-toggle` events dispatched by the checkbox onchange
// handler and POSTs/DELETEs against the pin endpoint, updating the checkbox
// state and surfacing cap-reached errors inline.
//
// The JWT `token` cookie is HttpOnly (not readable from JS), so pin calls
// rely on the browser sending the cookie automatically on same-origin
// fetches. The `username` cookie is non-HttpOnly and read here to address
// the per-user pin endpoint.
(function () {
  "use strict";

  // In embed mode the session page is rendered inside a same-origin iframe
  // and the pin slot is omitted entirely. Nothing to wire up.
  if (
    !document.getElementById("session-pin-checkbox") &&
    !document.getElementById("pin-groups-root")
  ) {
    return;
  }

  function username() {
    var m = document.cookie.match(/username=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "me";
  }

  function setError(msg) {
    var el = document.getElementById("pin-error-inline");
    if (!el) return;
    el.textContent = msg || "";
    if (msg) {
      setTimeout(function () {
        if (el.textContent === msg) el.textContent = "";
      }, 4000);
    }
  }

  // Returns true if the response indicates the user is authenticated.
  // 401 means no valid cookie was sent; surface a friendly error.
  function isAuthFailure(res) {
    return res.status === 401;
  }

  function pinUrl() {
    return (
      "/api/internal/users/" +
      encodeURIComponent(username()) +
      "/pinned-sessions"
    );
  }

  function pinUrlForSession(sessionId) {
    return pinUrl() + "/" + encodeURIComponent(sessionId);
  }

  async function fetchPins() {
    var res = await fetch(pinUrl(), { credentials: "same-origin" });
    if (!res.ok) return [];
    var json = await res.json().catch(function () {
      return null;
    });
    if (!json || !json.data || !Array.isArray(json.data.pins)) return [];
    return json.data.pins;
  }

  function readInitialGroups() {
    var root = document.getElementById("pin-groups-root");
    if (!root) return [];
    var raw = root.getAttribute("data-pin-groups") || "[]";
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter(function (s) {
            return typeof s === "string";
          })
        : [];
    } catch (e) {
      return [];
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      switch (c) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
      }
      return c;
    });
  }

  function closeTypeahead() {
    var ta = document.getElementById("pin-group-typeahead");
    if (ta) ta.remove();
  }

  function renderChip(group) {
    var chip = document.createElement("span");
    chip.className = "pin-group-chip";
    chip.dataset.group = group;
    chip.innerHTML =
      '<span class="pin-group-chip-label">' +
      escapeHtml(group) +
      "</span>" +
      '<button type="button" class="pin-group-chip-remove" ' +
      'data-remove-group="' +
      escapeHtml(group) +
      '" ' +
      'aria-label="Remove group ' +
      escapeHtml(group) +
      '">&times;</button>';
    return chip;
  }

  function renderAddControl() {
    var add = document.createElement("span");
    add.className = "pin-group-add";
    add.innerHTML =
      '<button type="button" class="pin-group-add-btn" ' +
      'data-add-group="1" ' +
      'aria-label="Add group">+ add group</button>';
    return add;
  }

  function renderEmptyHint() {
    var hint = document.createElement("span");
    hint.className = "pin-group-empty-hint";
    hint.textContent = "pin a group to organize this session";
    return hint;
  }

  function groupsForCurrentSession(pins) {
    var sessionId = currentSessionId();
    return pins
      .filter(function (p) {
        return p.sessionId === sessionId;
      })
      .map(function (p) {
        return p.group;
      });
  }

  function distinctGroups(pins) {
    // Deduplicate case-insensitively, preserve first-seen casing, sorted.
    var seen = {};
    var result = [];
    pins.forEach(function (p) {
      var key = String(p.group).toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      result.push(p.group);
    });
    result.sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    return result;
  }

  function currentSessionId() {
    var root = document.getElementById("pin-groups-root");
    if (root) {
      var sid = root.getAttribute("data-session-id");
      if (sid) return sid;
    }
    var cb = document.getElementById("session-pin-checkbox");
    return cb ? cb.getAttribute("data-session-id") || "" : "";
  }

  function currentProjectId() {
    var root = document.getElementById("pin-groups-root");
    if (root) {
      var pid = root.getAttribute("data-project-id");
      if (pid) return pid;
    }
    var cb = document.getElementById("session-pin-checkbox");
    return cb ? cb.getAttribute("data-project-id") || "" : "";
  }

  function setChecked(checked) {
    var cb = document.getElementById("session-pin-checkbox");
    if (cb) cb.checked = !!checked;
  }

  function renderPicker(pins) {
    var root = document.getElementById("pin-groups-root");
    if (!root) return;
    closeTypeahead();
    var groups = groupsForCurrentSession(pins);
    root.innerHTML = "";
    if (groups.length === 0) {
      // When the checkbox is checked but no chips exist, show a hint
      // pointing the user at the "+ add group" affordance.
      if (
        document.getElementById("session-pin-checkbox") &&
        document.getElementById("session-pin-checkbox").checked
      ) {
        root.appendChild(renderEmptyHint());
        root.appendChild(renderAddControl());
      }
      return;
    }
    groups.forEach(function (g) {
      root.appendChild(renderChip(g));
    });
    root.appendChild(renderAddControl());
  }

  async function refreshPicker() {
    var pins = await fetchPins();
    setChecked(groupsForCurrentSession(pins).length > 0);
    renderPicker(pins);
    return pins;
  }

  async function addPin(sessionId, projectId, group) {
    var res = await fetch(pinUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        sessionId: sessionId,
        projectId: projectId,
        group: group,
      }),
    });
    if (isAuthFailure(res)) {
      setError("Not authenticated");
      return false;
    }
    if (res.status === 409) {
      var data = await res.json().catch(function () {
        return {};
      });
      setError("Pin limit reached (" + (data.limit || 5) + ")");
      return false;
    }
    if (!res.ok) {
      setError("Failed to pin session");
      return false;
    }
    return true;
  }

  async function removePin(sessionId, group) {
    var url = pinUrlForSession(sessionId);
    if (group !== undefined && group !== null) {
      url += "?group=" + encodeURIComponent(group);
    }
    var res = await fetch(url, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (isAuthFailure(res)) {
      setError("Not authenticated");
      return false;
    }
    if (!res.ok && res.status !== 204) {
      setError("Failed to unpin session");
      return false;
    }
    return true;
  }

  function openTypeahead(pins) {
    closeTypeahead();
    var root = document.getElementById("pin-groups-root");
    if (!root) return;
    var sessionId = currentSessionId();
    var projectId = currentProjectId();
    var current = groupsForCurrentSession(pins);
    var distinct = distinctGroups(pins).filter(function (g) {
      return current.indexOf(g) === -1;
    });

    var ta = document.createElement("div");
    ta.id = "pin-group-typeahead";
    ta.className = "pin-group-typeahead";

    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "group name";
    input.className = "pin-group-typeahead-input";
    input.setAttribute("autocomplete", "off");

    var list = document.createElement("div");
    list.className = "pin-group-typeahead-list";

    function paintList(filter) {
      list.innerHTML = "";
      var f = (filter || "").toLowerCase();
      distinct
        .filter(function (g) {
          return g.toLowerCase().indexOf(f) !== -1;
        })
        .forEach(function (g) {
          var opt = document.createElement("button");
          opt.type = "button";
          opt.className = "pin-group-typeahead-option";
          opt.dataset.suggest = g;
          opt.textContent = g;
          opt.addEventListener("mousedown", function (e) {
            e.preventDefault();
            commit(g);
          });
          list.appendChild(opt);
        });
      // If the typed text doesn't match any existing group, show a "create
      // new" option row. We commit on Enter only; clicking isn't a thing for
      // a synthetic option, so this is just a hint.
      if (
        filter &&
        filter.trim().length > 0 &&
        distinct.every(function (g) {
          return g.toLowerCase() !== f;
        })
      ) {
        var create = document.createElement("div");
        create.className = "pin-group-typeahead-create-hint";
        create.textContent = 'press Enter to create "' + filter.trim() + '"';
        list.appendChild(create);
      }
    }
    paintList("");

    input.addEventListener("input", function () {
      paintList(input.value);
    });

    async function commit(value) {
      var name = (value || input.value || "").trim();
      if (!name) {
        closeTypeahead();
        return;
      }
      input.disabled = true;
      var ok = await addPin(sessionId, projectId, name);
      input.disabled = false;
      if (!ok) {
        closeTypeahead();
        return;
      }
      closeTypeahead();
      await refreshPicker();
    }

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        commit(input.value);
      } else if (e.key === "Escape") {
        closeTypeahead();
      }
    });

    ta.appendChild(input);
    ta.appendChild(list);
    root.appendChild(ta);
    input.focus();
  }

  function isClickInPicker(target) {
    var root = document.getElementById("pin-groups-root");
    return root && root.contains(target);
  }

  function attachPicker() {
    var root = document.getElementById("pin-groups-root");
    if (!root) return;

    root.addEventListener("click", async function (e) {
      var removeBtn =
        e.target.closest && e.target.closest(".pin-group-chip-remove");
      if (removeBtn) {
        e.preventDefault();
        var group = removeBtn.getAttribute("data-remove-group") || "";
        var sessionId = currentSessionId();
        await removePin(sessionId, group);
        await refreshPicker();
        return;
      }
      var addBtn = e.target.closest && e.target.closest(".pin-group-add-btn");
      if (addBtn) {
        e.preventDefault();
        var pins = await fetchPins();
        openTypeahead(pins);
        return;
      }
    });

    document.addEventListener("click", function (e) {
      var ta = document.getElementById("pin-group-typeahead");
      if (!ta) return;
      if (ta.contains(e.target)) return;
      if (isClickInPicker(e.target)) return;
      closeTypeahead();
    });
  }

  // Initial render uses the data-pin-groups attribute server-rendered into
  // the root element so chips appear before the first network round-trip.
  function initialRender() {
    var initial = readInitialGroups();
    var root = document.getElementById("pin-groups-root");
    if (!root) return;
    root.innerHTML = "";
    if (initial.length === 0) {
      // Don't render anything when the session is not pinned yet — the
      // checkbox itself is the affordance to pin.
      return;
    }
    initial.forEach(function (g) {
      root.appendChild(renderChip(g));
    });
    root.appendChild(renderAddControl());
  }

  document.addEventListener("mimo:pin-toggle", async function (e) {
    var detail = e.detail || {};
    var checkbox = document.getElementById("session-pin-checkbox");
    if (!checkbox) return;
    var sessionId = detail.sessionId || currentSessionId();
    var projectId = detail.projectId || currentProjectId();
    if (!sessionId || !projectId) return;
    if (detail.checked) {
      // Pin with default group; the user can add more groups via the picker.
      var ok = await addPin(sessionId, projectId, "Ungrouped");
      checkbox.checked = ok;
      if (ok) {
        await refreshPicker();
      }
    } else {
      // Unpin all groups for this session.
      var ok2 = await removePin(sessionId);
      checkbox.checked = !ok2;
      if (ok2) {
        await refreshPicker();
      }
    }
  });

  attachPicker();
  initialRender();
})();
