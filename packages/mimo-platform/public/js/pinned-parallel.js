// SPDX-License-Identifier: AGPL-3.0-only
// Active-column focus tracking + unpin wiring for the `/pinned` parallel view.
// Listens to `focus`/`blur` on each iframe and toggles a `focused` class on
// the column wrapper. Handles `mimo:pinned-parallel-unpin` events by
// DELETE-ing the pin and removing the column from the DOM.
//
// The JWT `token` cookie is HttpOnly; fetches rely on the browser sending it
// automatically (the internal auth middleware honors the `token` cookie).
(function () {
  "use strict";

  function username() {
    var m = document.cookie.match(/username=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : "me";
  }

  var columns = document.querySelectorAll(".pinned-parallel-column");
  columns.forEach(function (col) {
    var iframe = col.querySelector(".pinned-parallel-column-iframe");
    if (!iframe) return;
    iframe.addEventListener("focus", function () {
      columns.forEach(function (c) { c.classList.remove("focused"); });
      col.classList.add("focused");
    });
    iframe.addEventListener("blur", function () {
      // Keep the previous column highlighted until another claims focus;
      // the focus handler above clears siblings.
    });
  });

  document.addEventListener("mimo:pinned-parallel-unpin", async function (e) {
    var sessionId = e.detail && e.detail.sessionId;
    if (!sessionId) return;
    await fetch(
      "/api/internal/users/" +
        encodeURIComponent(username()) +
        "/pinned-sessions/" +
        encodeURIComponent(sessionId),
      { method: "DELETE", credentials: "same-origin" },
    );
    // Reload the page so the chip set and active-group filter re-derive
    // from the user's current pin list (a removed pin can collapse a chip).
    window.location.reload();
  });

  function cssEscape(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/"/g, '\\"');
  }
})();