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
 *
 * All I/O is asynchronous to avoid blocking the main thread while loading or
 * saving manifests for large repositories.
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
    if (!(await os.fs.existsAsync(path))) {
      return {};
    }
    try {
      const raw = await os.fs.readFileAsync(path, "utf8");
      const parsed = JSON.parse(raw) as TreeManifest;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  async function save(treePath: string, manifest: TreeManifest): Promise<void> {
    const path = manifestPath(treePath);
    const dir = os.path.dirname(path);
    if (!(await os.fs.existsAsync(dir))) {
      await os.fs.mkdirAsync(dir, { recursive: true });
    }
    // Unique tmp name: concurrent scans for the same tree must not clobber
    // each other's tmp file; the last rename wins.
    const tmpPath = `${path}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await os.fs.writeFileAsync(tmpPath, JSON.stringify(manifest), {
        encoding: "utf8",
      });
      await os.fs.renameAsync(tmpPath, path);
    } finally {
      if (await os.fs.existsAsync(tmpPath)) {
        await os.fs.unlinkAsync(tmpPath);
      }
    }
  }

  async function invalidate(treePath: string): Promise<void> {
    const path = manifestPath(treePath);
    if (await os.fs.existsAsync(path)) {
      await os.fs.unlinkAsync(path);
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
