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
