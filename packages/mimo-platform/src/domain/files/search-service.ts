// SPDX-License-Identifier: AGPL-3.0-only
import { which } from "bun";
import type { ContentSearchResponse, ContentSearchResult } from "./types.js";
import type { SearchOptions, SearchService } from "./types.js";
import type { OS } from "../../infrastructure/os/types.js";

export type ResolveBinary = (name: string) => Promise<string | undefined>;

interface SearchServiceDeps {
  os: OS;
  resolveBinary: ResolveBinary;
}

export class SearchServiceError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "INVALID_REGEX" | "EXECUTION_FAILED",
  ) {
    super(message);
    this.name = "SearchServiceError";
  }
}

export async function checkRipgrepAvailable(): Promise<boolean> {
  const rgPath = await which("rg");
  return rgPath !== undefined;
}

const MAX_CONTEXT_LINES = 10;

/** Parses a context-lines query value, clamped to 0–10; invalid values fall back. */
export function parseContextLines(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(MAX_CONTEXT_LINES, Math.max(0, parsed));
}

export interface SpawnRipgrepOptions {
  workspacePath: string;
  query: string;
  beforeLines?: number;
  afterLines?: number;
  maxResults?: number;
}

export function createSearchService(
  deps: Partial<SearchServiceDeps> = {},
): SearchService {
  const os = deps.os;
  const resolveBinary = deps.resolveBinary ?? which;

  return {
    searchContent: async (
      workspacePath: string,
      query: string,
      options: SearchOptions,
    ) => {
      return spawnRipgrep(
        {
          workspacePath,
          query,
          beforeLines: options.beforeLines,
          afterLines: options.afterLines,
          maxResults: options.maxResults,
        },
        { os, resolveBinary },
      );
    },
  };
}

export async function spawnRipgrep(
  options: SpawnRipgrepOptions,
  deps: Partial<SearchServiceDeps> = {},
): Promise<ContentSearchResponse> {
  const resolveBinary = deps.resolveBinary ?? which;

  const rgPath = await resolveBinary("rg");
  if (!rgPath) {
    throw new SearchServiceError(
      "ripgrep (rg) not found. Please install ripgrep: https://github.com/BurntSushi/ripgrep#installation",
      "NOT_FOUND",
    );
  }

  const {
    workspacePath,
    query,
    beforeLines = 2,
    afterLines = 2,
    maxResults = 100,
  } = options;
  if (query.includes("\0")) {
    throw new SearchServiceError("Invalid search query", "INVALID_REGEX");
  }

  // --max-count is per file; it only guards against one huge file. The total
  // cap is enforced while parsing.
  const args = [
    "--json",
    "-i",
    "-n",
    "-B",
    String(beforeLines),
    "-A",
    String(afterLines),
    "--max-count",
    String(maxResults),
    "--",
    query,
    ".",
  ];

  const os = deps.os;
  if (!os) {
    throw new SearchServiceError(
      "OS dependency is required",
      "EXECUTION_FAILED",
    );
  }

  const { success, output, error, exitCode } = await os.command.run(
    [rgPath, ...args],
    {
      cwd: workspacePath,
    },
  );

  if (exitCode === 1 && error.trim().length === 0) {
    return { results: [], truncated: false };
  }

  if (!success) {
    if (
      error.includes("error parsing regex") ||
      error.includes("parse error")
    ) {
      throw new SearchServiceError(
        `Invalid regex: ${query}. Use escape for literals: \\ \\* \\+`,
        "INVALID_REGEX",
      );
    }
    throw new SearchServiceError(
      "ripgrep execution failed",
      "EXECUTION_FAILED",
    );
  }

  return parseRipgrepOutput(
    output,
    { beforeLines, afterLines, maxResults },
    workspacePath,
  );
}

function normalizeResultPath(pathText: string, workspacePath: string): string {
  const normalizedWorkspace = workspacePath
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  let normalized = String(pathText || "").replace(/\\/g, "/");
  if (normalized.startsWith("./")) normalized = normalized.slice(2);
  if (normalized.startsWith(normalizedWorkspace + "/")) {
    normalized = normalized.slice(normalizedWorkspace.length + 1);
  }
  return normalized;
}

interface ParseOptions {
  beforeLines: number;
  afterLines: number;
  maxResults: number;
}

interface NumberedLine {
  line: number;
  text: string;
}

const stripLineEnding = (text: string) => text.replace(/\r?\n$/, "");

/**
 * Turns `rg --json` output into results whose `before` lines end at `line - 1`
 * and whose `after` lines start at `line + 1`, both contiguous and from the
 * same file. Match lines count as context for neighbouring matches.
 */
export function parseRipgrepOutput(
  output: string,
  { beforeLines, afterLines, maxResults }: ParseOptions,
  workspacePath: string,
): ContentSearchResponse {
  const results: ContentSearchResult[] = [];
  let currentPath: string | null = null;
  // Matches whose after-context window is still open (several when matches
  // are closer together than `afterLines`).
  let openMatches: ContentSearchResult[] = [];
  let recentLines: NumberedLine[] = [];

  for (const raw of output.split("\n")) {
    if (raw.trim().length === 0) continue;
    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      continue;
    }

    const { type, data } = event;
    if (type !== "match" && type !== "context") {
      if (type === "begin" || type === "end") {
        currentPath = null;
        openMatches = [];
        recentLines = [];
      }
      continue;
    }
    if (!data?.path) continue;

    const path = normalizeResultPath(data.path.text, workspacePath);
    const lineNum: number = data.line_number;
    const text = stripLineEnding(data.lines?.text ?? "");

    if (path !== currentPath) {
      currentPath = path;
      openMatches = [];
      recentLines = [];
    }

    const previous = recentLines[recentLines.length - 1];
    if (previous && previous.line !== lineNum - 1) recentLines = [];

    openMatches = openMatches.filter((m) => lineNum - m.line <= afterLines);
    for (const match of openMatches) match.after.push(text);

    if (type === "match") {
      if (results.length >= maxResults) {
        return { results, truncated: true };
      }
      const matchStart = data.submatches?.[0]?.start ?? 0;
      const matchEnd = data.submatches?.[0]?.end ?? text.length;
      const match: ContentSearchResult = {
        path,
        line: lineNum,
        column: matchStart,
        text,
        matchStart,
        matchEnd,
        before: recentLines
          .filter((l) => l.line >= lineNum - beforeLines)
          .map((l) => l.text),
        after: [],
      };
      results.push(match);
      openMatches.push(match);
    }

    recentLines =
      beforeLines > 0
        ? [...recentLines, { line: lineNum, text }].slice(-beforeLines)
        : [];
  }

  return { results, truncated: false };
}
