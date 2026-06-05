import { describe, it, expect } from "bun:test";
import path from "path";
import type {
  OS,
  CommandResult,
  RunOptions,
  WriteFileOptions,
} from "../src/infrastructure/os/types.js";
import { createProjectVcsCache } from "../src/domain/projects/vcs-cache.js";

type CommandCall = { command: string[]; options?: RunOptions };
type WriteFileCall = {
  path: string;
  content: string;
  options?: WriteFileOptions;
};

function createMockOS(
  onRun: (command: string[], options?: RunOptions) => Promise<CommandResult>,
  envVars: Record<string, string> = {},
): {
  os: OS;
  calls: CommandCall[];
  files: Map<string, string>;
  dirs: Set<string>;
  writeFileCalls: WriteFileCall[];
} {
  const calls: CommandCall[] = [];
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const writeFileCalls: WriteFileCall[] = [];

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
    writeFile: (p: string, content: string, options?: WriteFileOptions) => {
      writeFileCalls.push({ path: p, content, options });
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
      get: (key: string) => envVars[key],
      getOrThrow: (key: string) => {
        const v = envVars[key];
        if (v === undefined) throw new Error(`Missing env: ${key}`);
        return v;
      },
      getAll: () => ({ ...envVars }),
      has: (key: string) => key in envVars,
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

  return { os, calls, files, dirs, writeFileCalls };
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

  it("injects GIT_SSH_COMMAND for --reference clone with SSH credential and cleans up key file", async () => {
    const projectId = "p-ssh1";
    const projectsPath = "/mimo/projects";
    const cachePath = path.join(projectsPath, projectId, "cache.git");
    const sshRepoUrl = "git@github.com:org/repo.git";
    const privateKey =
      "-----BEGIN RSA PRIVATE KEY-----\nMIItest\n-----END RSA PRIVATE KEY-----\n";

    const { os, calls, files, dirs, writeFileCalls } = createMockOS(
      async (command) => {
        if (
          command[0] === "git" &&
          command[1] === "clone" &&
          command[2] === "--bare"
        ) {
          dirs.add(cachePath);
          return { success: true, output: "", error: "", exitCode: 0 };
        }
        return { success: true, output: "", error: "", exitCode: 0 };
      },
    );

    const cache = createProjectVcsCache({
      os,
      projectsPath,
      vcs: {
        cloneRepository: async () => ({ success: true, output: "", error: "" }),
      } as any,
    });

    const result = await cache.clone({
      projectId,
      repoUrl: sshRepoUrl,
      repoType: "git",
      targetPath: "/tmp/session-upstream",
      credential: {
        id: "cred1",
        name: "test-key",
        type: "ssh",
        privateKey,
        owner: "user1",
        createdAt: new Date(),
      },
    });

    expect(result.success).toBe(true);

    const refCloneCall = calls.find(
      (c) =>
        c.command[0] === "git" &&
        c.command[1] === "clone" &&
        c.command[2] === "--reference",
    );
    expect(refCloneCall).toBeDefined();
    const sshCmd = refCloneCall!.options?.env?.GIT_SSH_COMMAND;
    expect(sshCmd).toBeDefined();
    expect(sshCmd).toContain("-i ");

    const keyPathMatch = sshCmd!.match(/-i "([^"]+)"/);
    expect(keyPathMatch).toBeDefined();
    const cacheCloneKeyPath = keyPathMatch![1];

    const keyWrite = writeFileCalls.find((w) => w.path === cacheCloneKeyPath);
    expect(keyWrite).toBeDefined();
    expect(keyWrite!.options?.mode).toBe(0o600);

    expect(files.has(cacheCloneKeyPath)).toBe(false);
  });

  it("does not set GIT_SSH_COMMAND on --reference clone with HTTPS credential", async () => {
    const projectId = "p-https1";
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
      return { success: true, output: "", error: "", exitCode: 0 };
    });

    const cache = createProjectVcsCache({
      os,
      projectsPath,
      vcs: {
        cloneRepository: async () => ({ success: true, output: "", error: "" }),
      } as any,
    });

    await cache.clone({
      projectId,
      repoUrl: "https://github.com/org/repo.git",
      repoType: "git",
      targetPath: "/tmp/session-upstream",
      credential: {
        id: "cred2",
        name: "https-cred",
        type: "https",
        username: "user",
        password: "pass",
        owner: "user1",
        createdAt: new Date(),
      },
    });

    const refCloneCall = calls.find(
      (c) =>
        c.command[0] === "git" &&
        c.command[1] === "clone" &&
        c.command[2] === "--reference",
    );
    expect(refCloneCall).toBeDefined();
    expect(refCloneCall!.options?.env?.GIT_SSH_COMMAND).toBeUndefined();
  });

  it("does not set GIT_SSH_COMMAND on --reference clone without credential", async () => {
    const projectId = "p-nocred1";
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
      return { success: true, output: "", error: "", exitCode: 0 };
    });

    const cache = createProjectVcsCache({
      os,
      projectsPath,
      vcs: {
        cloneRepository: async () => ({ success: true, output: "", error: "" }),
      } as any,
    });

    await cache.clone({
      projectId,
      repoUrl: "https://github.com/org/repo.git",
      repoType: "git",
      targetPath: "/tmp/session-upstream",
    });

    const refCloneCall = calls.find(
      (c) =>
        c.command[0] === "git" &&
        c.command[1] === "clone" &&
        c.command[2] === "--reference",
    );
    expect(refCloneCall).toBeDefined();
    expect(refCloneCall!.options?.env?.GIT_SSH_COMMAND).toBeUndefined();
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

  it("merges parent env vars into GIT_SSH_COMMAND env for SSH cache operations", async () => {
    const projectId = "p-envmerge";
    const projectsPath = "/mimo/projects";
    const cachePath = path.join(projectsPath, projectId, "cache.git");
    const sshRepoUrl = "git@github.com:org/repo.git";
    const parentEnvVars = { PATH: "/usr/bin:/bin", HOME: "/root" };

    const { os, calls, dirs } = createMockOS(async (command) => {
      if (
        command[0] === "git" &&
        command[1] === "clone" &&
        command[2] === "--bare"
      ) {
        dirs.add(cachePath);
        return { success: true, output: "", error: "", exitCode: 0 };
      }
      return { success: true, output: "", error: "", exitCode: 0 };
    }, parentEnvVars);

    const cache = createProjectVcsCache({
      os,
      projectsPath,
      vcs: {
        cloneRepository: async () => ({ success: true, output: "", error: "" }),
      } as any,
    });

    await cache.clone({
      projectId,
      repoUrl: sshRepoUrl,
      repoType: "git",
      targetPath: "/tmp/session",
      credential: {
        id: "c1",
        name: "k",
        type: "ssh",
        privateKey:
          "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----\n",
        owner: "u",
        createdAt: new Date(),
      },
    });

    const refCloneCall = calls.find(
      (c) =>
        c.command[0] === "git" &&
        c.command[1] === "clone" &&
        c.command[2] === "--reference",
    );
    expect(refCloneCall).toBeDefined();
    const env = refCloneCall!.options?.env;
    expect(env?.PATH).toBe("/usr/bin:/bin");
    expect(env?.HOME).toBe("/root");
    expect(env?.GIT_SSH_COMMAND).toBeDefined();
  });

  it("injects -p <port> and -i <key> in GIT_SSH_COMMAND when SSH credential and clonePort are set", async () => {
    const projectId = "p-port-key";
    const projectsPath = "/mimo/projects";
    const cachePath = path.join(projectsPath, projectId, "cache.git");
    const sshRepoUrl = "git@github.com:org/repo.git";

    const { os, calls, dirs } = createMockOS(async (command) => {
      if (
        command[0] === "git" &&
        command[1] === "clone" &&
        command[2] === "--bare"
      ) {
        dirs.add(cachePath);
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

    await cache.clone({
      projectId,
      repoUrl: sshRepoUrl,
      repoType: "git",
      targetPath: "/tmp/session",
      clonePort: 2222,
      credential: {
        id: "c2",
        name: "k",
        type: "ssh",
        privateKey:
          "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----\n",
        owner: "u",
        createdAt: new Date(),
      },
    });

    const refCloneCall = calls.find(
      (c) =>
        c.command[0] === "git" &&
        c.command[1] === "clone" &&
        c.command[2] === "--reference",
    );
    expect(refCloneCall).toBeDefined();
    const sshCmd = refCloneCall!.options?.env?.GIT_SSH_COMMAND;
    expect(sshCmd).toBeDefined();
    expect(sshCmd).toContain("-i ");
    expect(sshCmd).toContain("-p 2222");

    const bareCloneCall = calls.find(
      (c) =>
        c.command[0] === "git" &&
        c.command[1] === "clone" &&
        c.command[2] === "--bare",
    );
    expect(bareCloneCall!.options?.env?.GIT_SSH_COMMAND).toContain("-p 2222");
  });

  it("injects -p <port> without -i in GIT_SSH_COMMAND when only clonePort is set (no SSH key)", async () => {
    const projectId = "p-port-only";
    const projectsPath = "/mimo/projects";
    const cachePath = path.join(projectsPath, projectId, "cache.git");
    const sshRepoUrl = "git@github.com:org/repo.git";

    const { os, calls, dirs } = createMockOS(async (command) => {
      if (
        command[0] === "git" &&
        command[1] === "clone" &&
        command[2] === "--bare"
      ) {
        dirs.add(cachePath);
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

    await cache.clone({
      projectId,
      repoUrl: sshRepoUrl,
      repoType: "git",
      targetPath: "/tmp/session",
      clonePort: 2222,
    });

    const refCloneCall = calls.find(
      (c) =>
        c.command[0] === "git" &&
        c.command[1] === "clone" &&
        c.command[2] === "--reference",
    );
    expect(refCloneCall).toBeDefined();
    const sshCmd = refCloneCall!.options?.env?.GIT_SSH_COMMAND;
    expect(sshCmd).toBeDefined();
    expect(sshCmd).toContain("-p 2222");
    expect(sshCmd).not.toContain("-i ");
  });

  it("injects -i <key> without -p in GIT_SSH_COMMAND when SSH credential but no clonePort", async () => {
    const projectId = "p-key-only";
    const projectsPath = "/mimo/projects";
    const cachePath = path.join(projectsPath, projectId, "cache.git");
    const sshRepoUrl = "git@github.com:org/repo.git";

    const { os, calls, dirs } = createMockOS(async (command) => {
      if (
        command[0] === "git" &&
        command[1] === "clone" &&
        command[2] === "--bare"
      ) {
        dirs.add(cachePath);
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

    await cache.clone({
      projectId,
      repoUrl: sshRepoUrl,
      repoType: "git",
      targetPath: "/tmp/session",
      credential: {
        id: "c3",
        name: "k",
        type: "ssh",
        privateKey:
          "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----\n",
        owner: "u",
        createdAt: new Date(),
      },
    });

    const refCloneCall = calls.find(
      (c) =>
        c.command[0] === "git" &&
        c.command[1] === "clone" &&
        c.command[2] === "--reference",
    );
    expect(refCloneCall).toBeDefined();
    const sshCmd = refCloneCall!.options?.env?.GIT_SSH_COMMAND;
    expect(sshCmd).toBeDefined();
    expect(sshCmd).toContain("-i ");
    expect(sshCmd).not.toContain("-p ");
  });
});
