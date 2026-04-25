import { spawn } from "child_process";
import { which } from "bun";
import type { ContentSearchResult } from "./types.js";

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

export function spawnRipgrep(options: SpawnRipgrepOptions): Promise<ContentSearchResult[]> {
  return new Promise(async (resolve, reject) => {
    const rgPath = await which("rg");
    if (!rgPath) {
      reject(new SearchServiceError(
        "ripgrep (rg) not found. Please install ripgrep: https://github.com/BurntSushi/ripgrep#installation",
        "NOT_FOUND"
      ));
      return;
    }

    const { workspacePath, query, contextLines = 2, maxResults = 100 } = options;
    if (query.includes("\0")) {
      reject(
        new SearchServiceError(
          "Invalid search query",
          "INVALID_REGEX",
        ),
      );
      return;
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

    const child = spawn(rgPath, args, { cwd: workspacePath });
    const results: ContentSearchResult[] = [];
    let buffer = "";
    let hasError = false;
    let errorMessage = "";

    child.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      if (text.includes("error parsing regex") || text.includes("parse error")) {
        hasError = true;
        errorMessage = text;
        child.kill();
      }
    });

    child.on("error", () => {
      hasError = true;
      reject(new SearchServiceError(
        "Failed to execute ripgrep",
        "EXECUTION_FAILED"
      ));
    });

    child.on("close", (code) => {
      if (hasError) {
        if (errorMessage.includes("parsing regex") || errorMessage.includes("parse error")) {
          reject(new SearchServiceError(
            `Invalid regex: ${query}. Use escape for literals: \\. \\* \\+`,
            "INVALID_REGEX"
          ));
        } else {
          reject(new SearchServiceError(
            "ripgrep execution failed",
            "EXECUTION_FAILED"
          ));
        }
        return;
      }

      const parsed = parseRipgrepOutput(buffer, contextLines, workspacePath);
      resolve(parsed);
    });
  });
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
