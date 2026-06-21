(function () {
  "use strict";

  // Minimum visible height (px) for a tick so single-line changes stay visible.
  var MIN_TICK_PX = 3;

  // Walk the rendered rows once and collapse runs of changed lines into hunks.
  // `classify(row, index)` returns "added" | "removed" | "unchanged".
  function collectHunks(rows, classify) {
    var hunks = [];
    var start = -1;
    var hasAdded = false;
    var hasRemoved = false;

    function flush(end) {
      if (start === -1) return;
      var type =
        hasAdded && hasRemoved ? "mixed" : hasAdded ? "added" : "removed";
      hunks.push({ startIndex: start, endIndex: end, type: type });
      start = -1;
      hasAdded = false;
      hasRemoved = false;
    }

    for (var i = 0; i < rows.length; i++) {
      var c = classify(rows[i], i);
      if (c === "added" || c === "removed") {
        if (start === -1) start = i;
        if (c === "added") hasAdded = true;
        else hasRemoved = true;
      } else {
        flush(i - 1);
      }
    }
    flush(rows.length - 1);

    return hunks;
  }

  // Rows are fixed-height, so position is linear in row index.
  function tickGeometry(
    startIndex,
    endIndex,
    totalRows,
    trackHeight,
    minTickPx,
  ) {
    var min = minTickPx == null ? MIN_TICK_PX : minTickPx;
    if (!totalRows || totalRows <= 0) {
      return { top: 0, height: min };
    }
    var top = (startIndex / totalRows) * trackHeight;
    var rawHeight = ((endIndex - startIndex + 1) / totalRows) * trackHeight;
    return { top: top, height: Math.max(min, rawHeight) };
  }

  // Pure navigation state over a hunk list. `onSelect(hunk, index)` fires on
  // next()/prev()/select(). Keeps the "current" hunk for the "n / N" counter.
  function createController(initialHunks, onSelect) {
    var hunks = initialHunks ? initialHunks.slice() : [];
    var current = 0;

    function fire() {
      if (typeof onSelect === "function" && hunks.length) {
        onSelect(hunks[current], current);
      }
    }

    return {
      next: function () {
        if (!hunks.length) return;
        current = (current + 1) % hunks.length;
        fire();
      },
      prev: function () {
        if (!hunks.length) return;
        current = (current - 1 + hunks.length) % hunks.length;
        fire();
      },
      select: function (index) {
        if (index < 0 || index >= hunks.length) return;
        current = index;
        fire();
      },
      count: function () {
        return { index: hunks.length ? current + 1 : 0, total: hunks.length };
      },
      currentHunk: function () {
        return hunks.length ? hunks[current] : null;
      },
      setHunks: function (next) {
        hunks = next ? next.slice() : [];
        current = 0;
      },
    };
  }

  // Attach an overview track to a scrollable diff surface (DOM side-effects).
  // options: { scrollEl, trackEl, totalRows, hunks, counterEl, onScrollToHunk }
  function attach(options) {
    var scrollEl = options.scrollEl;
    var trackEl = options.trackEl;
    var counterEl = options.counterEl || null;
    var totalRows = options.totalRows || 0;
    var hunks = options.hunks || [];

    var rafPending = false;
    var thumbEl = null;

    function rowHeight() {
      if (!totalRows) return 0;
      return scrollEl.scrollHeight / totalRows;
    }

    function scrollToHunk(hunk) {
      if (!hunk) return;
      var rh = rowHeight();
      var target = hunk.startIndex * rh - scrollEl.clientHeight / 3;
      var maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (target < 0) target = 0;
      if (target > maxScroll) target = maxScroll;
      scrollEl.scrollTop = target;
      if (typeof options.onScrollToHunk === "function") {
        options.onScrollToHunk(hunk);
      }
    }

    var controller = createController(hunks, function (hunk) {
      scrollToHunk(hunk);
      renderCounter();
    });

    function renderCounter() {
      if (!counterEl) return;
      var c = controller.count();
      counterEl.textContent = c.index + " / " + c.total;
    }

    function renderTicks() {
      trackEl.innerHTML = "";
      var trackHeight = trackEl.clientHeight || trackEl.offsetHeight || 0;
      hunks.forEach(function (hunk, index) {
        var geo = tickGeometry(
          hunk.startIndex,
          hunk.endIndex,
          totalRows,
          trackHeight,
        );
        var tick = document.createElement("div");
        tick.className = "diff-overview-tick diff-overview-tick--" + hunk.type;
        tick.style.top = geo.top + "px";
        tick.style.height = geo.height + "px";
        tick.setAttribute("data-hunk-index", String(index));
        tick.addEventListener("click", function () {
          controller.select(index);
        });
        trackEl.appendChild(tick);
      });

      thumbEl = document.createElement("div");
      thumbEl.className = "diff-overview-thumb";
      trackEl.appendChild(thumbEl);
      updateThumb();
    }

    function updateThumb() {
      if (!thumbEl) return;
      var trackHeight = trackEl.clientHeight || trackEl.offsetHeight || 0;
      var scrollHeight = scrollEl.scrollHeight || 1;
      var top = (scrollEl.scrollTop / scrollHeight) * trackHeight;
      var height = (scrollEl.clientHeight / scrollHeight) * trackHeight;
      thumbEl.style.top = top + "px";
      thumbEl.style.height = height + "px";
    }

    function onScroll() {
      if (rafPending) return;
      rafPending = true;
      var raf =
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame
          : function (fn) {
              return setTimeout(fn, 16);
            };
      raf(function () {
        rafPending = false;
        updateThumb();
      });
    }

    scrollEl.addEventListener("scroll", onScroll);
    renderTicks();
    renderCounter();

    return {
      next: function () {
        controller.next();
      },
      prev: function () {
        controller.prev();
      },
      count: function () {
        return controller.count();
      },
      refresh: function (nextHunks, nextTotalRows) {
        hunks = nextHunks || [];
        totalRows = nextTotalRows || 0;
        controller.setHunks(hunks);
        renderTicks();
        renderCounter();
      },
      destroy: function () {
        scrollEl.removeEventListener("scroll", onScroll);
        trackEl.innerHTML = "";
        thumbEl = null;
      },
    };
  }

  var MIMO_DIFF_OVERVIEW = {
    MIN_TICK_PX: MIN_TICK_PX,
    collectHunks: collectHunks,
    tickGeometry: tickGeometry,
    createController: createController,
    attach: attach,
  };

  if (typeof window !== "undefined") {
    window.MIMO_DIFF_OVERVIEW = MIMO_DIFF_OVERVIEW;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MIMO_DIFF_OVERVIEW;
  }
})();
