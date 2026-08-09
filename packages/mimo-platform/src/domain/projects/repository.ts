// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
import { dump, load } from "js-yaml";
import crypto from "crypto";

export interface ProjectRepositoryEntry {
  id: string;
  name: string;
  repoId?: string;
  repoUrl?: string;
  repoType?: "git" | "fossil";
  credentialId?: string;
  sourceBranch?: string;
  newBranch?: string;
  clonePort?: number;
  mountPath: string;
}

export interface Project {
  id: string;
  name: string;
  owner: string;
  createdAt: Date;
  repositories: ProjectRepositoryEntry[];
  description?: string;
  agentSubpath?: string;
  instructions?: string;
  color?: string;
  iconGlyph?: string;
}

export interface PublicProject {
  id: string;
  name: string;
  description?: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: string;
  agentSubpath?: string;
  instructions?: string;
  color?: string;
  iconGlyph?: string;
}

export interface ProjectData {
  id: string;
  name: string;
  owner: string;
  createdAt: string;
  repositories: ProjectRepositoryEntry[];
  description?: string;
  agentSubpath?: string;
  instructions?: string;
  color?: string;
  iconGlyph?: string;
}

export interface CreateProjectInput {
  name: string;
  owner: string;
  repositories: ProjectRepositoryEntry[];
  description?: string;
  agentSubpath?: string;
  instructions?: string;
  color?: string;
  iconGlyph?: string;
}

interface ProjectRepositoryDeps {
  os: OS;
  projectsPath?: string;
}

function normalizeMountPath(mountPath: string): string {
  const trimmed = mountPath.trim().replace(/\\/g, "/");
  if (trimmed === "." || trimmed === "./") {
    return ".";
  }
  return trimmed.replace(/^\.\//, "").replace(/\/+$/, "");
}

function validateMountPath(mountPath: string): string {
  if (!mountPath || !mountPath.trim()) {
    throw new Error("Repository mountPath is required");
  }
  const normalized = normalizeMountPath(mountPath);
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").includes("..") ||
    normalized.split("/").includes(".git")
  ) {
    throw new Error(`Invalid repository mountPath: ${mountPath}`);
  }
  return normalized;
}

export function validateProjectRepositories(
  repositories: ProjectRepositoryEntry[] | undefined,
): ProjectRepositoryEntry[] | undefined {
  if (!repositories) {
    return undefined;
  }
  if (!Array.isArray(repositories) || repositories.length === 0) {
    throw new Error("Project repositories must be a non-empty array");
  }

  const seenIds = new Set<string>();
  const normalizedMounts: string[] = [];
  const normalized = repositories.map((repo) => {
    if (!repo.id?.trim() || !repo.name?.trim()) {
      throw new Error("Repository id and name are required");
    }
    if (!repo.repoId?.trim() && !repo.repoUrl?.trim()) {
      throw new Error(
        "Repository must reference a managed repository (repoId) or provide a repoUrl",
      );
    }
    if (
      repo.repoType !== undefined &&
      repo.repoType !== "git" &&
      repo.repoType !== "fossil"
    ) {
      throw new Error("Repository type must be 'git' or 'fossil'");
    }
    if (seenIds.has(repo.id)) {
      throw new Error(`Duplicate repository id: ${repo.id}`);
    }
    seenIds.add(repo.id);
    const mountPath = validateMountPath(repo.mountPath);
    normalizedMounts.push(mountPath);
    // Strip legacy per-entry fields that no longer have meaning.
    const { primary: _primary, ...rest } = repo as ProjectRepositoryEntry & {
      primary?: boolean;
    };
    return { ...rest, id: repo.id.trim(), name: repo.name.trim(), mountPath };
  });

  for (let i = 0; i < normalizedMounts.length; i++) {
    for (let j = i + 1; j < normalizedMounts.length; j++) {
      const a = normalizedMounts[i]!;
      const b = normalizedMounts[j]!;
      if (a === b) {
        throw new Error(`Duplicate repository mountPath: ${a}`);
      }
      if (a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) {
        throw new Error(`Nested repository mountPath: ${a} and ${b}`);
      }
    }
  }

  return normalized;
}

function normalizeProjectData(data: ProjectData): ProjectData {
  const { repositories, ...rest } = data;
  // Drop legacy flat mirror fields (repoUrl, repoType, credentialId,
  // sourceBranch, newBranch, clonePort) that may still exist in older YAML.
  const cleaned: Record<string, unknown> = { ...rest };
  for (const legacy of [
    "repoUrl",
    "repoType",
    "credentialId",
    "sourceBranch",
    "newBranch",
    "clonePort",
  ]) {
    delete cleaned[legacy];
  }
  return {
    ...(cleaned as Omit<ProjectData, "repositories">),
    repositories: Array.isArray(repositories)
      ? validateProjectRepositories(repositories)!
      : [],
  };
}

export class ProjectRepository {
  private os: OS;

  constructor(
    private deps: ProjectRepositoryDeps = {} as ProjectRepositoryDeps,
  ) {
    this.os = deps.os;
  }

  private getProjectsPath(): string {
    if (!this.deps.projectsPath) {
      throw new Error(
        "projectsPath is required - provide via ProjectRepository constructor",
      );
    }
    return this.deps.projectsPath;
  }

  private getProjectPath(id: string): string {
    return this.os.path.join(this.getProjectsPath(), id);
  }

  private getProjectFilePath(id: string): string {
    return this.os.path.join(this.getProjectPath(id), "project.yaml");
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  async create(input: CreateProjectInput): Promise<Project> {
    if (input.description && input.description.length > 500) {
      throw new Error("Description must be 500 characters or less");
    }

    const repositories = validateProjectRepositories(input.repositories);
    if (!repositories) {
      throw new Error("Project repositories must be a non-empty array");
    }

    const id = this.generateId();
    const projectPath = this.getProjectPath(id);

    if (!(await this.os.fs.existsAsync(projectPath))) {
      await this.os.fs.mkdirAsync(projectPath, { recursive: true });
    }

    const projectData: ProjectData = {
      id,
      name: input.name,
      owner: input.owner,
      createdAt: new Date().toISOString(),
      repositories,
      ...(input.description && { description: input.description }),
      ...(input.agentSubpath && { agentSubpath: input.agentSubpath }),
      ...(input.instructions && { instructions: input.instructions }),
      ...(input.color && { color: input.color }),
      ...(input.iconGlyph && { iconGlyph: input.iconGlyph }),
    };

    await this.os.fs.writeFileAsync(
      this.getProjectFilePath(id),
      dump(projectData),
      {
        encoding: "utf-8",
      },
    );

    return {
      ...projectData,
      createdAt: new Date(projectData.createdAt),
    };
  }

  async findById(id: string): Promise<Project | null> {
    const filePath = this.getProjectFilePath(id);
    if (!(await this.os.fs.existsAsync(filePath))) {
      return null;
    }

    const content = await this.os.fs.readFileAsync(filePath, "utf-8");
    const data = normalizeProjectData(load(content) as ProjectData);

    return {
      ...data,
      createdAt: new Date(data.createdAt),
    };
  }

  async listByOwner(owner: string): Promise<Project[]> {
    const projectsPath = this.getProjectsPath();
    if (!(await this.os.fs.existsAsync(projectsPath))) {
      return [];
    }

    const entries = (await this.os.fs.readdirAsync(projectsPath, {
      withFileTypes: true,
    })) as import("../../infrastructure/os/types.js").DirEnt[];
    const projects: Project[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory()) {
          const projectFile = this.os.path.join(
            projectsPath,
            entry.name,
            "project.yaml",
          );
          if (await this.os.fs.existsAsync(projectFile)) {
            const content = await this.os.fs.readFileAsync(
              projectFile,
              "utf-8",
            );
            const data = normalizeProjectData(load(content) as ProjectData);
            if (data.owner === owner) {
              projects.push({
                ...data,
                createdAt: new Date(data.createdAt),
              });
            }
          }
        }
      }),
    );

    projects.sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
    return projects;
  }

  async listAll(): Promise<Project[]> {
    const projectsPath = this.getProjectsPath();
    if (!(await this.os.fs.existsAsync(projectsPath))) {
      return [];
    }

    const entries = (await this.os.fs.readdirAsync(projectsPath, {
      withFileTypes: true,
    })) as import("../../infrastructure/os/types.js").DirEnt[];
    const projects: Project[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory()) {
          const projectFile = this.os.path.join(
            projectsPath,
            entry.name,
            "project.yaml",
          );
          if (await this.os.fs.existsAsync(projectFile)) {
            const content = await this.os.fs.readFileAsync(
              projectFile,
              "utf-8",
            );
            const data = normalizeProjectData(load(content) as ProjectData);
            projects.push({
              ...data,
              createdAt: new Date(data.createdAt),
            });
          }
        }
      }),
    );

    projects.sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
    return projects;
  }

  async listAllPublic(): Promise<PublicProject[]> {
    const projects = await this.listAll();
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      repoType: project.repositories[0]?.repoType ?? "git",
      owner: project.owner,
      createdAt: project.createdAt.toISOString(),
      agentSubpath: project.agentSubpath,
      instructions: project.instructions,
      color: project.color,
      iconGlyph: project.iconGlyph,
    }));
  }

  async delete(id: string): Promise<void> {
    const projectPath = this.getProjectPath(id);

    if (await this.os.fs.existsAsync(projectPath)) {
      // Delete project.yaml first
      const projectFile = this.getProjectFilePath(id);
      if (await this.os.fs.existsAsync(projectFile)) {
        await this.os.fs.unlinkAsync(projectFile);
      }

      // Recursively remove the project directory (handles sessions/,
      // impacts/, cache.git, features.json, etc.)
      await this.os.fs.rmAsync(projectPath, { recursive: true, force: true });
    }
  }

  async deleteByOwner(owner: string): Promise<void> {
    const projects = await this.listByOwner(owner);
    await Promise.all(projects.map((project) => this.delete(project.id)));
  }

  async exists(id: string): Promise<boolean> {
    return this.os.fs.existsAsync(this.getProjectFilePath(id));
  }

  async update(
    id: string,
    updates: {
      name?: string;
      repositories?: ProjectRepositoryEntry[];
      description?: string;
      instructions?: string;
      color?: string;
      iconGlyph?: string;
    },
  ): Promise<Project> {
    const project = await this.findById(id);
    if (!project) {
      throw new Error("Project not found");
    }

    if (updates.description && updates.description.length > 500) {
      throw new Error("Description must be 500 characters or less");
    }

    const repositories = validateProjectRepositories(updates.repositories);

    const updatedData: ProjectData = {
      id: project.id,
      name: updates.name || project.name,
      owner: project.owner,
      createdAt: project.createdAt.toISOString(),
      description: updates.description,
      repositories: repositories ?? project.repositories,
    };

    // Preserve color/iconGlyph from existing project unless overridden
    if (updates.color !== undefined) {
      if (updates.color) {
        updatedData.color = updates.color;
      }
    } else if (project.color) {
      updatedData.color = project.color;
    }

    if (updates.iconGlyph !== undefined) {
      if (updates.iconGlyph) {
        updatedData.iconGlyph = updates.iconGlyph;
      }
    } else if (project.iconGlyph) {
      updatedData.iconGlyph = project.iconGlyph;
    }

    if (project.agentSubpath) {
      updatedData.agentSubpath = project.agentSubpath;
    }

    // Handle instructions specially - if undefined, keep existing; if null, remove; if string, set
    if ("instructions" in updates) {
      if (updates.instructions !== undefined) {
        updatedData.instructions = updates.instructions;
      }
    } else if (project.instructions) {
      updatedData.instructions = project.instructions;
    }

    await this.os.fs.writeFileAsync(
      this.getProjectFilePath(id),
      dump(updatedData),
      {
        encoding: "utf-8",
      },
    );

    return {
      ...updatedData,
      createdAt: new Date(updatedData.createdAt),
    };
  }
}
