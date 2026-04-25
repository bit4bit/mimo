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
    options: SearchOptions
  ) => Promise<ContentSearchResult[]>;
}
