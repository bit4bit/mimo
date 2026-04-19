(function () {
  "use strict";

  /**
   * Extract replacement instructions from LLM response.
   * Supported formats:
   * - SEARCH/REPLACE blocks (preferred)
   * - JSON replacements (legacy)
   * @param {string} response - The LLM response text
   * @returns {object|null} Parsed replacement payload or null if invalid
   */
  /**
   * Fix malformed JSON where LLM outputs literal newlines in string values
   * instead of escaped \n sequences.
   * @param {string} text - The potentially malformed JSON string
   * @returns {string} Fixed JSON string
   */
  function fixMalformedJson(text) {
    if (!text) return text;

    var result = "";
    var inString = false;
    var escaped = false;

    for (var i = 0; i < text.length; i++) {
      var char = text[i];

      if (escaped) {
        result += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        result += char;
        continue;
      }

      if (char === '"' && !escaped) {
        inString = !inString;
        result += char;
        continue;
      }

      // If we're inside a string and hit a literal newline, escape it
      if (inString && char === "\n") {
        result += "\\n";
        continue;
      }

      // If we're inside a string and hit a literal carriage return, escape it
      if (inString && char === "\r") {
        result += "\\r";
        continue;
      }

      result += char;
    }

    return result;
  }

  function stripDetailsTags(response) {
    return response.replace(/<details[\s\S]*?<\/details>/g, "").trim();
  }

  function extractSearchReplaceBlocks(response) {
    if (!response || typeof response !== "string") {
      return [];
    }

    var cleaned = stripDetailsTags(response);
    var blockRegex =
      /<{7}\s*SEARCH\r?\n([\s\S]*?)\r?\n={7}\r?\n([\s\S]*?)\r?\n>{7}\s*REPLACE/g;
    var blocks = [];
    var match;

    while ((match = blockRegex.exec(cleaned)) !== null) {
      blocks.push({
        search: match[1],
        replace: match[2],
      });
    }

    return blocks;
  }

  function parseJsonReplacement(response) {
    if (!response || typeof response !== "string") {
      return null;
    }

    var cleaned = stripDetailsTags(response);
    var parsed = null;

    if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
      try {
        parsed = JSON.parse(fixMalformedJson(cleaned));
      } catch (e) {
        // fall through
      }
    }

    if (!parsed) {
      var codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(fixMalformedJson(codeBlockMatch[1].trim()));
        } catch (e) {
          // fall through
        }
      }
    }

    if (!parsed) {
      var lastClose = cleaned.lastIndexOf("}");
      if (lastClose !== -1) {
        var sub = cleaned.substring(0, lastClose + 1);
        var firstOpen = sub.lastIndexOf("{");
        if (firstOpen !== -1) {
          try {
            parsed = JSON.parse(fixMalformedJson(sub.substring(firstOpen)));
          } catch (e) {
            // fall through
          }
        }
      }
    }

    return parsed;
  }

  function extractReplacement(response) {
    if (!response || typeof response !== "string") {
      return null;
    }

    var searchReplaceBlocks = extractSearchReplaceBlocks(response);
    if (searchReplaceBlocks.length > 0) {
      return {
        format: "search_replace",
        blocks: searchReplaceBlocks,
      };
    }

    var parsed = parseJsonReplacement(response);

    if (!parsed) {
      return null;
    }

    // Check for error response
    if (parsed.error) {
      return parsed;
    }

    // New format: { "replacements": [...] }
    if (parsed.replacements && Array.isArray(parsed.replacements)) {
      return {
        format: "json",
        replacements: parsed.replacements,
      };
    }

    // Legacy format: single replacement object
    // { "file": ..., "replace_start_line": ..., "replace_end_line": ..., "replacement": ... }
    if (parsed.file && parsed.replace_start_line !== undefined) {
      return {
        format: "json",
        replacements: [parsed],
      };
    }

    return null;
  }

  function countOccurrences(haystack, needle) {
    var count = 0;
    var pos = 0;
    while (needle && (pos = haystack.indexOf(needle, pos)) !== -1) {
      count += 1;
      pos += needle.length || 1;
    }
    return count;
  }

  function lineIndent(line) {
    var match = line.match(/^\s*/);
    return match ? match[0] : "";
  }

  function adaptIndentation(replaceText, searchText, matchedLines) {
    var replaceLines = replaceText.split("\n");
    var searchLines = searchText.split("\n");

    var pivotIndex = -1;
    for (var i = 0; i < searchLines.length; i++) {
      if (searchLines[i].trim()) {
        pivotIndex = i;
        break;
      }
    }

    if (pivotIndex === -1 || !matchedLines[pivotIndex]) {
      return replaceText;
    }

    var searchIndent = lineIndent(searchLines[pivotIndex]);
    var matchedIndent = lineIndent(matchedLines[pivotIndex]);
    if (searchIndent === matchedIndent) {
      return replaceText;
    }

    var adapted = replaceLines.map(function (line) {
      if (!line.trim()) {
        return line;
      }
      if (searchIndent && line.startsWith(searchIndent)) {
        return matchedIndent + line.slice(searchIndent.length);
      }
      return line;
    });

    return adapted.join("\n");
  }

  function findWhitespaceNormalizedMatch(content, search) {
    var contentLines = content.split("\n");
    var searchLines = search.split("\n");
    var matches = [];

    if (!searchLines.length || searchLines.length > contentLines.length) {
      return { matches: matches, contentLines: contentLines, searchLines: searchLines };
    }

    for (var start = 0; start <= contentLines.length - searchLines.length; start++) {
      var isMatch = true;
      for (var offset = 0; offset < searchLines.length; offset++) {
        if (contentLines[start + offset].trim() !== searchLines[offset].trim()) {
          isMatch = false;
          break;
        }
      }
      if (isMatch) {
        matches.push(start);
      }
    }

    return { matches: matches, contentLines: contentLines, searchLines: searchLines };
  }

  function applyLineRangeReplacement(contentLines, startLineIndex, lineCount, replacementText) {
    var before = contentLines.slice(0, startLineIndex);
    var after = contentLines.slice(startLineIndex + lineCount);
    var replacementLines = replacementText === "" ? [] : replacementText.split("\n");
    return before.concat(replacementLines, after).join("\n");
  }

  function applySearchReplaceBlock(content, block, focusLine) {
    if (!content || typeof content !== "string") {
      return content;
    }

    if (!block || typeof block !== "object") {
      throw new Error("Invalid search/replace block");
    }

    if (!block.search || !block.search.trim()) {
      throw new Error(
        "Empty search block. Use insertion pattern with anchor line instead.",
      );
    }

    var searchText = block.search;
    var replaceText = typeof block.replace === "string" ? block.replace : "";

    var exactCount = countOccurrences(content, searchText);
    if (exactCount > 1) {
      throw new Error("Multiple matches found. Make the search text more specific.");
    }
    if (exactCount === 1) {
      var exactIndex = content.indexOf(searchText);
      return (
        content.slice(0, exactIndex) +
        replaceText +
        content.slice(exactIndex + searchText.length)
      );
    }

    var fuzzy = findWhitespaceNormalizedMatch(content, searchText);
    if (fuzzy.matches.length > 1) {
      throw new Error("Multiple matches found. Make the search text more specific.");
    }
    if (fuzzy.matches.length === 1) {
      var fuzzyStart = fuzzy.matches[0];
      var fuzzyMatchedLines = fuzzy.contentLines.slice(
        fuzzyStart,
        fuzzyStart + fuzzy.searchLines.length,
      );
      var normalizedReplace = adaptIndentation(
        replaceText,
        searchText,
        fuzzyMatchedLines,
      );
      return applyLineRangeReplacement(
        fuzzy.contentLines,
        fuzzyStart,
        fuzzy.searchLines.length,
        normalizedReplace,
      );
    }

    if (typeof focusLine === "number" && focusLine > 0) {
      var contentLines = content.split("\n");
      var searchLines = searchText.split("\n");
      var radius = 5;
      var start = Math.max(0, focusLine - 1 - radius);
      var end = Math.min(contentLines.length - searchLines.length, focusLine - 1 + radius);

      for (var i = start; i <= end; i++) {
        var nearMatch = true;
        for (var j = 0; j < searchLines.length; j++) {
          if (contentLines[i + j] !== searchLines[j]) {
            nearMatch = false;
            break;
          }
        }

        if (nearMatch) {
          return applyLineRangeReplacement(contentLines, i, searchLines.length, replaceText);
        }
      }
    }

    throw new Error(
      "Could not find the code to replace. The file may have changed.",
    );
  }

  function applySearchReplaceBlocks(content, blocks) {
    if (!Array.isArray(blocks)) {
      throw new Error("Search/replace blocks must be an array");
    }

    var result = content;
    for (var i = 0; i < blocks.length; i++) {
      try {
        var block = blocks[i];
        var focusLine =
          block && typeof block.focusLine === "number" ? block.focusLine : undefined;
        result = applySearchReplaceBlock(result, block, focusLine);
      } catch (err) {
        throw new Error("Block " + (i + 1) + ": " + err.message);
      }
    }

    return result;
  }

  /**
   * Find the correct line number by searching for text near the expected location
   * @param {string[]} lines - File lines array
   * @param {string} searchText - Text to search for
   * @param {number} expectedLine - Expected 1-based line number
   * @param {number} searchRadius - How many lines to search around expected line
   * @returns {number} Corrected 1-based line number, or expectedLine if not found
   */
  function findCorrectLine(lines, searchText, expectedLine, searchRadius = 5) {
    if (!searchText || typeof searchText !== "string") {
      return expectedLine;
    }

    const normalizedSearch = searchText.trim();
    if (!normalizedSearch) {
      return expectedLine;
    }

    // Search around the expected line
    const startSearch = Math.max(0, expectedLine - 1 - searchRadius);
    const endSearch = Math.min(lines.length, expectedLine - 1 + searchRadius);

    for (let i = startSearch; i < endSearch; i++) {
      if (lines[i].trim() === normalizedSearch) {
        return i + 1; // Convert back to 1-based
      }
    }

    // If exact match not found, try fuzzy match (contains)
    for (let i = startSearch; i < endSearch; i++) {
      if (lines[i].includes(normalizedSearch)) {
        return i + 1;
      }
    }

    // Fall back to expected line
    return expectedLine;
  }

  /**
   * Apply a single replacement to file content
   * @param {string} content - Original file content
   * @param {object} replacement - Replacement object with replace_start_line, replace_end_line, replacement, search
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
    // Allow insertion: endLine can be startLine - 1 (insert before startLine)
    if (startLine < 1 || endLine < startLine - 1 || startLine > lines.length + 1) {
      return content;
    }

    // If search text is provided, validate and correct line numbers
    let correctedStartLine = startLine;
    let correctedEndLine = endLine;
    
    if (replacement.search && typeof replacement.search === "string") {
      correctedStartLine = findCorrectLine(lines, replacement.search, startLine);
      
      // Preserve the LLM's intended block size
      // If start shifts by +2, end should also shift by +2
      const delta = correctedStartLine - startLine;
      correctedEndLine = endLine + delta;
    }

    // Convert to 0-based indices
    const startIdx = correctedStartLine - 1;
    const endIdx = Math.min(correctedEndLine, lines.length);

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

    // Insertion ranges (end < start) never overlap with anything
    if (aEnd < aStart || bEnd < bStart) {
      return false;
    }

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

    const requiredFields = [
      "replace_start_line",
      "replace_end_line",
      "replacement",
    ];
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

    if (isNaN(endLine) || endLine < startLine - 1) {
      throw new Error(
        `${prefix}: replace_end_line must be >= replace_start_line - 1`,
      );
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
  function applyReplacementsLegacy(content, replacements) {
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

  function applyReplacements(content, parsed) {
    if (!content || typeof content !== "string") {
      return content;
    }

    if (Array.isArray(parsed)) {
      return applyReplacementsLegacy(content, parsed);
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Replacements must be an array or parsed replacement object");
    }

    if (parsed.format === "search_replace") {
      return applySearchReplaceBlocks(content, parsed.blocks || []);
    }

    if (parsed.format === "json") {
      return applyReplacementsLegacy(content, parsed.replacements || []);
    }

    if (Array.isArray(parsed.replacements)) {
      return applyReplacementsLegacy(content, parsed.replacements);
    }

    throw new Error("Unknown replacement format");
  }

  const MIMO_EXPERT_UTILS = {
    extractReplacement,
    extractSearchReplaceBlocks,
    applyReplacement,
    applySearchReplaceBlock,
    applySearchReplaceBlocks,
    applyReplacements,
    applyReplacementsLegacy,
    rangesOverlap,
    fixMalformedJson,
  };

  if (typeof window !== "undefined") {
    window.MIMO_EXPERT_UTILS = MIMO_EXPERT_UTILS;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MIMO_EXPERT_UTILS;
  }
})();
