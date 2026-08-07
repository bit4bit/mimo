// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
import crypto from "crypto";

/** A single feature entry on a project's feature list. */
export interface Feature {
  id: string;
  branchName: string;
  description: string;
  done: boolean;
  createdAt: string;
}

/** On-disk shape of a single feature (same as Feature). */
type FeatureRecord = Feature;

/** Input for adding a new feature. Branch names are NOT validated. */
export interface AddFeatureInput {
  branchName: string;
  description: string;
}

/** Input for editing an existing feature. Both fields are optional. */
export interface EditFeatureInput {
  branchName?: string;
  description?: string;
}

/**
 * Repository contract for the per-project feature list store.
 * Implementations persist features to
 * `<projectsPath>/<projectId>/features.json`; a missing file is an empty
 * list.
 */
export interface FeatureRepository {
  /** Returns the feature list for `projectId` (empty if none). */
  list(projectId: string): Promise<Feature[]>;
  /** Adds a feature with `done: false` and returns the updated list. */
  add(projectId: string, input: AddFeatureInput): Promise<Feature>;
  /** Edits a feature's branchName/description; returns the updated feature or null if not found. */
  edit(
    projectId: string,
    featureId: string,
    input: EditFeatureInput,
  ): Promise<Feature | null>;
  /** Removes a feature; returns the remaining list. No-op if the id is absent. */
  delete(projectId: string, featureId: string): Promise<Feature[]>;
  /** Flips the `done` flag of a feature; returns the updated feature or null if not found. */
  toggleDone(projectId: string, featureId: string): Promise<Feature | null>;
}

interface FeatureRepositoryDeps {
  os: OS;
  projectsPath: string;
}

/**
 * Filesystem-backed implementation of {@link FeatureRepository}.
 *
 * Persists the feature list to
 * `<projectsPath>/<projectId>/features.json` as a flat JSON array. Writes
 * are atomic-ish via write-to-temp-then-rename. A missing file is treated
 * as an empty list (backwards compatible).
 */
export class FileFeatureRepository implements FeatureRepository {
  private os: OS;

  constructor(private deps: FeatureRepositoryDeps) {
    this.os = deps.os;
  }

  private getFilePath(projectId: string): string {
    return this.os.path.join(
      this.deps.projectsPath,
      projectId,
      "features.json",
    );
  }

  private async read(projectId: string): Promise<Feature[]> {
    const path = this.getFilePath(projectId);
    if (!(await this.os.fs.existsAsync(path))) {
      return [];
    }
    const content = await this.os.fs.readFileAsync(path, "utf-8");
    try {
      const parsed = JSON.parse(content) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(
        (f): f is FeatureRecord =>
          f !== null &&
          typeof f === "object" &&
          typeof (f as FeatureRecord).id === "string" &&
          typeof (f as FeatureRecord).branchName === "string" &&
          typeof (f as FeatureRecord).description === "string" &&
          typeof (f as FeatureRecord).done === "boolean" &&
          typeof (f as FeatureRecord).createdAt === "string",
      );
    } catch {
      // Corrupt or empty file → treat as empty list.
      return [];
    }
  }

  private async write(projectId: string, features: Feature[]): Promise<void> {
    const path = this.getFilePath(projectId);
    const dir = this.os.path.dirname(path);
    if (!(await this.os.fs.existsAsync(dir))) {
      await this.os.fs.mkdirAsync(dir, { recursive: true });
    }
    const tmpPath = this.os.path.join(
      dir,
      `.features.json.tmp.${crypto.randomUUID()}`,
    );
    await this.os.fs.writeFileAsync(tmpPath, JSON.stringify(features), {
      encoding: "utf-8",
    });
    await this.os.fs.renameAsync(tmpPath, path);
  }

  async list(projectId: string): Promise<Feature[]> {
    return this.read(projectId);
  }

  async add(projectId: string, input: AddFeatureInput): Promise<Feature> {
    const features = await this.read(projectId);
    const feature: Feature = {
      id: crypto.randomUUID(),
      branchName: input.branchName,
      description: input.description,
      done: false,
      createdAt: new Date().toISOString(),
    };
    const next = [...features, feature];
    await this.write(projectId, next);
    return feature;
  }

  async edit(
    projectId: string,
    featureId: string,
    input: EditFeatureInput,
  ): Promise<Feature | null> {
    const features = await this.read(projectId);
    let updated: Feature | null = null;
    const next = features.map((f) => {
      if (f.id === featureId) {
        updated = {
          ...f,
          ...(input.branchName !== undefined && {
            branchName: input.branchName,
          }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
        };
        return updated;
      }
      return f;
    });
    if (!updated) {
      return null;
    }
    await this.write(projectId, next);
    return updated;
  }

  async delete(projectId: string, featureId: string): Promise<Feature[]> {
    const features = await this.read(projectId);
    const next = features.filter((f) => f.id !== featureId);
    if (next.length !== features.length) {
      await this.write(projectId, next);
    }
    return next;
  }

  async toggleDone(
    projectId: string,
    featureId: string,
  ): Promise<Feature | null> {
    const features = await this.read(projectId);
    let toggled: Feature | null = null;
    const next = features.map((f) => {
      if (f.id === featureId) {
        toggled = { ...f, done: !f.done };
        return toggled;
      }
      return f;
    });
    if (!toggled) {
      return null;
    }
    await this.write(projectId, next);
    return toggled;
  }
}
