// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { createSearchService } from "../src/domain/files/search-service.js";
import type { OS } from "../src/infrastructure/os/types.js";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, "fixtures/ripgrep", name), "utf-8");

// Fixture workspace (recorded with `rg --json -i -n -B N -A N --sort path -- foo .`):
//   a.txt: foo on line 5 of 10
//   b.txt: foo on lines 1, 3, 7, 8 of 9
//   c.txt: foo on lines 2 and 10 ("const café = foo;") of 11
function createFakeSearch(output: string) {
  const calls: string[][] = [];
  const os = {
    command: {
      run: async (command: string[]) => {
        calls.push(command);
        return { success: true, output, error: "", exitCode: 0 };
      },
    },
  } as unknown as OS;
  const search = createSearchService({
    os,
    resolveBinary: async () => "/usr/bin/rg",
  });
  return { search, calls };
}

const find = (
  results: { path: string; line: number }[],
  path: string,
  line: number,
) => results.find((r) => r.path === path && r.line === line);

describe("content search context lines", () => {
  it("attaches the lines surrounding each match to that match", async () => {
    const { search } = createFakeSearch(fixture("context-2-2.jsonl"));
    const { results } = await search.searchContent("/ws", "foo", {
      beforeLines: 2,
      afterLines: 2,
    });

    expect(results.map((r) => `${r.path}:${r.line}`)).toEqual([
      "a.txt:5",
      "b.txt:1",
      "b.txt:3",
      "b.txt:7",
      "b.txt:8",
      "c.txt:2",
      "c.txt:10",
    ]);
    expect(find(results, "a.txt", 5)).toMatchObject({
      text: "foo five",
      before: ["l3", "l4"],
      after: ["l6", "l7"],
    });
  });

  it("keeps the trailing context of the last match in a file", async () => {
    const { search } = createFakeSearch(fixture("context-2-2.jsonl"));
    const { results } = await search.searchContent("/ws", "foo", {
      beforeLines: 2,
      afterLines: 2,
    });

    expect(find(results, "b.txt", 8)?.after).toEqual(["l9"]);
    expect(find(results, "c.txt", 10)?.after).toEqual(["l11"]);
  });

  it("shares lines between nearby matches, including the match lines", async () => {
    const { search } = createFakeSearch(fixture("context-2-2.jsonl"));
    const { results } = await search.searchContent("/ws", "foo", {
      beforeLines: 2,
      afterLines: 2,
    });

    expect(find(results, "b.txt", 1)?.after).toEqual(["l2", "foo three"]);
    expect(find(results, "b.txt", 3)?.before).toEqual(["foo one", "l2"]);
    expect(find(results, "b.txt", 7)?.after).toEqual(["foo eight", "l9"]);
    expect(find(results, "b.txt", 8)?.before).toEqual(["l6", "foo seven"]);
  });

  it("returns no before-context for a match on line 1 and partial context near the start", async () => {
    const { search } = createFakeSearch(fixture("context-2-2.jsonl"));
    const { results } = await search.searchContent("/ws", "foo", {
      beforeLines: 2,
      afterLines: 2,
    });

    expect(find(results, "b.txt", 1)?.before).toEqual([]);
    expect(find(results, "c.txt", 2)?.before).toEqual(["l1"]);
  });

  it("never mixes context from another file or from a non-adjacent region", async () => {
    const { search } = createFakeSearch(fixture("context-2-2.jsonl"));
    const { results } = await search.searchContent("/ws", "foo", {
      beforeLines: 2,
      afterLines: 2,
    });

    expect(find(results, "c.txt", 2)?.after).toEqual(["l3", "l4"]);
    expect(find(results, "c.txt", 10)?.before).toEqual(["l8", "l9"]);
  });

  it("returns empty context when zero lines are requested", async () => {
    const { search } = createFakeSearch(fixture("context-0-0.jsonl"));
    const { results } = await search.searchContent("/ws", "foo", {
      beforeLines: 0,
      afterLines: 0,
    });

    expect(results).toHaveLength(7);
    for (const r of results) {
      expect(r.before).toEqual([]);
      expect(r.after).toEqual([]);
    }
  });

  it("asks ripgrep for separate before and after context", async () => {
    const { search, calls } = createFakeSearch(fixture("context-0-0.jsonl"));
    await search.searchContent("/ws", "foo", { beforeLines: 1, afterLines: 3 });

    const args = calls[0];
    expect(args[args.indexOf("-B") + 1]).toBe("1");
    expect(args[args.indexOf("-A") + 1]).toBe("3");
  });
});

describe("content search result cap", () => {
  it("caps the total across files and reports truncation", async () => {
    const { search } = createFakeSearch(fixture("context-2-2.jsonl"));
    const { results, truncated } = await search.searchContent("/ws", "foo", {
      beforeLines: 2,
      afterLines: 2,
      maxResults: 6,
    });

    expect(results).toHaveLength(6);
    expect(truncated).toBe(true);
  });

  it("does not report truncation when matches exactly fill the cap", async () => {
    const { search } = createFakeSearch(fixture("context-2-2.jsonl"));
    const { results, truncated } = await search.searchContent("/ws", "foo", {
      beforeLines: 2,
      afterLines: 2,
      maxResults: 7,
    });

    expect(results).toHaveLength(7);
    expect(truncated).toBe(false);
  });
});
