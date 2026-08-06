import { describe, expect, it } from "bun:test";
import {
  resolveRepoByLongestMountPath,
  validateWorkspaceRelativeDir,
} from "../src/domain/sessions/workspace-paths.ts";

describe("workspace-relative session paths", () => {
  it("validates and normalizes workspace-relative directories", () => {
    expect(validateWorkspaceRelativeDir("./backend/packages/api/")).toBe(
      "backend/packages/api",
    );
    expect(validateWorkspaceRelativeDir(".")).toBe(".");
    expect(() => validateWorkspaceRelativeDir("../outside")).toThrow(
      "relativeDir",
    );
    expect(() => validateWorkspaceRelativeDir("/absolute")).toThrow(
      "relativeDir",
    );
    expect(() => validateWorkspaceRelativeDir("backend/.git")).toThrow(
      "relativeDir",
    );
  });

  it("resolves a workspace path by longest matching mountPath", () => {
    const repositories = [
      { id: "root", mountPath: "." },
      { id: "backend", mountPath: "backend" },
      { id: "api", mountPath: "backend/packages/api" },
    ];

    expect(
      resolveRepoByLongestMountPath(
        repositories,
        "backend/packages/api/src/index.ts",
      ),
    ).toEqual({ repoId: "api", path: "src/index.ts" });
    expect(resolveRepoByLongestMountPath(repositories, "backend/README.md")).toEqual(
      { repoId: "backend", path: "README.md" },
    );
    expect(resolveRepoByLongestMountPath(repositories, "README.md")).toEqual({
      repoId: "root",
      path: "README.md",
    });
  });
});
