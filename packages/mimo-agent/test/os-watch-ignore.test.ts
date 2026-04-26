import { describe, it, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createOS } from "../src/os/node-adapter.js";

describe("NodeFileSystem.watch ignored predicate", () => {
  it("does not invoke listener for ignored paths", async () => {
    const os = createOS({ ...process.env });
    const root = mkdtempSync(join(tmpdir(), "mimo-watch-ignore-"));

    const seen: string[] = [];
    const watcher = os.fs.watch(
      root,
      {
        recursive: true,
        ignored: (watchPath) => watchPath.endsWith("ignored.txt"),
      },
      (_event, filename) => {
        if (filename) seen.push(filename);
      },
    );

    await new Promise<void>((resolve) => watcher.on("ready", resolve));
    writeFileSync(join(root, "ignored.txt"), "ignored");
    await new Promise((resolve) => setTimeout(resolve, 700));

    watcher.close();
    rmSync(root, { recursive: true, force: true });

    expect(seen.some((p) => p.includes("ignored.txt"))).toBe(false);
  });
});
