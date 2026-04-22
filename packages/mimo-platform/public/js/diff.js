// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

(function () {
  "use strict";

  function lcs(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0 || n === 0) return [];

    const dp = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    const result = [];
    let i = m,
      j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        result.unshift({ origIndex: i - 1, modIndex: j - 1 });
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    return result;
  }

  function computeDiff(original, modified) {
    if (original === modified) {
      const lines = original.split("\n").map((content, index) => ({
        type: "unchanged",
        content,
        lineNumber: index + 1,
      }));
      return {
        original: { lines },
        modified: { lines: lines.map((l) => ({ ...l })) },
      };
    }

    const originalLines = original.split("\n");
    const modifiedLines = modified.split("\n");

    if (originalLines.length === 1 && originalLines[0] === "") {
      originalLines.length = 0;
    }
    if (modifiedLines.length === 1 && modifiedLines[0] === "") {
      modifiedLines.length = 0;
    }

    if (originalLines.length === 0) {
      return {
        original: { lines: [] },
        modified: {
          lines: modifiedLines.map((content, index) => ({
            type: "added",
            content,
            lineNumber: index + 1,
          })),
        },
      };
    }

    if (modifiedLines.length === 0) {
      return {
        original: {
          lines: originalLines.map((content, index) => ({
            type: "removed",
            content,
            lineNumber: index + 1,
          })),
        },
        modified: { lines: [] },
      };
    }

    const lcsResult = lcs(originalLines, modifiedLines);
    const lcsOrigSet = new Set(lcsResult.map((x) => x.origIndex));
    const lcsModSet = new Set(lcsResult.map((x) => x.modIndex));

    const originalDiff = originalLines.map((content, idx) => ({
      type: lcsOrigSet.has(idx) ? "unchanged" : "removed",
      content,
      lineNumber: idx + 1,
    }));

    const modifiedDiff = modifiedLines.map((content, idx) => ({
      type: lcsModSet.has(idx) ? "unchanged" : "added",
      content,
      lineNumber: idx + 1,
    }));

    return {
      original: { lines: originalDiff },
      modified: { lines: modifiedDiff },
    };
  }

  const MIMO_DIFF = {
    computeDiff,
  };

  if (typeof window !== "undefined") {
    window.MIMO_DIFF = MIMO_DIFF;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MIMO_DIFF;
  }
})();
