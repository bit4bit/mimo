/**
 * Mock OS Adapter — Test double for OS abstractions.
 *
 * Provides in-memory file system, fake command runner, and controlled
 * environment/path resolution. Enables fast, deterministic tests without
 * touching the real OS.
 */
import type {
  CommandRunner,
  CommandResult,
  RunOptions,
  SpawnedProcess,
  FileSystem,
  FileWatcher,
  Environment,
  PathResolver,
  OS,
  DirEnt,
  ReadDirOptions,
  MkdirOptions,
  WriteFileOptions,
} from "./types.js";

// ── Mock Command Runner ───────────────────────────────────────────────────

type CommandHandler = (
  command: string[],
  options: RunOptions,
) => CommandResult | Promise<CommandResult>;

export class MockCommandRunner implements CommandRunner {
  private handlers = new Map<string, CommandHandler>();
  private defaultHandler?: CommandHandler;
  private spawnHandlers = new Map<string, SpawnedProcess>();

  /**
   * Register a handler for a specific command (matched by first argument).
   */
  onCommand(bin: string, handler: CommandHandler): void {
    this.handlers.set(bin, handler);
  }

  /**
   * Register a default handler for unmatched commands.
   */
  setDefaultHandler(handler: CommandHandler): void {
    this.defaultHandler = handler;
  }

  /**
   * Register a fake spawned process for a specific command.
   */
  onSpawn(bin: string, process: SpawnedProcess): void {
    this.spawnHandlers.set(bin, process);
  }

  async run(
    command: string[],
    options: RunOptions = {},
  ): Promise<CommandResult> {
    const handler = this.handlers.get(command[0]) ?? this.defaultHandler;
    if (!handler) {
      throw new Error(
        `No mock handler registered for command: ${command.join(" ")}`,
      );
    }
    const result = handler(command, options);
    return result instanceof Promise ? result : Promise.resolve(result);
  }

  runSync(command: string[], options: RunOptions = {}): CommandResult {
    const handler = this.handlers.get(command[0]) ?? this.defaultHandler;
    if (!handler) {
      throw new Error(
        `No mock handler registered for command: ${command.join(" ")}`,
      );
    }
    const result = handler(command, options);
    if (result instanceof Promise) {
      throw new Error(
        "Mock runSync handler returned a Promise. Use run() for async handlers.",
      );
    }
    return result;
  }

  spawn(command: string[], _options: RunOptions = {}): SpawnedProcess {
    const process = this.spawnHandlers.get(command[0]);
    if (!process) {
      throw new Error(`No mock spawn registered for command: ${command[0]}`);
    }
    return process;
  }

  clear(): void {
    this.handlers.clear();
    this.spawnHandlers.clear();
    this.defaultHandler = undefined;
  }
}

// ── Mock File System ──────────────────────────────────────────────────────

interface MockNode {
  type: "file" | "dir";
  content?: string;
  mode?: number;
  children?: Map<string, MockNode>;
  mtime?: Date;
  atime?: Date;
}

export class MockFileSystem implements FileSystem {
  private root = new Map<string, MockNode>();

  private parsePath(path: string): string[] {
    return path.split("/").filter(Boolean);
  }

  private getNode(path: string): MockNode | undefined {
    const parts = this.parsePath(path);
    let current: Map<string, MockNode> = this.root;
    let node: MockNode | undefined;
    for (const part of parts) {
      node = current.get(part);
      if (!node) return undefined;
      if (node.type === "dir") {
        current = node.children!;
      }
    }
    return node;
  }

  private getParent(
    path: string,
  ): { parent: Map<string, MockNode>; name: string } | undefined {
    const parts = this.parsePath(path);
    const name = parts.pop()!;
    let current = this.root;
    for (const part of parts) {
      const node = current.get(part);
      if (!node || node.type !== "dir") return undefined;
      current = node.children!;
    }
    return { parent: current, name };
  }

  exists(path: string): boolean {
    return this.getNode(path) !== undefined;
  }

  readFile(path: string, _encoding?: BufferEncoding): string {
    const node = this.getNode(path);
    if (!node) throw new Error(`ENOENT: ${path}`);
    if (node.type !== "file") throw new Error(`EISDIR: ${path}`);
    return node.content ?? "";
  }

  writeFile(path: string, content: string, options?: WriteFileOptions): void {
    const parentInfo = this.getParent(path);
    if (!parentInfo) throw new Error(`ENOENT: ${path}`);
    const { parent, name } = parentInfo;
    parent.set(name, {
      type: "file",
      content,
      mode: options?.mode,
    });
  }

  mkdir(path: string, options?: MkdirOptions): void {
    const parts = this.parsePath(path);
    let current = this.root;
    for (const part of parts) {
      let node = current.get(part);
      if (!node) {
        if (options?.recursive) {
          const newDir: MockNode = { type: "dir", children: new Map() };
          current.set(part, newDir);
          node = newDir;
        } else {
          throw new Error(`ENOENT: ${path}`);
        }
      }
      if (node.type !== "dir") throw new Error(`ENOTDIR: ${path}`);
      current = node.children!;
    }
  }

  unlink(path: string): void {
    const parentInfo = this.getParent(path);
    if (!parentInfo) throw new Error(`ENOENT: ${path}`);
    const { parent, name } = parentInfo;
    const node = parent.get(name);
    if (!node) throw new Error(`ENOENT: ${path}`);
    if (node.type !== "file") throw new Error(`EISDIR: ${path}`);
    parent.delete(name);
  }

  copyFile(src: string, dest: string): void {
    const content = this.readFile(src);
    this.writeFile(dest, content);
  }

  watch(
    _path: string,
    _options?: { recursive?: boolean },
    _listener?: (eventType: string, filename: string | null) => void,
  ): FileWatcher {
    return {
      close() {},
      on(event: "error" | "ready", handler: any) {
        if (event === "ready") Promise.resolve().then(handler);
      },
    };
  }

  chmod(path: string, mode: number): void {
    const node = this.getNode(path);
    if (!node) throw new Error(`ENOENT: ${path}`);
    node.mode = mode;
  }

  rename(oldPath: string, newPath: string): void {
    const node = this.getNode(oldPath);
    if (!node) throw new Error(`ENOENT: ${oldPath}`);
    this.writeFile(newPath, node.content ?? "");
    this.unlink(oldPath);
  }

  rm(path: string, options?: { recursive?: boolean; force?: boolean }): void {
    const node = this.getNode(path);
    if (!node) {
      if (options?.force) return;
      throw new Error(`ENOENT: ${path}`);
    }
    const parentInfo = this.getParent(path);
    if (!parentInfo) throw new Error(`ENOENT: ${path}`);
    if (node.type === "dir" && !options?.recursive) {
      throw new Error(`EISDIR: ${path}`);
    }
    parentInfo.parent.delete(parentInfo.name);
  }

  readdir(path: string, options?: ReadDirOptions): string[] | DirEnt[] {
    const node = this.getNode(path);
    if (!node) throw new Error(`ENOENT: ${path}`);
    if (node.type !== "dir") throw new Error(`ENOTDIR: ${path}`);
    const entries = Array.from(node.children!.entries());
    if (options?.withFileTypes) {
      return entries.map(([name, child]) => ({
        name,
        isDirectory: () => child.type === "dir",
        isFile: () => child.type === "file",
      }));
    }
    return entries.map(([name]) => name);
  }

  stat(path: string) {
    const node = this.getNode(path);
    if (!node) throw new Error(`ENOENT: ${path}`);
    return {
      isDirectory: () => node!.type === "dir",
      isFile: () => node!.type === "file",
      size: node!.content?.length ?? 0,
    };
  }

  lstat(path: string) {
    const s = this.stat(path);
    return {
      ...s,
      isSymbolicLink: () => false,
    };
  }

  cp(src: string, dest: string, options?: { recursive?: boolean }): void {
    const srcNode = this.getNode(src);
    if (!srcNode) throw new Error(`ENOENT: ${src}`);
    if (srcNode.type === "dir" && !options?.recursive) {
      throw new Error(`EISDIR: ${src}`);
    }
    if (srcNode.type === "dir") {
      this.mkdir(dest, { recursive: true });
      const entries = this.readdir(src) as string[];
      for (const entry of entries) {
        this.cp(`${src}/${entry}`, `${dest}/${entry}`, { recursive: true });
      }
    } else {
      this.writeFile(dest, srcNode.content ?? "");
    }
  }

  utimes(path: string, atime: Date | number, mtime: Date | number): void {
    const node = this.getNode(path);
    if (!node) throw new Error(`ENOENT: ${path}`);
    node.atime = atime instanceof Date ? atime : new Date(atime);
    node.mtime = mtime instanceof Date ? mtime : new Date(mtime);
  }

  realpath(path: string): string {
    // Mock: just return the path as-is (no symlinks in mock)
    return path;
  }

  mkdtemp(prefix: string): string {
    const dirName = `${prefix}${Date.now()}`;
    this.mkdir(dirName, { recursive: true });
    return dirName;
  }

  /**
   * Helper to seed the mock file system with initial state.
   */
  seed(entries: Record<string, string | null>): void {
    for (const [path, content] of Object.entries(entries)) {
      if (content === null) {
        this.mkdir(path, { recursive: true });
      } else {
        const parent = path.split("/").slice(0, -1).join("/");
        if (parent) this.mkdir(parent, { recursive: true });
        this.writeFile(path, content);
      }
    }
  }

  clear(): void {
    this.root.clear();
  }
}

// ── Mock Environment ──────────────────────────────────────────────────────

export class MockEnvironment implements Environment {
  constructor(private envMap: Record<string, string | undefined> = {}) {}

  get(key: string): string | undefined {
    return this.envMap[key];
  }

  getOrThrow(key: string): string {
    const value = this.envMap[key];
    if (value === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  getAll(): Record<string, string | undefined> {
    return { ...this.envMap };
  }

  has(key: string): boolean {
    return this.envMap[key] !== undefined;
  }

  set(key: string, value: string): void {
    this.envMap[key] = value;
  }

  remove(key: string): void {
    delete this.envMap[key];
  }
}

// ── Mock Path Resolver ────────────────────────────────────────────────────

export class MockPathResolver implements PathResolver {
  constructor(
    private _homeDir = "/home/test",
    private _tempDir = "/tmp",
  ) {}

  homeDir(): string {
    return this._homeDir;
  }

  tempDir(): string {
    return this._tempDir;
  }

  join(...paths: string[]): string {
    return paths.join("/").replace(/\/+/g, "/");
  }

  dirname(path: string): string {
    const lastSlash = path.lastIndexOf("/");
    return lastSlash <= 0 ? "/" : path.slice(0, lastSlash);
  }

  basename(path: string): string {
    const parts = path.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  }

  relative(from: string, to: string): string {
    // Simplified mock: just return to if it doesn't start with from
    if (to.startsWith(from + "/")) return to.slice(from.length + 1);
    return to;
  }

  resolve(...paths: string[]): string {
    return this.join(...paths);
  }
}

// ── Mock OS Factory ───────────────────────────────────────────────────────

export interface MockOSOptions {
  env?: Record<string, string | undefined>;
  homeDir?: string;
  tempDir?: string;
}

export function createMockOS(options: MockOSOptions = {}): OS {
  return {
    command: new MockCommandRunner(),
    fs: new MockFileSystem(),
    env: new MockEnvironment(options.env ?? {}),
    path: new MockPathResolver(options.homeDir, options.tempDir),
  };
}

// Type helper for tests
export type MockOS = OS & {
  command: MockCommandRunner;
  fs: MockFileSystem;
  env: MockEnvironment;
  path: MockPathResolver;
};
