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

export interface ListFilesOptions {
  cursor?: string;
  limit?: number;
  query?: string;
}

export interface PaginatedFilesResult {
  files: FileInfo[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FileService {
  listFiles: (
    workspacePath: string,
    options?: ListFilesOptions,
  ) => Promise<FileInfo[] | PaginatedFilesResult>;
  readFile: (workspacePath: string, filePath: string) => Promise<string>;
}

export interface ContentSearchResult {
  path: string;
  line: number;
  column: number;
  text: string;
  matchStart: number;
  matchEnd: number;
  before: string[];
  after: string[];
}

export interface SearchOptions {
  contextLines?: number;
  maxResults?: number;
}

export interface SearchService {
  searchContent: (
    workspacePath: string,
    query: string,
    options: SearchOptions,
  ) => Promise<ContentSearchResult[]>;
}
