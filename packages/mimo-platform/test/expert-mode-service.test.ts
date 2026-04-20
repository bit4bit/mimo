import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ExpertService } from "../src/files/expert-service.js";

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    "expert-service-test-" + Math.random().toString(36).slice(2),
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("ExpertService.readFileContent", () => {
  let workspace: string;
  let service: ExpertService;

  beforeEach(() => {
    workspace = makeTmpDir();
    service = new ExpertService();
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("returns content of an existing file", async () => {
    writeFileSync(join(workspace, "hello.ts"), "const x = 1;", "utf-8");

    const result = await service.readFileContent(workspace, "hello.ts");

    expect(result.content).toBe("const x = 1;");
  });

  it("returns content of a file in a subdirectory", async () => {
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "utils.ts"), "export {};\n", "utf-8");

    const result = await service.readFileContent(workspace, "src/utils.ts");

    expect(result.content).toBe("export {};\n");
  });

  it("throws when file does not exist", async () => {
    await expect(
      service.readFileContent(workspace, "missing.ts"),
    ).rejects.toThrow("File not found");
  });

  it("rejects path traversal with ..", async () => {
    await expect(
      service.readFileContent(workspace, "../etc/passwd"),
    ).rejects.toThrow();
  });
});

describe("ExpertService.writeFileContent", () => {
  let workspace: string;
  let service: ExpertService;

  beforeEach(() => {
    workspace = makeTmpDir();
    service = new ExpertService();
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("writes content to an existing file", async () => {
    writeFileSync(join(workspace, "hello.ts"), "old content", "utf-8");

    const result = await service.writeFileContent(
      workspace,
      "hello.ts",
      "new content",
    );

    expect(result.success).toBe(true);
    expect(readFileSync(join(workspace, "hello.ts"), "utf-8")).toBe(
      "new content",
    );
  });

  it("writes content to a file in a subdirectory", async () => {
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "utils.ts"), "", "utf-8");

    await service.writeFileContent(
      workspace,
      "src/utils.ts",
      "export const x = 1;\n",
    );

    expect(readFileSync(join(workspace, "src", "utils.ts"), "utf-8")).toBe(
      "export const x = 1;\n",
    );
  });

  it("does not create files in non-existent directories", async () => {
    await expect(
      service.writeFileContent(workspace, "nonexistent/file.ts", "content"),
    ).rejects.toThrow();
  });

  it("rejects path traversal with ..", async () => {
    await expect(
      service.writeFileContent(workspace, "../outside.ts", "content"),
    ).rejects.toThrow();
  });
});
