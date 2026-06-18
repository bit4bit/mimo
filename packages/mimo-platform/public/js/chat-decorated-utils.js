"use strict";

// Pure decoration utility functions shared between chat.js (browser) and tests (Bun).
// No DOM or window dependencies.

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decorateInlineMarkup(escapedLine) {
  var protected_ = [];
  function protect(html) {
    var placeholder = "\x00P" + protected_.length + "\x00";
    protected_.push(html);
    return placeholder;
  }
  // 1. Code spans: `...` → <code> (protect content from further processing)
  var result = escapedLine.replace(/`([^`]+)`/g, function (match, inner) {
    return protect('<code class="decorated-code">`' + inner + "`</code>");
  });
  // 2. Bold: **...** or __...__
  result = result.replace(/\*\*([^*]+)\*\*/g, function (match, inner) {
    return protect('<b class="decorated-bold">**' + inner + "**</b>");
  });
  result = result.replace(/__([^_]+)__/g, function (match, inner) {
    return protect('<b class="decorated-bold">__' + inner + "__</b>");
  });
  // 3. Italic: *...* or _..._
  result = result.replace(
    /\*([^*]+)\*/g,
    '<i class="decorated-italic">*$1*</i>',
  );
  result = result.replace(
    /(?<![a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/g,
    '<i class="decorated-italic">_$1_</i>',
  );
  // 4. Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a class="decorated-link" href="$2" target="_blank" rel="noopener">[$1]($2)</a>',
  );
  // Restore all protected spans
  for (var i = 0; i < protected_.length; i++) {
    result = result.replace("\x00P" + i + "\x00", protected_[i]);
  }
  return result;
}

function buildDecoratedLines(text) {
  var lines = String(text || "").split("\n");
  var result = [];
  var inFence = false;
  var fenceLines = [];

  for (var idx = 0; idx < lines.length; idx++) {
    var line = lines[idx];
    if (/^```/.test(line)) {
      if (!inFence) {
        inFence = true;
        fenceLines = [line];
      } else {
        fenceLines.push(line);
        result.push({ type: "fence", lines: fenceLines });
        inFence = false;
        fenceLines = [];
      }
      continue;
    }
    if (inFence) {
      fenceLines.push(line);
      continue;
    }
    var headingMatch = line.match(/^(#{1,6})\s+(\S.*)$/);
    if (headingMatch) {
      var level = headingMatch[1].length;
      result.push({
        type: "heading",
        level: level,
        text: line,
        html: decorateInlineMarkup(escapeHtml(line)),
      });
      continue;
    }
    if (line === "") {
      result.push({ type: "empty" });
    } else {
      var escaped = escapeHtml(line);
      var decorated = decorateInlineMarkup(escaped);
      result.push({
        type: decorated === escaped ? "plain" : "decorated",
        text: line,
        html: decorated,
      });
    }
  }
  // If fence was never closed, emit remaining lines as plain
  if (inFence) {
    for (var j = 0; j < fenceLines.length; j++) {
      if (fenceLines[j] === "") {
        result.push({ type: "empty" });
      } else {
        result.push({
          type: "plain",
          text: fenceLines[j],
          html: escapeHtml(fenceLines[j]),
        });
      }
    }
  }
  return result;
}

// Per-message view-mode cycle: decorated -> plain -> markdown -> decorated.
function nextViewMode(current) {
  if (current === "plain") return "markdown";
  if (current === "markdown") return "decorated";
  return "plain";
}

// Human-readable label for the toggle button title in each view mode.
function viewModeLabel(mode) {
  if (mode === "plain") return "Plain view (click for markdown)";
  if (mode === "markdown") return "Markdown view (click for decorated)";
  return "Decorated view (click for plain)";
}

// Render raw text as markdown HTML via the marked library.
// Returns null when marked is unavailable so callers can fall back to plain.
// NOTE: output is intentionally NOT sanitized (accepted XSS trade-off).
function renderMarkdownHtml(rawText, markedLib) {
  if (!markedLib || typeof markedLib.parse !== "function") {
    return null;
  }
  return markedLib.parse(String(rawText || ""), { gfm: true });
}

if (typeof window !== "undefined") {
  window.escapeHtml = escapeHtml;
  window.decorateInlineMarkup = decorateInlineMarkup;
  window.buildDecoratedLines = buildDecoratedLines;
  window.nextViewMode = nextViewMode;
  window.viewModeLabel = viewModeLabel;
  window.renderMarkdownHtml = renderMarkdownHtml;
}
