import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

function loadModule(relPath: string) {
  const code = readFileSync(join(import.meta.dir, relPath), "utf-8");
  const mockModule = { exports: {} as any };
  const wrapped = code
    .replace(/\(function \(\) \{/, "(function (module) {")
    .replace(/\}\)\(\);\s*$/, "})(mockModule);");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  eval(wrapped);
  return mockModule.exports;
}

const MIMO_DIFF = loadModule("../../../public/js/diff.js");
const OVERVIEW = loadModule("../../../public/js/diff-overview.js");

// classify a canonical row pair: added on the patched side, removed on the
// original side, both within one run -> mixed.
const classifyCanonical = (row: any) =>
  row.patched && row.patched.type === "added"
    ? "added"
    : row.original && row.original.type === "removed"
      ? "removed"
      : "unchanged";

describe("alignToCanonicalRows", () => {
  it("pads original and patched panes to an equal canonical row count", () => {
    // 3 removed lines, 1 added line -> unequal sides
    const original = "a\nb\nc\nd\ne";
    const modified = "a\nX\ne";
    const diff = MIMO_DIFF.computeDiff(original, modified);
    const canonical = MIMO_DIFF.alignToCanonicalRows(diff);

    expect(canonical.original.length).toBe(canonical.patched.length);
    expect(canonical.original.length).toBeGreaterThan(0);
  });

  it("keeps unchanged lines aligned at the same canonical index (no drift)", () => {
    const original = "keep1\nremove1\nremove2\nkeep2";
    const modified = "keep1\nadd1\nkeep2";
    const diff = MIMO_DIFF.computeDiff(original, modified);
    const canonical = MIMO_DIFF.alignToCanonicalRows(diff);

    for (let i = 0; i < canonical.original.length; i++) {
      const o = canonical.original[i];
      const p = canonical.patched[i];
      if (o.type === "unchanged" || p.type === "unchanged") {
        // An unchanged line must be unchanged on both sides at this index
        expect(o.type).toBe("unchanged");
        expect(p.type).toBe("unchanged");
        expect(o.content).toBe(p.content);
      }
    }
  });

  it("builds hunks from the canonical rows that match the rendered changes", () => {
    const original = "k1\nold\nk2\nk3";
    const modified = "k1\nnew\nk2\nextra\nk3";
    const diff = MIMO_DIFF.computeDiff(original, modified);
    const canonical = MIMO_DIFF.alignToCanonicalRows(diff);

    const rows = canonical.original.map((o: any, i: number) => ({
      original: o,
      patched: canonical.patched[i],
    }));
    const hunks = OVERVIEW.collectHunks(rows, classifyCanonical);

    // First hunk: the "old" -> "new" replacement (removed + added -> mixed)
    // Second hunk: the inserted "extra" line (added)
    expect(hunks.length).toBe(2);
    expect(hunks[0].type).toBe("mixed");
    expect(hunks[1].type).toBe("added");
  });
});
