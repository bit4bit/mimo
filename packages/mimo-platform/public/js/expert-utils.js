(function () {
  "use strict";

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

  function extractOutOfScopeError(response) {
    if (!response || typeof response !== "string") {
      return null;
    }

    var cleaned = stripDetailsTags(response);
    if (!cleaned.includes("OUT_OF_SCOPE_CHANGE_REQUIRED")) {
      return null;
    }

    return { error: "OUT_OF_SCOPE_CHANGE_REQUIRED" };
  }

  function extractReplacement(response) {
    if (!response || typeof response !== "string") {
      return null;
    }

    var blocks = extractSearchReplaceBlocks(response);
    if (blocks.length > 0) {
      return {
        format: "search_replace",
        blocks: blocks,
      };
    }

    return extractOutOfScopeError(response);
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
      return {
        matches: matches,
        contentLines: contentLines,
        searchLines: searchLines,
      };
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

    return {
      matches: matches,
      contentLines: contentLines,
      searchLines: searchLines,
    };
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
      var end = Math.min(
        contentLines.length - searchLines.length,
        focusLine - 1 + radius,
      );

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

    throw new Error("Could not find the code to replace. The file may have changed.");
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

  function applyReplacements(content, parsed) {
    if (!content || typeof content !== "string") {
      return content;
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Replacement payload is required");
    }

    if (parsed.format !== "search_replace") {
      throw new Error("Unsupported replacement format");
    }

    return applySearchReplaceBlocks(content, parsed.blocks || []);
  }

  var MIMO_EXPERT_UTILS = {
    extractReplacement: extractReplacement,
    extractSearchReplaceBlocks: extractSearchReplaceBlocks,
    applySearchReplaceBlock: applySearchReplaceBlock,
    applySearchReplaceBlocks: applySearchReplaceBlocks,
    applyReplacements: applyReplacements,
  };

  if (typeof window !== "undefined") {
    window.MIMO_EXPERT_UTILS = MIMO_EXPERT_UTILS;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MIMO_EXPERT_UTILS;
  }
})();
