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
  /**
   * Execute a command asynchronously. Returns stdout/stderr as strings.
   */
  run(command: string[], options?: RunOptions): Promise<CommandResult>;

  /**
   * Synchronous variant for legacy code paths.
   * Prefer `run()` for new code.
   */
  runSync(command: string[], options?: RunOptions): CommandResult;

  /**
   * Spawn a long-running process with streaming I/O.
   */
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
  exists(path: string): boolean;
  readFile(path: string, encoding?: BufferEncoding): string;
  writeFile(path: string, content: string, options?: WriteFileOptions): void;
  mkdir(path: string, options?: MkdirOptions): void;
  unlink(path: string): void;
  copyFile(src: string, dest: string): void;
  chmod(path: string, mode: number): void;
  rename(oldPath: string, newPath: string): void;
  watch(
    path: string,
    options?: { recursive?: boolean; ignored?: (path: string) => boolean },
    listener?: (eventType: string, filename: string | null) => void,
  ): FileWatcher;
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  readdir(path: string, options?: ReadDirOptions): string[] | DirEnt[];
  stat(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
    size: number;
  };
  lstat(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
    size: number;
  };
  cp(
    src: string,
    dest: string,
    options?: { recursive?: boolean; preserveTimestamps?: boolean },
  ): void;
  utimes(path: string, atime: Date | number, mtime: Date | number): void;
  realpath(path: string): string;
  mkdtemp(prefix: string): string;
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
