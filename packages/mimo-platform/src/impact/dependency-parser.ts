// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { dirname, extname, join, normalize } from "path";

export type DependencyParserLanguage = "typescript" | "python" | "elixir";

export interface DependencyEdgeInput {
  source: string;
  target: string;
  file: string;
}

export interface DependencyChange {
  source: string;
  target: string;
  files: string[];
  status: "added" | "removed";
}

export interface DependencyChanges {
  added: DependencyChange[];
  removed: DependencyChange[];
}

export interface DependencyGraph {
  edges: Map<string, Set<string>>;
}

const TYPESCRIPT_IMPORT_REGEX =
  /(?:^|\s)import\s+(?:type\s+)?(?:[\w*${}\s,]+\s+from\s+)?["']([^"']+)["']/gm;
const TYPESCRIPT_REQUIRE_REGEX = /require\(\s*["']([^"']+)["']\s*\)/gm;
const PYTHON_IMPORT_REGEX = /^\s*import\s+([A-Za-z_][\w.]*)/gm;
const PYTHON_FROM_IMPORT_REGEX =
  /^\s*from\s+([A-Za-z_][\w.]*)\s+import\s+[A-Za-z_*][\w*,\s]*/gm;
const ELIXIR_IMPORT_REGEX =
  /^\s*(?:alias|import|use|require)\s+([A-Za-z_][\w.]*)/gm;

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)#.*$/gm, "$1")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

export function parseTypeScriptImports(content: string): string[] {
  const clean = stripComments(content);
  const imports: string[] = [];

  for (const match of clean.matchAll(TYPESCRIPT_IMPORT_REGEX)) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }

  for (const match of clean.matchAll(TYPESCRIPT_REQUIRE_REGEX)) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }

  return unique(imports);
}

export function parsePythonImports(content: string): string[] {
  const clean = stripComments(content);
  const imports: string[] = [];

  for (const match of clean.matchAll(PYTHON_IMPORT_REGEX)) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }

  for (const match of clean.matchAll(PYTHON_FROM_IMPORT_REGEX)) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }

  return unique(imports);
}

export function parseElixirImports(content: string): string[] {
  const clean = stripComments(content);
  const imports: string[] = [];

  for (const match of clean.matchAll(ELIXIR_IMPORT_REGEX)) {
    if (match[1]) {
      imports.push(match[1]);
    }
  }

  return unique(imports);
}

function normalizePath(pathValue: string): string {
  return normalize(pathValue).replace(/\\/g, "/");
}

export function extractTargetDirectory(
  sourceFilePath: string,
  dependencyPath: string,
  language: DependencyParserLanguage,
): string {
  if (language === "python") {
    return dependencyPath.split(".")[0] || dependencyPath;
  }

  if (language === "elixir") {
    const parts = dependencyPath.split(".");
    if (parts.length > 1) {
      return parts[1] || parts[0] || dependencyPath;
    }
    return dependencyPath;
  }

  const sourceDir = dirname(sourceFilePath);

  if (dependencyPath.startsWith("./") || dependencyPath.startsWith("../")) {
    const resolved = normalizePath(join(sourceDir, dependencyPath));
    const extension = extname(resolved);

    if (extension) {
      return normalizePath(dirname(resolved));
    }

    const parts = dependencyPath.split("/");
    if (parts.length <= 2) {
      return resolved;
    }

    return normalizePath(dirname(resolved));
  }

  return normalizePath(dependencyPath);
}

export function isExternalDependency(
  dependencyPath: string,
  language: DependencyParserLanguage,
): boolean {
  if (language === "typescript") {
    return !dependencyPath.startsWith("./") && !dependencyPath.startsWith("../");
  }

  if (language === "elixir") {
    return !dependencyPath.includes(".");
  }

  return false;
}

export function buildDependencyGraph(
  edges: DependencyEdgeInput[],
): DependencyGraph {
  const graph: DependencyGraph = { edges: new Map<string, Set<string>>() };

  for (const edge of edges) {
    const key = `${edge.source}|${edge.target}`;
    const current = graph.edges.get(key) || new Set<string>();
    current.add(edge.file);
    graph.edges.set(key, current);
  }

  return graph;
}

function toChange(
  key: string,
  files: Set<string>,
  status: "added" | "removed",
): DependencyChange {
  const [source, target] = key.split("|");
  return {
    source: source || "",
    target: target || "",
    files: Array.from(files).sort((a, b) => a.localeCompare(b)),
    status,
  };
}

export function compareDependencyGraphs(
  upstream: DependencyGraph,
  workspace: DependencyGraph,
): DependencyChanges {
  const added: DependencyChange[] = [];
  const removed: DependencyChange[] = [];

  for (const [key, files] of workspace.edges) {
    if (!upstream.edges.has(key)) {
      added.push(toChange(key, files, "added"));
    }
  }

  for (const [key, files] of upstream.edges) {
    if (!workspace.edges.has(key)) {
      removed.push(toChange(key, files, "removed"));
    }
  }

  added.sort((a, b) => `${a.source}|${a.target}`.localeCompare(`${b.source}|${b.target}`));
  removed.sort((a, b) => `${a.source}|${a.target}`.localeCompare(`${b.source}|${b.target}`));

  return { added, removed };
}
