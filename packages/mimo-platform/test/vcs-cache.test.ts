import { describe, it, expect } from "bun:test";
import path from "path";
import type {
  OS,
  CommandResult,
  RunOptions,
} from "../src/infrastructure/os/types.js";
import { createProjectVcsCache } from "../src/domain/projects/vcs-cache.js";

type CommandCall = { command: string[]; options?: RunOptions };

function createMockOS(
  onRun: (command: string[], options?: RunOptions) => Promise<CommandResult>,
): {
  os: OS;
  calls: CommandCall[];
  files: Map<string, string>;
  dirs: Set<string>;
} {
  const calls: CommandCall[] = [];
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  const ensureDir = (p: string) => {
    let current = p;
    while (current && !dirs.has(current)) {
      dirs.add(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  };

  const fs = {
    exists: (p: string) => dirs.has(p) || files.has(p),
    readFile: (p: string) => files.get(p) ?? "",
    writeFile: (p: string, content: string) => {
      ensureDir(path.dirname(p));
      files.set(p, content);
    },
    appendFile: (p: string, content: string) => {
      ensureDir(path.dirname(p));
      files.set(p, (files.get(p) ?? "") + content);
    },
    mkdir: (p: string) => {
      ensureDir(p);
    },
    unlink: (p: string) => {
      files.delete(p);
    },
    copyFile: () => {},
    chmod: () => {},
    rename: (oldPath: string, newPath: string) => {
      if (files.has(oldPath)) {
        files.set(newPath, files.get(oldPath)!);
        files.delete(oldPath);
      }
      if (dirs.has(oldPath)) {
        dirs.delete(oldPath);
        dirs.add(newPath);
      }
    },
    watch: () => ({ close: () => {} }),
    rm: (p: string) => {
      files.delete(p);
      dirs.delete(p);
    },
    readdir: () => [],
    stat: () => ({ isDirectory: () => true, isFile: () => false, size: 0 }),
    lstat: () => ({
      isDirectory: () => true,
      isFile: () => false,
      isSymbolicLink: () => false,
      size: 0,
    }),
    cp: () => {},
    utimes: () => {},
    realpath: (p: string) => p,
    mkdtemp: (prefix: string) => `${prefix}-tmp`,
  };

  const os: OS = {
    command: {
      run: async (command: string[], options?: RunOptions) => {
        calls.push({ command, options });
        return onRun(command, options);
      },
      runSync: () => ({ success: true, output: "", error: "", exitCode: 0 }),
      spawn: () => ({
        stdout: new ReadableStream<Uint8Array>(),
        stderr: new ReadableStream<Uint8Array>(),
        stdin: new WritableStream<Uint8Array>(),
        kill: () => {},
        exited: Promise.resolve(0),
      }),
    },
    fs,
    env: {
      get: () => undefined,
      getOrThrow: () => "",
      getAll: () => ({}),
      has: () => false,
    },
    path: {
      homeDir: () => "/tmp/home",
      tempDir: () => "/tmp",
      platform: () => "linux",
      arch: () => "x64",
      join: (...parts: string[]) => path.join(...parts),
      dirname: (p: string) => path.dirname(p),
      basename: (p: string) => path.basename(p),
      extname: (p: string) => path.extname(p),
      relative: (from: string, to: string) => path.relative(from, to),
      resolve: (...parts: string[]) => path.resolve(...parts),
    },
  };

  return { os, calls, files, dirs };
}

describe("ProjectVcsCache unit", () => {
  it("uses git cache refresh and reference clone", async () => {
    const projectId = "p1";
    const projectsPath = "/mimo/projects";
    const cachePath = path.join(projectsPath, projectId, "cache.git");

    const { os, calls, dirs } = createMockOS(async (command) => {
      if (
        command[0] === "git" &&
        command[1] === "clone" &&
        command[2] === "--bare"
      ) {
        dirs.add(cachePath);
        return { success: true, output: "", error: "", exitCode: 0 };
      }
      if (
        command[0] === "git" &&
        command[1] === "clone" &&
        command[2] === "--reference"
      ) {
        return { success: true, output: "", error: "", exitCode: 0 };
      }
      return { success: true, output: "", error: "", exitCode: 0 };
    });

    const cache = createProjectVcsCache({
      os,
      projectsPath,
      vcs: {
        cloneRepository: async () => ({ success: true, output: "", error: "" }),
      } as any,
    });

    const result = await cache.clone({
      projectId,
      repoUrl: "file:///repo.git",
      repoType: "git",
      targetPath: "/tmp/session-upstream",
      branch: "main",
    });

    expect(result.success).toBe(true);
    expect(
      calls.some((c) => c.command.join(" ").includes("git clone --bare")),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.command[0] === "git" &&
          c.command[1] === "clone" &&
          c.command[2] === "--reference" &&
          c.command.includes(cachePath),
      ),
    ).toBe(true);
  });

  it("clears and rebuilds git cache when fsck fails", async () => {
    const projectId = "p2";
    const projectsPath = "/mimo/projects";
    const cachePath = path.join(projectsPath, projectId, "cache.git");

    const { os, calls, dirs } = createMockOS(async (command) => {
      if (command[0] === "git" && command[1] === "fsck") {
        return { success: false, output: "", error: "corrupt", exitCode: 1 };
      }
      if (
        command[0] === "git" &&
        command[1] === "clone" &&
        command[2] === "--bare"
      ) {
        dirs.add(cachePath);
        return { success: true, output: "", error: "", exitCode: 0 };
      }
      if (
        command[0] === "git" &&
        command[1] === "clone" &&
        command[2] === "--reference"
      ) {
        return { success: true, output: "", error: "", exitCode: 0 };
      }
      return { success: true, output: "", error: "", exitCode: 0 };
    });
    dirs.add(cachePath);

    const cache = createProjectVcsCache({
      os,
      projectsPath,
      vcs: {
        cloneRepository: async () => ({ success: true, output: "", error: "" }),
      } as any,
    });

    const result = await cache.clone({
      projectId,
      repoUrl: "file:///repo.git",
      repoType: "git",
      targetPath: "/tmp/session-upstream",
    });

    expect(result.success).toBe(true);
    expect(
      calls.some((c) => c.command[0] === "git" && c.command[1] === "fsck"),
    ).toBe(true);
    expect(
      calls.filter((c) => c.command.join(" ").includes("git clone --bare"))
        .length,
    ).toBe(1);
  });

  it("uses fossil cache clone and sync", async () => {
    const projectId = "p3";
    const projectsPath = "/mimo/projects";
    const cachePath = path.join(projectsPath, projectId, "cache.fossil");

    const { os, calls, files } = createMockOS(async (command) => {
      if (command[0] === "fossil" && command[1] === "clone") {
        files.set(cachePath, "fossil");
        return { success: true, output: "", error: "", exitCode: 0 };
      }
      return { success: true, output: "", error: "", exitCode: 0 };
    });

    const cache = createProjectVcsCache({
      os,
      projectsPath,
      vcs: {
        cloneRepository: async () => ({ success: true, output: "", error: "" }),
      } as any,
    });

    const result = await cache.clone({
      projectId,
      repoUrl: "http://repo.fossil",
      repoType: "fossil",
      targetPath: "/tmp/fossil-checkout",
      branch: "trunk",
    });

    expect(result.success).toBe(true);
    expect(
      calls.some((c) => c.command[0] === "fossil" && c.command[1] === "clone"),
    ).toBe(true);
    expect(
      calls.some((c) => c.command[0] === "fossil" && c.command[1] === "open"),
    ).toBe(true);
    expect(
      calls.some(
        (c) => c.command[0] === "fossil" && c.command[1] === "checkout",
      ),
    ).toBe(true);
  });

  it("clears and rebuilds fossil cache when verify fails", async () => {
    const projectId = "p4";
    const projectsPath = "/mimo/projects";
    const cachePath = path.join(projectsPath, projectId, "cache.fossil");

    const { os, calls, files } = createMockOS(async (command) => {
      if (command[0] === "fossil" && command[1] === "verify") {
        return { success: false, output: "", error: "corrupt", exitCode: 1 };
      }
      if (command[0] === "fossil" && command[1] === "clone") {
        files.set(cachePath, "fossil");
        return { success: true, output: "", error: "", exitCode: 0 };
      }
      if (command[0] === "fossil" && command[1] === "open") {
        return { success: true, output: "", error: "", exitCode: 0 };
      }
      return { success: true, output: "", error: "", exitCode: 0 };
    });
    files.set(cachePath, "old");

    const cache = createProjectVcsCache({
      os,
      projectsPath,
      vcs: {
        cloneRepository: async () => ({ success: true, output: "", error: "" }),
      } as any,
    });

    const result = await cache.clone({
      projectId,
      repoUrl: "http://repo.fossil",
      repoType: "fossil",
      targetPath: "/tmp/fossil-checkout",
    });

    expect(result.success).toBe(true);
    expect(
      calls.some((c) => c.command[0] === "fossil" && c.command[1] === "verify"),
    ).toBe(true);
    expect(
      calls.filter((c) => c.command[0] === "fossil" && c.command[1] === "clone")
        .length,
    ).toBe(1);
  });
});
