(function () {
  "use strict";

  /**
   * Extract JSON replacement from LLM response
   * Handles various formats:
   * - ```json { ... } ```
   * - ``` { ... } ```
   * - Raw JSON { ... }
   * @param {string} response - The LLM response text
   * @returns {object|null} Parsed JSON or null if invalid
   */
  function extractReplacement(response) {
    if (!response || typeof response !== "string") {
      return null;
    }

    // Strip <details>...</details> blocks — chat wraps thought process in these,
    // leaving the actual JSON response after the closing tag.
    var cleaned = response.replace(/<details[\s\S]*?<\/details>/g, "").trim();

    // Try the cleaned text directly as JSON (common case: JSON is the only remaining content)
    if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
      try {
        return JSON.parse(cleaned);
      } catch (e) {
        // fall through
      }
    }

    // Try to find JSON in code blocks
    var codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (e) {
        // fall through
      }
    }

    // Last resort: find the last { ... } pair that parses as valid JSON
    var lastClose = cleaned.lastIndexOf("}");
    if (lastClose !== -1) {
      var sub = cleaned.substring(0, lastClose + 1);
      var firstOpen = sub.lastIndexOf("{");
      if (firstOpen !== -1) {
        try {
          return JSON.parse(sub.substring(firstOpen));
        } catch (e) {
          // fall through
        }
      }
    }

    return null;
  }

  /**
   * Apply a replacement to file content
   * @param {string} content - Original file content
   * @param {object} replacement - Replacement object with replace_start_line, replace_end_line, replacement
   * @returns {string} Modified content
   */
  function applyReplacement(content, replacement) {
    if (!content || typeof content !== "string") {
      return content;
    }

    if (!replacement || typeof replacement !== "object") {
      return content;
    }

    const startLine = parseInt(replacement.replace_start_line, 10);
    const endLine = parseInt(replacement.replace_end_line, 10);
    const newContent = replacement.replacement;

    if (isNaN(startLine) || isNaN(endLine) || typeof newContent !== "string") {
      return content;
    }

    const lines = content.split("\n");
    
    // Validate line numbers
    if (startLine < 1 || endLine < startLine || startLine > lines.length) {
      return content;
    }

    // Convert to 0-based indices
    const startIdx = startLine - 1;
    const endIdx = Math.min(endLine, lines.length);

    // Build new content
    const before = lines.slice(0, startIdx);
    const after = lines.slice(endIdx);
    const replacementLines = newContent.split("\n");

    return [...before, ...replacementLines, ...after].join("\n");
  }

  const MIMO_EXPERT_UTILS = {
    extractReplacement,
    applyReplacement,
  };

  if (typeof window !== "undefined") {
    window.MIMO_EXPERT_UTILS = MIMO_EXPERT_UTILS;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MIMO_EXPERT_UTILS;
  }
})();
