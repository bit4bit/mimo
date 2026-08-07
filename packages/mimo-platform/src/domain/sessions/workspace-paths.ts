// SPDX-License-Identifier: AGPL-3.0-only

export interface WorkspaceRepositoryMount {
  id: string;
  mountPath: string;
}

export interface RepoQualifiedPath {
  repoId: string;
  path: string;
}

function normalizeRelativePath(path: string, fieldName: string): string {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (trimmed === "." || trimmed === "./") {
    return ".";
  }
  const normalized = trimmed.replace(/^\.\//, "").replace(/\/+$/, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").includes("..") ||
    normalized.split("/").includes(".git")
  ) {
    throw new Error(`Invalid ${fieldName}: ${path}`);
  }
  return normalized;
}

export function validateWorkspaceRelativeDir(relativeDir: string): string {
  return normalizeRelativePath(relativeDir, "relativeDir");
}

export function resolveRepoByLongestMountPath(
  repositories: WorkspaceRepositoryMount[],
  workspaceRelativePath: string,
): RepoQualifiedPath {
  const normalizedPath = normalizeRelativePath(workspaceRelativePath, "path");
  let best: { repoId: string; mountPath: string } | null = null;

  for (const repo of repositories) {
    const mountPath = normalizeRelativePath(repo.mountPath, "mountPath");
    const matches =
      mountPath === "." ||
      normalizedPath === mountPath ||
      normalizedPath.startsWith(`${mountPath}/`);
    if (!matches) {
      continue;
    }
    if (!best || mountPath.length > best.mountPath.length) {
      best = { repoId: repo.id, mountPath };
    }
  }

  if (!best) {
    throw new Error(
      `No repository found for workspace path: ${workspaceRelativePath}`,
    );
  }
  if (best.mountPath === ".") {
    return { repoId: best.repoId, path: normalizedPath };
  }
  return {
    repoId: best.repoId,
    path: normalizedPath.slice(best.mountPath.length).replace(/^\//, ""),
  };
}
