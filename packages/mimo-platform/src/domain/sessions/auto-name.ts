// SPDX-License-Identifier: AGPL-3.0-only

const MAX_BASE_LENGTH = 24;
const MAX_WORDS = 4;
const DEFAULT_NAME = "New thread";

/**
 * Derive a short, human-readable base name from an initial prompt: take the
 * leading portion of the first non-empty line, collapse whitespace, keep at most
 * the first few words, and cap at ~24 characters on a word boundary. Falls back
 * to a generic default when the prompt yields nothing usable.
 */
function deriveBase(initialPrompt: string): string {
  const firstLine = (initialPrompt ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  const collapsed = (firstLine ?? "").replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) {
    return DEFAULT_NAME;
  }

  // Keep only the first few words.
  const byWords = collapsed.split(" ").slice(0, MAX_WORDS).join(" ");

  if (byWords.length <= MAX_BASE_LENGTH) {
    return byWords;
  }

  const truncated = byWords.slice(0, MAX_BASE_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  const atBoundary = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return atBoundary.trim() || DEFAULT_NAME;
}

/**
 * Generate a thread name from an initial prompt that is unique within the
 * provided set of existing names. On collision, appends " (2)", " (3)", etc.
 */
export function autoName(
  initialPrompt: string,
  existingNames: Iterable<string>,
): string {
  const existing = new Set(existingNames);
  const base = deriveBase(initialPrompt);

  if (!existing.has(base)) {
    return base;
  }

  let suffix = 2;
  while (existing.has(`${base} (${suffix})`)) {
    suffix += 1;
  }
  return `${base} (${suffix})`;
}
