/**
 * Node.js / Bun OS Adapter — Real implementation backed by Node APIs.
 *
 * All dependencies are explicit. Environment values are injected via constructor,
 * NOT read from process.env. This keeps the boundary clean.
 */
import { spawn as nodeSpawn, type ChildProcess } from "child_process";
import {
  promises as fs,
  type Dirent,
} from "fs";
import chokidar from "chokidar";
import { homedir, tmpdir } from "os";
import { join, dirname, basename, relative, resolve } from "path";
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
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30000;

// ── Command Runner ────────────────────────────────────────────────────────

class NodeCommandRunner implements CommandRunner {
  async run(
    command: string[],
    options: RunOptions = {},
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = nodeSpawn(command[0], command.slice(1), {
        cwd: options.cwd,
        env: options.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      const timer = options.timeoutMs
        ? setTimeout(() => {
            child.kill();
            reject(new Error(`Timeout after ${options.timeoutMs}ms`));
          }, options.timeoutMs)
        : null;

      if (options.stdin && child.stdin) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      }

      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        resolve({
          success: code === 0,
          output: stdout.trim(),
          error: stderr.trim(),
          exitCode: code ?? -1,
        });
      });

      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      });
    });
  }

  spawn(command: string[], options: RunOptions = {}): SpawnedProcess {
    const child = nodeSpawn(command[0], command.slice(1), {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (options.stdin && child.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }

    return this.wrapChildProcess(child);
  }

  private wrapChildProcess(child: ChildProcess): SpawnedProcess {
    const wrapStream = (
      stream: NodeJS.ReadableStream | null,
    ): ReadableStream<Uint8Array> => {
      if (!stream) {
        return new ReadableStream({
          start(controller) {
            controller.close();
          },
        });
      }
      return new ReadableStream({
        start(controller) {
          stream.on("data", (chunk: Buffer) =>
            controller.enqueue(new Uint8Array(chunk)),
          );
          stream.on("end", () => controller.close());
          stream.on("error", (err) => controller.error(err));
        },
      });
    };

    const wrapWritable = (
      stream: NodeJS.WritableStream | null,
    ): WritableStream<Uint8Array> => {
      if (!stream) {
        return new WritableStream();
      }
      return new WritableStream({
        write(chunk) {
          return new Promise((resolve, reject) => {
            stream.write(chunk, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        },
        close() {
          return new Promise((resolve) => {
            stream.end(() => resolve());
          });
        },
      });
    };

    return {
      stdout: wrapStream(child.stdout),
      stderr: wrapStream(child.stderr),
      stdin: wrapWritable(child.stdin),
      kill(signal?: string) {
        child.kill(signal as NodeJS.Signals);
      },
      exited: new Promise((resolve) => {
        child.on("close", (code) => resolve(code ?? -1));
      }),
    };
  }
}

// ── File System ───────────────────────────────────────────────────────────

class NodeFileSystem implements FileSystem {
  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(path: string, encoding: BufferEncoding = "utf8"): Promise<string> {
    return fs.readFile(path, encoding);
  }

  async writeFile(path: string, content: string, options = {}): Promise<void> {
    await fs.writeFile(path, content, options);
  }

  async mkdir(path: string, options = {}): Promise<void> {
    await fs.mkdir(path, options);
  }

  async unlink(path: string): Promise<void> {
    await fs.unlink(path);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    await fs.copyFile(src, dest);
  }

  async chmod(path: string, mode: number): Promise<void> {
    await fs.chmod(path, mode);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath);
  }

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    await fs.rm(path, options as any);
  }

  async readdir(path: string, options?: ReadDirOptions): Promise<string[] | DirEnt[]> {
    const entries = options
      ? await fs.readdir(path, options as any)
      : await fs.readdir(path);
    if (options?.withFileTypes) {
      return (entries as unknown as Dirent[]).map((e) => ({
        name: e.name,
        isDirectory: () => e.isDirectory(),
        isFile: () => e.isFile(),
      }));
    }
    return entries as string[];
  }

  async stat(path: string) {
    const s = await fs.stat(path);
    return {
      isDirectory: () => s.isDirectory(),
      isFile: () => s.isFile(),
      size: s.size,
    };
  }

  async lstat(path: string) {
    const s = await fs.lstat(path);
    return {
      isDirectory: () => s.isDirectory(),
      isFile: () => s.isFile(),
      isSymbolicLink: () => s.isSymbolicLink(),
      size: s.size,
    };
  }

  async cp(
    src: string,
    dest: string,
    options?: { recursive?: boolean; preserveTimestamps?: boolean },
  ): Promise<void> {
    await fs.cp(src, dest, options);
  }

  watch(
    watchPath: string,
    options?: { recursive?: boolean; ignored?: (path: string) => boolean },
    listener?: (eventType: string, filename: string | null) => void,
  ): FileWatcher {
    const watcher = chokidar.watch(watchPath, {
      persistent: true,
      depth: options?.recursive ? undefined : 0,
      ignored: options?.ignored,
      ignoreInitial: true,
      usePolling: true,
      interval: 100,
    });

    if (listener) {
      const rel = (abs: string) => relative(watchPath, abs);
      watcher.on("add", (abs) => listener("rename", rel(abs)));
      watcher.on("change", (abs) => listener("change", rel(abs)));
      watcher.on("unlink", (abs) => listener("rename", rel(abs)));
      watcher.on("addDir", (abs) => {
        if (abs !== watchPath) listener("rename", rel(abs));
      });
      watcher.on("unlinkDir", (abs) => listener("rename", rel(abs)));
    }

    return {
      close() {
        watcher.close();
      },
      on(event: "error" | "ready", handler: any) {
        watcher.on(event, handler);
      },
    };
  }

  async utimes(path: string, atime: Date | number, mtime: Date | number): Promise<void> {
    await fs.utimes(path, atime, mtime);
  }

  async realpath(path: string): Promise<string> {
    return fs.realpath(path);
  }

  async mkdtemp(prefix: string): Promise<string> {
    return fs.mkdtemp(prefix);
  }
}

// ── Environment ───────────────────────────────────────────────────────────

class NodeEnvironment implements Environment {
  constructor(private readonly envMap: Record<string, string | undefined>) {}

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
}

// ── Path Resolver ─────────────────────────────────────────────────────────

class NodePathResolver implements PathResolver {
  homeDir(): string {
    return homedir();
  }

  tempDir(): string {
    return tmpdir();
  }

  join(...paths: string[]): string {
    return join(...paths);
  }

  dirname(path: string): string {
    return dirname(path);
  }

  basename(path: string): string {
    return basename(path);
  }

  relative(from: string, to: string): string {
    return relative(from, to);
  }

  resolve(...paths: string[]): string {
    return resolve(...paths);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createOS(envMap: Record<string, string | undefined>): OS {
  return {
    command: new NodeCommandRunner(),
    fs: new NodeFileSystem(),
    env: new NodeEnvironment(envMap),
    path: new NodePathResolver(),
  };
}
