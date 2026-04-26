/**
 * OS Abstraction Layer — Interfaces
 *
 * Injectable, testable abstractions over Node.js/Bun OS operations.
 *
 * Design principles (from core-engineering.md):
 * - No hidden globals: process.env is read ONLY at the system boundary (index.ts)
 *   and passed into these interfaces via constructor.
 * - No singletons: each OS instance is created per-context via factory.
 * - Pure functions inward: side effects (fs, spawn) are abstracted and injected.
 */

// ── Command Runner ────────────────────────────────────────────────────────

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  stdin?: string | Uint8Array;
}

export interface CommandResult {
  success: boolean;
  output: string;
  error: string;
  exitCode: number;
}

export interface SpawnedProcess {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  stdin: WritableStream<Uint8Array>;
  kill(signal?: string): void;
  exited: Promise<number>;
}

export interface CommandRunner {
  run(command: string[], options?: RunOptions): Promise<CommandResult>;

  spawn(command: string[], options?: RunOptions): SpawnedProcess;
}

// ── File System ───────────────────────────────────────────────────────────

export interface MkdirOptions {
  recursive?: boolean;
}

export interface WriteFileOptions {
  mode?: number;
  encoding?: BufferEncoding;
}

export interface ReadDirOptions {
  withFileTypes?: boolean;
}

export interface DirEnt {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface FileWatcher {
  close(): void;
  on(event: "error", handler: (err: NodeJS.ErrnoException) => void): void;
  on(event: "ready", handler: () => void): void;
}

export interface FileSystem {
  exists(path: string): Promise<boolean>;
  readFile(path: string, encoding?: BufferEncoding): Promise<string>;
  writeFile(path: string, content: string, options?: WriteFileOptions): Promise<void>;
  mkdir(path: string, options?: MkdirOptions): Promise<void>;
  unlink(path: string): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  watch(
    path: string,
    options?: { recursive?: boolean; ignored?: (path: string) => boolean },
    listener?: (eventType: string, filename: string | null) => void,
  ): FileWatcher;
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  readdir(path: string, options?: ReadDirOptions): Promise<string[] | DirEnt[]>;
  stat(path: string): Promise<{
    isDirectory(): boolean;
    isFile(): boolean;
    size: number;
  }>;
  lstat(path: string): Promise<{
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
    size: number;
  }>;
  cp(
    src: string,
    dest: string,
    options?: { recursive?: boolean; preserveTimestamps?: boolean },
  ): Promise<void>;
  utimes(path: string, atime: Date | number, mtime: Date | number): Promise<void>;
  realpath(path: string): Promise<string>;
  mkdtemp(prefix: string): Promise<string>;
}

// ── Environment ───────────────────────────────────────────────────────────

/**
 * Environment is backed by an explicit map, NOT process.env.
 * The map is populated at the system boundary (index.ts) and injected.
 */
export interface Environment {
  get(key: string): string | undefined;
  getOrThrow(key: string): string;
  getAll(): Record<string, string | undefined>;
  has(key: string): boolean;
}

// ── Path Resolver ─────────────────────────────────────────────────────────

export interface PathResolver {
  homeDir(): string;
  tempDir(): string;
  join(...paths: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  relative(from: string, to: string): string;
  resolve(...paths: string[]): string;
}

// ── OS Facade (bundles all abstractions for convenient injection) ─────────

export interface OS {
  command: CommandRunner;
  fs: FileSystem;
  env: Environment;
  path: PathResolver;
}
