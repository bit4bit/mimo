// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
import { dump, load } from "js-yaml";
import crypto from "crypto";

export interface Project {
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: Date;
  description?: string;
  credentialId?: string;
  sourceBranch?: string;
  newBranch?: string;
  agentSubpath?: string;
  instructions?: string;
  clonePort?: number;
}

export interface PublicProject {
  id: string;
  name: string;
  description?: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: string;
  sourceBranch?: string;
  newBranch?: string;
  agentSubpath?: string;
  instructions?: string;
}

export interface ProjectData {
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: string;
  description?: string;
  credentialId?: string;
  sourceBranch?: string;
  newBranch?: string;
  agentSubpath?: string;
  instructions?: string;
  clonePort?: number;
}

export interface CreateProjectInput {
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
  description?: string;
  credentialId?: string;
  sourceBranch?: string;
  newBranch?: string;
  agentSubpath?: string;
  instructions?: string;
  clonePort?: number;
}

interface ProjectRepositoryDeps {
  os: OS;
  projectsPath?: string;
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

    const id = this.generateId();
    const projectPath = this.getProjectPath(id);

    if (!(await this.os.fs.existsAsync(projectPath))) {
      await this.os.fs.mkdirAsync(projectPath, { recursive: true });
    }

    const projectData: ProjectData = {
      id,
      name: input.name,
      repoUrl: input.repoUrl,
      repoType: input.repoType,
      owner: input.owner,
      createdAt: new Date().toISOString(),
      ...(input.description && { description: input.description }),
      ...(input.credentialId && { credentialId: input.credentialId }),
      ...(input.sourceBranch && { sourceBranch: input.sourceBranch }),
      ...(input.newBranch && { newBranch: input.newBranch }),
      ...(input.agentSubpath && { agentSubpath: input.agentSubpath }),
      ...(input.instructions && { instructions: input.instructions }),
      ...(input.clonePort != null && { clonePort: input.clonePort }),
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
    const data = load(content) as ProjectData;

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
            const data = load(content) as ProjectData;
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
            const data = load(content) as ProjectData;
            projects.push({
              ...data,
              createdAt: new Date(data.createdAt),
            });
          }
        }
      }),
    );

    return projects;
  }

  async listAllPublic(): Promise<PublicProject[]> {
    const projects = await this.listAll();
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      repoType: project.repoType,
      owner: project.owner,
      createdAt: project.createdAt.toISOString(),
      sourceBranch: project.sourceBranch,
      newBranch: project.newBranch,
      agentSubpath: project.agentSubpath,
      instructions: project.instructions,
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

      // Delete any other files in the directory
      const entries = (await this.os.fs.readdirAsync(projectPath)) as string[];
      for (const entry of entries) {
        const entryPath = this.os.path.join(projectPath, entry);
        if (await this.os.fs.existsAsync(entryPath)) {
          await this.os.fs.unlinkAsync(entryPath);
        }
      }

      // Delete the directory
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
      repoUrl?: string;
      repoType?: "git" | "fossil";
      description?: string;
      credentialId?: string;
      instructions?: string;
      clonePort?: number | null;
    },
  ): Promise<Project> {
    const project = await this.findById(id);
    if (!project) {
      throw new Error("Project not found");
    }

    if (updates.description && updates.description.length > 500) {
      throw new Error("Description must be 500 characters or less");
    }

    const updatedData: ProjectData = {
      id: project.id,
      name: updates.name || project.name,
      repoUrl: updates.repoUrl || project.repoUrl,
      repoType: updates.repoType || project.repoType,
      owner: project.owner,
      createdAt: project.createdAt.toISOString(),
      description: updates.description,
      sourceBranch: project.sourceBranch,
      newBranch: project.newBranch,
    };

    // Handle credentialId specially - if undefined, keep existing; if null, remove; if string, set
    if ("credentialId" in updates) {
      if (updates.credentialId !== undefined) {
        updatedData.credentialId = updates.credentialId;
      }
    } else if (project.credentialId) {
      updatedData.credentialId = project.credentialId;
    }

    // Handle instructions specially - if undefined, keep existing; if null, remove; if string, set
    if ("instructions" in updates) {
      if (updates.instructions !== undefined) {
        updatedData.instructions = updates.instructions;
      }
    } else if (project.instructions) {
      updatedData.instructions = project.instructions;
    }

    // Handle clonePort: undefined = keep existing; null = remove; number = set
    if ("clonePort" in updates) {
      if (updates.clonePort != null) {
        updatedData.clonePort = updates.clonePort;
      }
    } else if (project.clonePort != null) {
      updatedData.clonePort = project.clonePort;
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
