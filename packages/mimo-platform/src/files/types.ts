// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

export interface FileInfo {
  path: string;
  name: string;
  size: number;
}

export interface FileContent {
  path: string;
  name: string;
  content: string;
  language: string;
  lineCount: number;
}

export interface FileService {
  listFiles: (workspacePath: string) => Promise<FileInfo[]>;
  readFile: (workspacePath: string, filePath: string) => Promise<string>;
}
