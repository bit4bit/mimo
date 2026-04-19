(function () {
  "use strict";

  /**
   * Extract JSON replacements from LLM response
   * Handles various formats:
   * - ```json { "replacements": [...] } ```
   * - ``` { "file": ..., "replace_start_line": ... } ``` (legacy single-object)
   * - Raw JSON { ... }
   * @param {string} response - The LLM response text
   * @returns {Array|null} Array of replacement objects, or null if invalid
   */
  function extractReplacement(response) {
    if (!response || typeof response !== "string") {
      return null;
    }

    // Strip <details>...</details> blocks — chat wraps thought process in these,
    // leaving the actual JSON response after the closing tag.
    var cleaned = response.replace(/<details[\s\S]*?<\/details>/g, "").trim();

    var parsed = null;

    // Try the cleaned text directly as JSON
    if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        // fall through
      }
    }

    // Try to find JSON in code blocks
    if (!parsed) {
      var codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1].trim());
        } catch (e) {
          // fall through
        }
      }
    }

    // Last resort: find the last { ... } pair that parses as valid JSON
    if (!parsed) {
      var lastClose = cleaned.lastIndexOf("}");
      if (lastClose !== -1) {
        var sub = cleaned.substring(0, lastClose + 1);
        var firstOpen = sub.lastIndexOf("{");
        if (firstOpen !== -1) {
          try {
            parsed = JSON.parse(sub.substring(firstOpen));
          } catch (e) {
            // fall through
          }
        }
      }
    }

    if (!parsed) {
      return null;
    }

    // Check for error response
    if (parsed.error) {
      return parsed;
    }

    // New format: { "replacements": [...] }
    if (parsed.replacements && Array.isArray(parsed.replacements)) {
      return parsed.replacements;
    }

    // Legacy format: single replacement object
    // { "file": ..., "replace_start_line": ..., "replace_end_line": ..., "replacement": ... }
    if (parsed.file && parsed.replace_start_line !== undefined) {
      return [parsed];
    }

    return null;
  }

  /**
   * Apply a single replacement to file content
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

  /**
   * Check if two replacement ranges overlap
   * @param {object} a - First replacement
   * @param {object} b - Second replacement
   * @returns {boolean} True if ranges overlap
   */
  function rangesOverlap(a, b) {
    const aStart = parseInt(a.replace_start_line, 10);
    const aEnd = parseInt(a.replace_end_line, 10);
    const bStart = parseInt(b.replace_start_line, 10);
    const bEnd = parseInt(b.replace_end_line, 10);

    return aStart <= bEnd && bStart <= aEnd;
  }

  /**
   * Validate a replacement object
   * @param {object} replacement - Replacement to validate
   * @param {number} index - Index for error messages
   * @throws {Error} If replacement is invalid
   */
  function validateReplacement(replacement, index) {
    const prefix = `Invalid replacement at index ${index}`;

    if (!replacement || typeof replacement !== "object") {
      throw new Error(`${prefix}: not an object`);
    }

    const requiredFields = ["replace_start_line", "replace_end_line", "replacement"];
    for (const field of requiredFields) {
      if (replacement[field] === undefined) {
        throw new Error(`${prefix}: missing ${field}`);
      }
    }

    const startLine = parseInt(replacement.replace_start_line, 10);
    const endLine = parseInt(replacement.replace_end_line, 10);

    if (isNaN(startLine) || startLine < 1) {
      throw new Error(`${prefix}: replace_start_line must be >= 1`);
    }

    if (isNaN(endLine) || endLine < startLine) {
      throw new Error(`${prefix}: replace_end_line must be >= replace_start_line`);
    }

    if (typeof replacement.replacement !== "string") {
      throw new Error(`${prefix}: replacement must be a string`);
    }
  }

  /**
   * Apply multiple replacements to file content
   * Replacements are applied from bottom to top (highest line number first)
   * to preserve line number validity
   * @param {string} content - Original file content
   * @param {Array} replacements - Array of replacement objects
   * @returns {string} Modified content
   * @throws {Error} If replacements overlap or are invalid
   */
  function applyReplacements(content, replacements) {
    if (!content || typeof content !== "string") {
      return content;
    }

    if (!Array.isArray(replacements)) {
      throw new Error("Replacements must be an array");
    }

    if (replacements.length === 0) {
      throw new Error("No replacements provided");
    }

    // Validate all replacements first
    replacements.forEach((replacement, index) => {
      validateReplacement(replacement, index);
    });

    // Check for overlapping ranges
    for (let i = 0; i < replacements.length; i++) {
      for (let j = i + 1; j < replacements.length; j++) {
        if (rangesOverlap(replacements[i], replacements[j])) {
          throw new Error("Replacements have overlapping line ranges");
        }
      }
    }

    // Sort by replace_start_line descending (apply from bottom to top)
    // This ensures that replacing lines doesn't shift line numbers
    // of replacements that haven't been applied yet
    const sortedReplacements = [...replacements].sort((a, b) => {
      const aStart = parseInt(a.replace_start_line, 10);
      const bStart = parseInt(b.replace_start_line, 10);
      return bStart - aStart; // Descending order
    });

    // Apply replacements sequentially
    let result = content;
    for (const replacement of sortedReplacements) {
      result = applyReplacement(result, replacement);
    }

    return result;
  }

  const MIMO_EXPERT_UTILS = {
    extractReplacement,
    applyReplacement,
    applyReplacements,
    rangesOverlap,
  };

  if (typeof window !== "undefined") {
    window.MIMO_EXPERT_UTILS = MIMO_EXPERT_UTILS;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MIMO_EXPERT_UTILS;
  }
})();
