/**
 * Node.js / Bun OS Adapter — Real implementation backed by Node APIs.
 *
 * All dependencies are explicit. Environment values are injected via constructor,
 * NOT read from process.env. This keeps the boundary clean.
 */
import {
  spawn as nodeSpawn,
  spawnSync as nodeSpawnSync,
  type ChildProcess,
} from "child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  copyFileSync,
  chmodSync,
  renameSync,
  rmSync,
  readdirSync,
  statSync,
  lstatSync,
  utimesSync,
  realpathSync,
  mkdtempSync,
  watch as fsWatch,
  type Dirent,
} from "fs";
import { homedir, tmpdir } from "os";
import {
  join,
  dirname,
  basename,
  relative,
  resolve,
} from "path";
import type {
  CommandRunner,
  CommandResult,
  RunOptions,
  SpawnedProcess,
  FileSystem,
  Environment,
  PathResolver,
  OS,
  DirEnt,
  ReadDirOptions,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30000;

// ── Command Runner ────────────────────────────────────────────────────────

class NodeCommandRunner implements CommandRunner {
  async run(command: string[], options: RunOptions = {}): Promise<CommandResult> {
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

  runSync(command: string[], options: RunOptions = {}): CommandResult {
    const result = nodeSpawnSync(command[0], command.slice(1), {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf8",
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      input: options.stdin,
    });

    if (result.error) {
      const err = result.error as Error & { code?: string };
      return {
        success: false,
        output: (result.stdout || "").trim(),
        error:
          err.code === "ETIMEDOUT"
            ? `${command.join(" ")} timed out`
            : err.message,
        exitCode: -1,
      };
    }

    return {
      success: result.status === 0,
      output: (result.stdout || "").trim(),
      error: (result.stderr || "").trim(),
      exitCode: result.status ?? -1,
    };
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
    const wrapStream = (stream: NodeJS.ReadableStream | null): ReadableStream<Uint8Array> => {
      if (!stream) {
        return new ReadableStream({ start(controller) { controller.close(); } });
      }
      return new ReadableStream({
        start(controller) {
          stream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
          stream.on("end", () => controller.close());
          stream.on("error", (err) => controller.error(err));
        },
      });
    };

    const wrapWritable = (stream: NodeJS.WritableStream | null): WritableStream<Uint8Array> => {
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
  exists(path: string): boolean {
    return existsSync(path);
  }

  readFile(path: string, encoding: BufferEncoding = "utf8"): string {
    return readFileSync(path, encoding);
  }

  writeFile(path: string, content: string, options = {}): void {
    writeFileSync(path, content, options);
  }

  mkdir(path: string, options = {}): void {
    mkdirSync(path, options);
  }

  unlink(path: string): void {
    unlinkSync(path);
  }

  copyFile(src: string, dest: string): void {
    copyFileSync(src, dest);
  }

  chmod(path: string, mode: number): void {
    chmodSync(path, mode);
  }

  rename(oldPath: string, newPath: string): void {
    renameSync(oldPath, newPath);
  }

  rm(path: string, options = {}): void {
    rmSync(path, options);
  }

  readdir(path: string, options?: ReadDirOptions): string[] | DirEnt[] {
    const entries = options ? readdirSync(path, options as any) : readdirSync(path);
    if (options?.withFileTypes) {
      return (entries as unknown as Dirent[]).map((e) => ({
        name: e.name,
        isDirectory: () => e.isDirectory(),
        isFile: () => e.isFile(),
      }));
    }
    return entries as string[];
  }

  stat(path: string) {
    const s = statSync(path);
    return {
      isDirectory: () => s.isDirectory(),
      isFile: () => s.isFile(),
      size: s.size,
    };
  }

  lstat(path: string) {
    const s = lstatSync(path);
    return {
      isDirectory: () => s.isDirectory(),
      isFile: () => s.isFile(),
      isSymbolicLink: () => s.isSymbolicLink(),
      size: s.size,
    };
  }

  cp(src: string, dest: string, options?: { recursive?: boolean; preserveTimestamps?: boolean }): void {
    const { cpSync } = require("fs");
    cpSync(src, dest, options);
  }

  watch(path: string, options?: { recursive?: boolean }, listener?: (eventType: string, filename: string | null) => void): { close(): void } {
    return fsWatch(path, options, listener);
  }

  utimes(path: string, atime: Date | number, mtime: Date | number): void {
    utimesSync(path, atime, mtime);
  }

  realpath(path: string): string {
    return realpathSync(path);
  }

  mkdtemp(prefix: string): string {
    return mkdtempSync(prefix);
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
