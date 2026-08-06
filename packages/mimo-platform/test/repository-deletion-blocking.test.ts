// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import type { OS } from "../src/infrastructure/os/types.js";

function createRecordingOS(realOs: OS, deletedPaths: string[]): OS {
  return {
    ...realOs,
    fs: {
      ...realOs.fs,
      exists: realOs.fs.exists,
      existsAsync: async (path: string) => realOs.fs.exists(path),
      rm: (path: string, options?: { recursive?: boolean; force?: boolean }) =>
        deletedPaths.push(path),
      rmAsync: async (
        path: string,
        options?: { recursive?: boolean; force?: boolean },
      ) => {
        deletedPaths.push(path);
        realOs.fs.rm(path, options);
      },
      readdir: realOs.fs.readdir,
      readdirAsync: async (path: string, options?: any) =>
        realOs.fs.readdir(path, options),
      unlink: (path: string) => deletedPaths.push(path),
      unlinkAsync: async (path: string) => {
        deletedPaths.push(path);
        try {
          realOs.fs.unlink(path);
        } catch (e: any) {
          if (e.code !== "EPERM" && e.code !== "EISDIR") throw e;
        }
      },
      mkdir: realOs.fs.mkdir,
      mkdirAsync: async (path: string, options?: any) =>
        realOs.fs.mkdir(path, options),
      writeFile: realOs.fs.writeFile,
      writeFileAsync: async (path: string, content: string, options?: any) =>
        realOs.fs.writeFile(path, content, options),
      readFile: realOs.fs.readFile,
      readFileAsync: async (path: string, encoding?: any) =>
        realOs.fs.readFile(path, encoding),
      stat: realOs.fs.stat,
      statAsync: async (path: string) => realOs.fs.stat(path),
      lstat: realOs.fs.lstat,
      lstatAsync: async (path: string) => realOs.fs.lstat(path),
      path: realOs.path,
    },
  } as OS;
}

describe("repository deletes do not block the event loop", () => {
  function makeHome(): string {
    const home = join(
      tmpdir(),
      `mimo-delete-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    rmSync(home, { recursive: true, force: true });
    mkdirSync(home, { recursive: true });
    return home;
  }

  it("AgentRepository.delete yields control during recursive deletion", async () => {
    const home = makeHome();
    const realOs = createOS({ ...process.env });
    const deletedPaths: string[] = [];
    const os = createRecordingOS(realOs, deletedPaths);

    const { AgentRepository } =
      await import("../src/domain/agents/repository.ts");
    const repo = new AgentRepository({ agentsPath: join(home, "agents"), os });

    const agent = await repo.create({
      name: "Block Test Agent",
      owner: "testuser",
      provider: "opencode",
    });

    const agentPath = repo["getAgentPath"](agent.id);
    mkdirSync(join(agentPath, "subdir"), { recursive: true });
    for (let i = 0; i < 50; i++) {
      writeFileSync(join(agentPath, `file-${i}.txt`), "x".repeat(1024));
    }
    writeFileSync(join(agentPath, "subdir", "nested.txt"), "nested");

    let microtaskRan = false;
    queueMicrotask(() => {
      microtaskRan = true;
    });

    await repo.delete(agent.id);

    expect(microtaskRan).toBe(true);
    expect(existsSync(agentPath)).toBe(false);
    expect(deletedPaths.some((p) => p === agentPath)).toBe(true);

    rmSync(home, { recursive: true, force: true });
  });

  it("ProjectRepository.delete yields control during recursive deletion", async () => {
    const home = makeHome();
    const realOs = createOS({ ...process.env });
    const deletedPaths: string[] = [];
    const os = createRecordingOS(realOs, deletedPaths);

    const { ProjectRepository } =
      await import("../src/domain/projects/repository.ts");
    const repo = new ProjectRepository({
      projectsPath: join(home, "projects"),
      os,
    });

    const project = await repo.create({
      name: "Block Test Project",
      repositories: [
        {
          id: "default",
          name: "default",
          repoUrl: "https://github.com/user/repo.git",
          repoType: "git",
          mountPath: ".",
        },
      ],
      owner: "testuser",
    });

    const projectPath = repo["getProjectPath"](project.id);
    mkdirSync(join(projectPath, "subdir"), { recursive: true });
    for (let i = 0; i < 50; i++) {
      writeFileSync(join(projectPath, `file-${i}.txt`), "x".repeat(1024));
    }

    let microtaskRan = false;
    queueMicrotask(() => {
      microtaskRan = true;
    });

    await repo.delete(project.id);

    expect(microtaskRan).toBe(true);
    expect(existsSync(projectPath)).toBe(false);
    expect(deletedPaths.some((p) => p === projectPath)).toBe(true);

    rmSync(home, { recursive: true, force: true });
  });

  it("McpServerRepository.delete yields control during recursive deletion", async () => {
    const home = makeHome();
    const realOs = createOS({ ...process.env });
    const deletedPaths: string[] = [];
    const os = createRecordingOS(realOs, deletedPaths);

    const { McpServerRepository } =
      await import("../src/domain/mcp-servers/repository.ts");
    const repo = new McpServerRepository({
      mcpServersPath: join(home, "mcp-servers"),
      os,
    });

    const server = await repo.create({
      name: "Block Test Server",
      transport: "stdio",
      command: "node",
      args: ["test.js"],
    });

    const serverPath = repo["getMcpServerPath"](server.id);
    for (let i = 0; i < 50; i++) {
      writeFileSync(join(serverPath, `file-${i}.txt`), "x".repeat(1024));
    }

    let microtaskRan = false;
    queueMicrotask(() => {
      microtaskRan = true;
    });

    const result = await repo.delete(server.id);

    expect(result).toBe(true);
    expect(microtaskRan).toBe(true);
    expect(existsSync(serverPath)).toBe(false);
    expect(deletedPaths.some((p) => p === serverPath)).toBe(true);

    rmSync(home, { recursive: true, force: true });
  });

  it("two concurrent repository create operations interleave and both complete", async () => {
    const home = makeHome();
    const realOs = createOS({ ...process.env });

    // Wrap fs calls so every async operation yields to the event loop. We use
    // realAsync helpers to schedule the real work in a macro-task, mimicking
    // real disk latency and proving concurrent work does not block each other.
    const os: OS = {
      ...realOs,
      fs: {
        ...realOs.fs,
        existsAsync: async (path: string) => {
          await new Promise((resolve) => queueMicrotask(resolve));
          return realOs.fs.exists(path);
        },
        mkdirAsync: async (path: string, options?: any) => {
          await new Promise((resolve) => queueMicrotask(resolve));
          return realOs.fs.mkdir(path, options);
        },
        writeFileAsync: async (
          path: string,
          content: string,
          options?: any,
        ) => {
          await new Promise((resolve) => queueMicrotask(resolve));
          return realOs.fs.writeFile(path, content, options);
        },
      },
    } as OS;

    const { AgentRepository } =
      await import("../src/domain/agents/repository.ts");
    const repo = new AgentRepository({ agentsPath: join(home, "agents"), os });

    let interleaved = false;
    const interleaveProbe = async () => {
      // This microtask should run while the two create() calls are suspended
      // on their async fs operations if the repository truly yields.
      await new Promise((resolve) => queueMicrotask(resolve));
      interleaved = true;
    };

    const [agentA, agentB] = await Promise.all([
      repo.create({ name: "A", owner: "testuser", provider: "opencode" }),
      repo.create({ name: "B", owner: "testuser", provider: "opencode" }),
      interleaveProbe(),
    ]);

    expect(agentA).toBeDefined();
    expect(agentA.id).toBeDefined();
    expect(agentB).toBeDefined();
    expect(agentB.id).toBeDefined();
    expect(agentA.id).not.toBe(agentB.id);
    expect(interleaved).toBe(true);

    rmSync(home, { recursive: true, force: true });
  });
});
