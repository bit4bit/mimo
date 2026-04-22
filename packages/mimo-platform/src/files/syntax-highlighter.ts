// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

const LANG_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  md: "markdown",
  yaml: "yaml",
  yml: "yaml",
  html: "html",
  css: "css",
  py: "python",
  rs: "rust",
  go: "go",
  sh: "bash",
  bash: "bash",
  toml: "toml",
  xml: "xml",
  sql: "sql",
  ex: "elixir",
  exs: "elixir",
  heex: "elixir",
  leex: "elixir",
  eex: "elixir",
};

export function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANG_MAP[ext] ?? "plaintext";
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
