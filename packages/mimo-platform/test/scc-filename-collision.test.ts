import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SccService } from "../src/impact/scc-service.js";
import { createOS } from "../src/os/node-adapter.js";

describe("SCC filename collision bug", () => {
  let testDir: string;
  let mockSccPath: string;

  beforeAll(() => {
    testDir = join(tmpdir(), `mimo-scc-collision-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    mockSccPath = join(testDir, "mock-scc");
    // Two files with same basename in different directories
    // SCC returns Filename as basename, Location as relative path
    const mockOutput = JSON.stringify([
      {
        Name: "TypeScript",
        Files: [
          {
            Filename: "utils.ts",
            Location: "src/utils.ts",
            Language: "TypeScript",
            Lines: 20,
            Code: 15,
            Comment: 3,
            Blank: 2,
            Complexity: 3,
          },
          {
            Filename: "utils.ts",
            Location: "lib/utils.ts",
            Language: "TypeScript",
            Lines: 30,
            Code: 25,
            Comment: 3,
            Blank: 2,
            Complexity: 5,
          },
        ],
      },
    ]);
    writeFileSync(
      mockSccPath,
      `#!/bin/bash\necho '${mockOutput}'`,
      { mode: 0o755 },
    );
  });

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should preserve unique paths for files with identical basenames", async () => {
    const os = createOS({ ...process.env });
    const sccService = new SccService(os, mockSccPath, testDir);

    const metrics = await sccService.runScc(testDir);

    // Both files must be present with their full relative paths
    expect(metrics.byFile).toHaveLength(2);

    const paths = metrics.byFile.map((f) => f.path).sort();
    expect(paths).toEqual(["lib/utils.ts", "src/utils.ts"]);

    // Each file should have its own complexity, not overwritten by the other
    const srcFile = metrics.byFile.find((f) => f.path === "src/utils.ts");
    const libFile = metrics.byFile.find((f) => f.path === "lib/utils.ts");

    expect(srcFile).toBeDefined();
    expect(libFile).toBeDefined();
    expect(srcFile!.complexity).toBe(3);
    expect(libFile!.complexity).toBe(5);
    expect(srcFile!.code).toBe(15);
    expect(libFile!.code).toBe(25);

    // Total complexity must be the sum of both files
    expect(metrics.complexity.cyclomatic).toBe(8);
    expect(metrics.linesOfCode.net).toBe(40);
  });
});
