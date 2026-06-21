import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const overviewPath = join(
  import.meta.dir,
  "../../../public/js/diff-overview.js",
);
const overviewCode = readFileSync(overviewPath, "utf-8");

// Provide a mock module object so the IIFE assigns exports (same pattern as diff.test.ts)
const mockModule = { exports: {} as any };
const wrappedCode = overviewCode
  .replace(/\(function \(\) \{/, "(function (module) {")
  .replace(/\}\)\(\);\s*$/, "})(mockModule);");

// eslint-disable-next-line @typescript-eslint/no-implied-eval
eval(wrappedCode);

const OVERVIEW = mockModule.exports;

// classify helper for plain string rows
const classifyString = (row: string) => row;

describe("collectHunks", () => {
  it("collapses consecutive changed rows into one hunk with correct start/end/type", () => {
    const rows = [
      "unchanged",
      "removed",
      "added",
      "added",
      "unchanged",
      "unchanged",
      "added",
    ];
    const hunks = OVERVIEW.collectHunks(rows, classifyString);

    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toEqual({ startIndex: 1, endIndex: 3, type: "mixed" });
    expect(hunks[1]).toEqual({ startIndex: 6, endIndex: 6, type: "added" });
  });

  it("yields exactly one hunk of type added for a 40-line contiguous insertion", () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      i >= 5 && i < 45 ? "added" : "unchanged",
    );
    const hunks = OVERVIEW.collectHunks(rows, classifyString);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toEqual({ startIndex: 5, endIndex: 44, type: "added" });
  });

  it("produces a mixed hunk for alternating added/removed rows", () => {
    const rows = ["added", "removed", "added", "removed"];
    const hunks = OVERVIEW.collectHunks(rows, classifyString);

    expect(hunks).toHaveLength(1);
    expect(hunks[0].type).toBe("mixed");
    expect(hunks[0].startIndex).toBe(0);
    expect(hunks[0].endIndex).toBe(3);
  });

  it("returns no hunks when nothing changed", () => {
    const rows = ["unchanged", "unchanged", "unchanged"];
    expect(OVERVIEW.collectHunks(rows, classifyString)).toEqual([]);
  });
});

describe("tickGeometry", () => {
  it("maps startIndex/totalRows to tickTop", () => {
    const geo = OVERVIEW.tickGeometry(50, 59, 100, 200);
    expect(geo.top).toBeCloseTo(100, 5);
    // 10 rows of 100 over a 200px track = 20px, above the minimum
    expect(geo.height).toBeCloseTo(20, 5);
  });

  it("clamps tick height to MIN_TICK_PX for tiny single-line changes", () => {
    const geo = OVERVIEW.tickGeometry(0, 0, 1000, 200);
    expect(geo.top).toBeCloseTo(0, 5);
    expect(geo.height).toBe(OVERVIEW.MIN_TICK_PX);
  });
});

describe("createController", () => {
  it("count() returns { index, total } matching the hunk list", () => {
    const hunks = [{ startIndex: 0 }, { startIndex: 4 }, { startIndex: 9 }];
    const controller = OVERVIEW.createController(hunks);
    expect(controller.count()).toEqual({ index: 1, total: 3 });
  });

  it("next()/prev() advance the index and wrap at the ends", () => {
    const seen: number[] = [];
    const hunks = [{ startIndex: 0 }, { startIndex: 4 }, { startIndex: 9 }];
    const controller = OVERVIEW.createController(hunks, (_h: any, i: number) =>
      seen.push(i),
    );

    controller.next();
    expect(controller.count()).toEqual({ index: 2, total: 3 });
    controller.next();
    expect(controller.count()).toEqual({ index: 3, total: 3 });
    controller.next(); // wrap to first
    expect(controller.count()).toEqual({ index: 1, total: 3 });
    controller.prev(); // wrap to last
    expect(controller.count()).toEqual({ index: 3, total: 3 });

    expect(seen).toEqual([1, 2, 0, 2]);
  });

  it("count() reports 0 / 0 with no hunks and next()/prev() are no-ops", () => {
    const controller = OVERVIEW.createController([]);
    expect(controller.count()).toEqual({ index: 0, total: 0 });
    expect(() => {
      controller.next();
      controller.prev();
    }).not.toThrow();
    expect(controller.count()).toEqual({ index: 0, total: 0 });
  });
});
