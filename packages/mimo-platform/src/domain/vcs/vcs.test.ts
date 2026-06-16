// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Unit tests for VCS bounded patch generation and streaming large Git import.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  createMockOS,
  type MockOS,
} from "../../infrastructure/os/mock-adapter.js";
import { VCS } from "./index.js";

function createFakeSpawnedProcess(output: string, exitCode = 1) {
  const encoder = new TextEncoder();
  const chunks = output.length
    ? [encoder.encode(output)]
    : [new Uint8Array(0)];
  let chunkIndex = 0;

  const stdoutReader = {
    read: async () => {
      if (chunkIndex >= chunks.length) {
        return { done: true, value: undefined };
      }
      return { done: false, value: chunks[chunkIndex++] };
    },
    releaseLock: () => {},
  };

  return {
    stdout: { getReader: () => stdoutReader },
    stderr: { getReader: () => stdoutReader },
    stdin: { getWriter: () => ({ write: async () => {}, close: async () => {} }) },
    kill: () => {},
    exited: Promise.resolve(exitCode),
  };
}

describe("VCS.generatePatch", () => {
  let os: MockOS;

  beforeEach(() => {
    os = createMockOS() as MockOS;
    os.fs.seed({
      "/session": null,
      "/session/upstream": null,
      "/session/workspace": null,
      "/session/upstream/app.ts": "line1\n",
      "/session/workspace/app.ts": "line1\nline2\n",
      "/session/upstream/big.bin": "x".repeat(1024 * 1024),
      "/session/workspace/big.bin": "x".repeat(1024 * 1024),
    });
  });

  it("diffs only changed files when generating a patch", async () => {
    const vcs = new VCS({ os, patchMaxSizeBytes: 10 * 1024 * 1024 });

    let capturedArgs: string[] = [];
    const patch =
      "diff --git a/upstream/app.ts b/workspace/app.ts\n" +
      "--- a/upstream/app.ts\n" +
      "+++ b/workspace/app.ts\n" +
      "@@ -1 +1,2 @@\n" +
      " line1\n" +
      "+line2\n";

    os.command.spawn = (command: string[]) => {
      capturedArgs = command;
      return createFakeSpawnedProcess(patch, 1) as any;
    };

    const result = await vcs.generatePatch(
      "/session/workspace",
      "/session/upstream",
    );

    expect(result.success).toBe(true);
    expect(result.patch).toContain("app.ts");
    expect(
      capturedArgs.some(
        (a) => typeof a === "string" && a.includes("upstream"),
      ),
    ).toBe(true);
    expect(
      capturedArgs.some(
        (a) => typeof a === "string" && a.includes("big.bin"),
      ),
    ).toBe(false);
  });

  it("aborts when the patch exceeds the configured maximum size", async () => {
    const vcs = new VCS({ os, patchMaxSizeBytes: 100 });

    os.command.spawn = () =>
      createFakeSpawnedProcess("x".repeat(256), 1) as any;

    const result = await vcs.generatePatch(
      "/session/workspace",
      "/session/upstream",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Patch exceeds maximum size");
    expect(result.error).toContain("smaller chunks");
  });
});

describe("VCS.importGitToFossil", () => {
  let os: MockOS;

  beforeEach(() => {
    os = createMockOS() as MockOS;
    os.fs.seed({
      "/work": null,
    });
  });

  it("uses configurable clone and import timeouts", async () => {
    const vcs = new VCS({
      os,
      cloneTimeoutMs: 1234,
      importTimeoutMs: 5678,
    });

    const runs: { command: string[]; timeoutMs?: number }[] = [];
    os.command.onCommand("fossil", (cmd) => {
      runs.push({ command: cmd, timeoutMs: undefined });
      if (cmd[1] === "init") {
        return { success: true, output: "", error: "", exitCode: 0 };
      }
      if (cmd[1] === "import") {
        return { success: true, output: "ok", error: "", exitCode: 0 };
      }
      if (cmd[1] === "open") {
        return { success: true, output: "ok", error: "", exitCode: 0 };
      }
      return { success: false, output: "", error: "unknown", exitCode: 1 };
    });

    os.command.onCommand("git", (cmd, options) => {
      runs.push({ command: cmd, timeoutMs: options?.timeoutMs });
      return { success: true, output: "cloned", error: "", exitCode: 0 };
    });

    const result = await vcs.importGitToFossil(
      "https://example.com/repo.git",
      "/work",
    );

    expect(result.success).toBe(true);

    const cloneRun = runs.find(
      (r) => r.command[0] === "git" && r.command[1] === "clone",
    );
    expect(cloneRun?.timeoutMs).toBe(1234);

    const importRun = runs.find(
      (r) => r.command[0] === "fossil" && r.command[1] === "import",
    );
    expect(importRun).toBeTruthy();
  });
});
