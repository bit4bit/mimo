import { which } from "bun";
import type { ContentSearchResult } from "./types.js";
import type { SearchOptions, SearchService } from "./types.js";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface OsCommandRunner {
  run(command: string[], options?: { cwd?: string }): Promise<CommandResult>;
}

export class BunOsCommandRunner implements OsCommandRunner {
  async run(
    command: string[],
    options?: { cwd?: string },
  ): Promise<CommandResult> {
    const proc = Bun.spawn(command, {
      cwd: options?.cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    return { exitCode, stdout, stderr };
  }
}

export type ResolveBinary = (name: string) => Promise<string | undefined>;

interface SearchServiceDeps {
  os: OsCommandRunner;
  resolveBinary: ResolveBinary;
}

export class SearchServiceError extends Error {
  constructor(message: string, public code: "NOT_FOUND" | "INVALID_REGEX" | "EXECUTION_FAILED") {
    super(message);
    this.name = "SearchServiceError";
  }
}

export async function checkRipgrepAvailable(): Promise<boolean> {
  const rgPath = await which("rg");
  return rgPath !== undefined;
}

export interface SpawnRipgrepOptions {
  workspacePath: string;
  query: string;
  contextLines?: number;
  maxResults?: number;
}

export function createSearchService(
  deps: Partial<SearchServiceDeps> = {},
): SearchService {
  const os = deps.os ?? new BunOsCommandRunner();
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
          contextLines: options.contextLines,
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
): Promise<ContentSearchResult[]> {
  const os = deps.os ?? new BunOsCommandRunner();
  const resolveBinary = deps.resolveBinary ?? which;

  const rgPath = await resolveBinary("rg");
  if (!rgPath) {
    throw new SearchServiceError(
      "ripgrep (rg) not found. Please install ripgrep: https://github.com/BurntSushi/ripgrep#installation",
      "NOT_FOUND",
    );
  }

  const { workspacePath, query, contextLines = 2, maxResults = 100 } = options;
  if (query.includes("\0")) {
    throw new SearchServiceError("Invalid search query", "INVALID_REGEX");
  }

  const args = [
    "--json",
    "-i",
    "-n",
    "--context",
    String(contextLines),
    "--max-count",
    String(maxResults),
    "--",
    query,
    ".",
  ];

  const { exitCode, stdout, stderr } = await os.run([rgPath, ...args], {
    cwd: workspacePath,
  });

  if (exitCode === 1 && stderr.trim().length === 0) {
    return [];
  }

  if (exitCode !== 0) {
    if (stderr.includes("error parsing regex") || stderr.includes("parse error")) {
      throw new SearchServiceError(
        `Invalid regex: ${query}. Use escape for literals: \\. \\* \\+`,
        "INVALID_REGEX",
      );
    }
    throw new SearchServiceError("ripgrep execution failed", "EXECUTION_FAILED");
  }

  return parseRipgrepOutput(stdout, contextLines, workspacePath);
}

function normalizeResultPath(pathText: string, workspacePath: string): string {
  const normalizedWorkspace = workspacePath.replace(/\\/g, "/").replace(/\/+$/, "");
  let normalized = String(pathText || "").replace(/\\/g, "/");
  if (normalized.startsWith("./")) normalized = normalized.slice(2);
  if (normalized.startsWith(normalizedWorkspace + "/")) {
    normalized = normalized.slice(normalizedWorkspace.length + 1);
  }
  return normalized;
}

function parseRipgrepOutput(
  output: string,
  contextLines: number,
  workspacePath: string,
): ContentSearchResult[] {
  const results: ContentSearchResult[] = [];
  const lines = output.split("\n").filter((line) => line.trim().length > 0);
  const contextByFile = new Map<string, { before: string[]; after: string[] }>();

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const type = obj.type;
      const data = obj.data;

      if (!data || !data.path) continue;

      const path = normalizeResultPath(data.path.text, workspacePath);
      const lineNum = data.line_number;

      if (type === "context") {
        const existing = contextByFile.get(path) || { before: [], after: [] };
        if (data.lines && data.lines.text) {
          if (lineNum < (results[results.length - 1]?.line ?? 0)) {
            existing.before.push(data.lines.text);
          } else {
            existing.after.push(data.lines.text);
          }
        }
        contextByFile.set(path, existing);
        continue;
      }

      if (type === "match") {
        const text = data.lines?.text ?? "";
        const submatches = data.submatches ?? [];
        const matchStart = submatches[0]?.start ?? 0;
        const matchEnd = submatches[0]?.end ?? text.length;
        const column = data["data"]?.chunk?.offset ?? matchStart;

        const context = contextByFile.get(path) || { before: [], after: [] };

        results.push({
          path,
          line: lineNum,
          column,
          text,
          matchStart,
          matchEnd,
          before: context.before.slice(-contextLines),
          after: context.after.slice(0, contextLines),
        });

        contextByFile.set(path, { before: [], after: [] });
      }
    } catch {
      // skip invalid JSON
    }
  }

  return results;
}
