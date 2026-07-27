// SPDX-License-Identifier: AGPL-3.0-only
// Client behavior for the session-page pin checkbox.
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

  async function addPin(sessionId, projectId) {
    var res = await fetch(
      "/api/internal/users/" + encodeURIComponent(username()) + "/pinned-sessions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ sessionId: sessionId, projectId: projectId }),
      },
    );
    if (isAuthFailure(res)) {
      setError("Not authenticated");
      return false;
    }
    if (res.status === 409) {
      var data = await res.json().catch(function () { return {}; });
      setError("Pin limit reached (" + (data.limit || 5) + ")");
      return false;
    }
    if (!res.ok) {
      setError("Failed to pin session");
      return false;
    }
    return true;
  }

  async function removePin(sessionId) {
    var res = await fetch(
      "/api/internal/users/" +
        encodeURIComponent(username()) +
        "/pinned-sessions/" +
        encodeURIComponent(sessionId),
      {
        method: "DELETE",
        credentials: "same-origin",
      },
    );
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

  document.addEventListener("mimo:pin-toggle", async function (e) {
    var detail = e.detail || {};
    var checkbox = document.getElementById("session-pin-checkbox");
    if (!checkbox) return;
    var sessionId = detail.sessionId;
    var projectId = detail.projectId;
    if (!sessionId || !projectId) return;
    if (detail.checked) {
      var ok = await addPin(sessionId, projectId);
      checkbox.checked = ok;
    } else {
      var ok2 = await removePin(sessionId);
      checkbox.checked = !ok2;
    }
  });
})();