// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from "crypto";
import type { OS } from "../../infrastructure/os/types.js";

export interface TreeManifestEntry {
  size: number;
  mtime: number;
  hash: string;
}

export interface TreeManifest {
  [path: string]: TreeManifestEntry;
}

export interface ManifestStore {
  load(treePath: string): Promise<TreeManifest>;
  save(treePath: string, manifest: TreeManifest): Promise<void>;
  invalidate(treePath: string): Promise<void>;
}

/**
 * Create a per-session manifest store. Each tree's manifest is persisted as
 * `<manifestsDir>/<treeBasename>.json`. The manifest maps relative file paths
 * to `{ size, mtime, hash }` so subsequent scans can skip re-reading files
 * whose stat entry has not changed.
 */
export function createManifestStore(
  os: OS,
  manifestsDir: string,
): ManifestStore {
  function manifestPath(treePath: string): string {
    const basename = os.path.basename(treePath);
    return os.path.join(manifestsDir, `${basename}.json`);
  }

  async function load(treePath: string): Promise<TreeManifest> {
    const path = manifestPath(treePath);
    if (!os.fs.exists(path)) {
      return {};
    }
    try {
      const raw = os.fs.readFile(path, "utf8");
      const parsed = JSON.parse(raw) as TreeManifest;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  async function save(
    treePath: string,
    manifest: TreeManifest,
  ): Promise<void> {
    const path = manifestPath(treePath);
    const dir = os.path.dirname(path);
    if (!os.fs.exists(dir)) {
      os.fs.mkdir(dir, { recursive: true });
    }
    const tmpPath = `${path}.tmp`;
    os.fs.writeFile(tmpPath, JSON.stringify(manifest), { encoding: "utf8" });
    os.fs.rename(tmpPath, path);
  }

  async function invalidate(treePath: string): Promise<void> {
    const path = manifestPath(treePath);
    if (os.fs.exists(path)) {
      os.fs.unlink(path);
    }
  }

  return { load, save, invalidate };
}

/**
 * Hash file content using the same MD5 algorithm already used elsewhere.
 */
export function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex");
}
