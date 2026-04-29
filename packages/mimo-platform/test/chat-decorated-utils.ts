// TypeScript copy of public/js/chat-decorated-utils.js for testing
// This avoids ESM/CJS module conflicts when importing the original .js file

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function decorateInlineMarkup(escapedLine: string): string {
  const protected_: string[] = [];
  function protect(html: string): string {
    const placeholder = "\x00P" + protected_.length + "\x00";
    protected_.push(html);
    return placeholder;
  }
  // 1. Code spans: `...` → <code> (protect content from further processing)
  let result = escapedLine.replace(/`([^`]+)`/g, (match, inner) => {
    return protect('<code class="decorated-code">`' + inner + "`</code>");
  });
  // 2. Bold: **...** or __...__
  result = result.replace(/\*\*([^*]+)\*\*/g, (match, inner) => {
    return protect('<b class="decorated-bold">**' + inner + "**</b>");
  });
  result = result.replace(/__([^_]+)__/g, (match, inner) => {
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
  for (let i = 0; i < protected_.length; i++) {
    result = result.replace("\x00P" + i + "\x00", protected_[i]);
  }
  return result;
}

export interface DecoratedLine {
  type: string;
  lines?: string[];
  level?: number;
  text?: string;
  html?: string;
}

export function buildDecoratedLines(text: string): DecoratedLine[] {
  const lines = String(text || "").split("\n");
  const result: DecoratedLine[] = [];
  let inFence = false;
  let fenceLines: string[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
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
    const headingMatch = line.match(/^(#{1,6})\s+(\S.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
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
      const escaped = escapeHtml(line);
      const decorated = decorateInlineMarkup(escaped);
      result.push({
        type: decorated === escaped ? "plain" : "decorated",
        text: line,
        html: decorated,
      });
    }
  }
  // If fence was never closed, emit remaining lines as plain
  if (inFence) {
    for (let j = 0; j < fenceLines.length; j++) {
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
