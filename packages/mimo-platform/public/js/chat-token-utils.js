"use strict";

// Pure token utility functions shared between chat.js (browser) and tests (Bun).
// No DOM or window dependencies.

function splitTokenAffixes(token) {
  const str = String(token);
  // Scan inward from each end, skipping any characters that are not valid
  // in a file path (letters, digits, dot, slash, backslash, colon, and a few
  // common URL/path extras). Everything outside the first/last valid char
  // becomes the prefix/suffix, so wrappers like `**`, backticks, brackets,
  // quotes, punctuation are all stripped regardless of which characters are used.
  const fileSafe = /[a-zA-Z0-9_/\\:@#~\-]/;
  let start = 0;
  while (start < str.length && !fileSafe.test(str[start])) start++;
  let end = str.length - 1;
  while (end >= start && !fileSafe.test(str[end])) end--;
  if (start > end) {
    return { prefix: str, core: "", suffix: "" };
  }
  return {
    prefix: str.slice(0, start),
    core: str.slice(start, end + 1),
    suffix: str.slice(end + 1),
  };
}

function normalizeFileQuery(query) {
  return String(query || "")
    .replace(/\\\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^file:\/\//i, "")
    .trim();
}

function stripLineReference(token) {
  return token.replace(/:(\d+)(:\d+)?$/, "");
}

function isLikelyFileToken(token, fileExtensions) {
  if (!token) return false;
  if (/^https?:\/\//i.test(token)) return false;
  if (token.includes("/") || token.includes("\\")) return true;
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 1) return false;
  const ext = token.slice(dotIdx + 1).toLowerCase();
  return fileExtensions.has(ext);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { splitTokenAffixes, normalizeFileQuery, stripLineReference, isLikelyFileToken };
}
