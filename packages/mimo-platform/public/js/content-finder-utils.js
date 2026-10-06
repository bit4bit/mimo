(function () {
  "use strict";

  var DEFAULT_CONTEXT_LINES = 2;
  var MAX_CONTEXT_LINES = 10;

  function clampContextValue(value) {
    var parsed = parseInt(value, 10);
    if (isNaN(parsed)) return DEFAULT_CONTEXT_LINES;
    return Math.min(MAX_CONTEXT_LINES, Math.max(0, parsed));
  }

  function buildSearchUrl(sessionId, query, before, after) {
    return (
      "/sessions/" +
      sessionId +
      "/search?q=" +
      encodeURIComponent(query) +
      "&before=" +
      before +
      "&after=" +
      after
    );
  }

  function stripLineEnding(text) {
    return String(text || "").replace(/\r?\n$/, "");
  }

  // ripgrep reports match offsets in UTF-8 bytes; JS strings index UTF-16 units.
  function utf8OffsetToIndex(text, byteOffset) {
    var bytes = 0;
    var index = 0;
    while (index < text.length && bytes < byteOffset) {
      var codePoint = text.codePointAt(index);
      bytes +=
        codePoint < 0x80
          ? 1
          : codePoint < 0x800
            ? 2
            : codePoint < 0x10000
              ? 3
              : 4;
      index += codePoint > 0xffff ? 2 : 1;
    }
    return index;
  }

  function buildResultLines(result) {
    var before = result.before || [];
    var after = result.after || [];
    var text = stripLineEnding(result.text);
    var firstLine = result.line - before.length;

    return before
      .map(function (line, i) {
        return { lineNumber: firstLine + i, text: line, kind: "before" };
      })
      .concat([
        {
          lineNumber: result.line,
          text: text,
          kind: "match",
          matchStart: utf8OffsetToIndex(text, result.matchStart),
          matchEnd: utf8OffsetToIndex(text, result.matchEnd),
        },
      ])
      .concat(
        after.map(function (line, i) {
          return { lineNumber: result.line + 1 + i, text: line, kind: "after" };
        }),
      );
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderLineText(line) {
    if (line.kind !== "match") return escapeHtml(line.text);
    return (
      escapeHtml(line.text.slice(0, line.matchStart)) +
      '<mark class="cf-hit">' +
      escapeHtml(line.text.slice(line.matchStart, line.matchEnd)) +
      "</mark>" +
      escapeHtml(line.text.slice(line.matchEnd))
    );
  }

  function renderResultHtml(result, active) {
    var rows = buildResultLines(result)
      .map(function (line) {
        return (
          '<div class="cf-line ' +
          (line.kind === "match" ? "cf-match" : "cf-context") +
          '"><span class="cf-gutter">' +
          line.lineNumber +
          '</span><span class="cf-text">' +
          renderLineText(line) +
          "</span></div>"
        );
      })
      .join("");

    return (
      '<div class="cf-result' +
      (active ? " active" : "") +
      '"><div class="cf-path">' +
      escapeHtml(result.path + ":" + result.line) +
      "</div>" +
      rows +
      "</div>"
    );
  }

  var MIMO_CONTENT_FINDER_UTILS = {
    clampContextValue: clampContextValue,
    buildSearchUrl: buildSearchUrl,
    buildResultLines: buildResultLines,
    renderResultHtml: renderResultHtml,
  };

  if (typeof window !== "undefined") {
    window.MIMO_CONTENT_FINDER_UTILS = MIMO_CONTENT_FINDER_UTILS;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MIMO_CONTENT_FINDER_UTILS;
  }
})();
