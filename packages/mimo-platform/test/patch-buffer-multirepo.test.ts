import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createOS } from "../src/infrastructure/os/node-adapter.js";
import { createExpertService } from "../src/domain/files/expert-service.js";

describe("repo-qualified patch storage", () => {
  it("keeps same-path patches distinct per repository", async () => {
    const root = mkdtempSync(join(tmpdir(), "mimo-patch-repos-"));
    const os = createOS({ ...process.env });
    const expert = createExpertService(os);
    try {
      const backend = join(root, "backend");
      const frontend = join(root, "frontend");
      mkdirSync(join(backend, "src"), { recursive: true });
      mkdirSync(join(frontend, "src"), { recursive: true });

      await expert.writePatchFile(backend, "src/index.ts", "backend patch");
      await expert.writePatchFile(frontend, "src/index.ts", "frontend patch");

      const backendPatches = await expert.listPatchFiles(backend, "backend");
      const frontendPatches = await expert.listPatchFiles(frontend, "frontend");
      expect(backendPatches).toEqual([
        {
          repoId: "backend",
          originalPath: "src/index.ts",
          patchPath: ".mimo-patches/src/index.ts",
        },
      ]);
      expect(frontendPatches).toEqual([
        {
          repoId: "frontend",
          originalPath: "src/index.ts",
          patchPath: ".mimo-patches/src/index.ts",
        },
      ]);

      const approved = await expert.approvePatch(backend, "src/index.ts");
      expect(approved.success).toBe(true);
      expect(approved.content).toBe("backend patch");
      expect(await expert.listPatchFiles(backend, "backend")).toEqual([]);
      expect(await expert.listPatchFiles(frontend, "frontend")).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
