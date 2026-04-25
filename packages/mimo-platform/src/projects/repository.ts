import type { OS } from "../os/types.js";
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
}

interface ProjectRepositoryDeps {
  os: OS;
  projectsPath?: string;
}

export class ProjectRepository {
  private os: OS;

  constructor(private deps: ProjectRepositoryDeps = {} as ProjectRepositoryDeps) {
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

    if (!this.os.fs.exists(projectPath)) {
      this.os.fs.mkdir(projectPath, { recursive: true });
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
    };

    this.os.fs.writeFile(this.getProjectFilePath(id), dump(projectData), { encoding: "utf-8" });

    return {
      ...projectData,
      createdAt: new Date(projectData.createdAt),
    };
  }

  async findById(id: string): Promise<Project | null> {
    const filePath = this.getProjectFilePath(id);
    if (!this.os.fs.exists(filePath)) {
      return null;
    }

    const content = this.os.fs.readFile(filePath, "utf-8");
    const data = load(content) as ProjectData;

    return {
      ...data,
      createdAt: new Date(data.createdAt),
    };
  }

  async listByOwner(owner: string): Promise<Project[]> {
    const projectsPath = this.getProjectsPath();
    if (!this.os.fs.exists(projectsPath)) {
      return [];
    }

    const entries = this.os.fs.readdir(projectsPath, { withFileTypes: true }) as import("../os/types.js").DirEnt[];
    const projects: Project[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectFile = this.os.path.join(projectsPath, entry.name, "project.yaml");
        if (this.os.fs.exists(projectFile)) {
          const content = this.os.fs.readFile(projectFile, "utf-8");
          const data = load(content) as ProjectData;
          if (data.owner === owner) {
            projects.push({
              ...data,
              createdAt: new Date(data.createdAt),
            });
          }
        }
      }
    }

    return projects;
  }

  async listAll(): Promise<Project[]> {
    const projectsPath = this.getProjectsPath();
    if (!this.os.fs.exists(projectsPath)) {
      return [];
    }

    const entries = this.os.fs.readdir(projectsPath, { withFileTypes: true }) as import("../os/types.js").DirEnt[];
    const projects: Project[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectFile = this.os.path.join(projectsPath, entry.name, "project.yaml");
        if (this.os.fs.exists(projectFile)) {
          const content = this.os.fs.readFile(projectFile, "utf-8");
          const data = load(content) as ProjectData;
          projects.push({
            ...data,
            createdAt: new Date(data.createdAt),
          });
        }
      }
    }

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
    }));
  }

  async delete(id: string): Promise<void> {
    const projectPath = this.getProjectPath(id);

    if (this.os.fs.exists(projectPath)) {
      // Delete project.yaml first
      const projectFile = this.getProjectFilePath(id);
      if (this.os.fs.exists(projectFile)) {
        this.os.fs.unlink(projectFile);
      }

      // Delete any other files in the directory
      const entries = this.os.fs.readdir(projectPath) as string[];
      for (const entry of entries) {
        const entryPath = this.os.path.join(projectPath, entry);
        if (this.os.fs.exists(entryPath)) {
          this.os.fs.unlink(entryPath);
        }
      }

      // Delete the directory
      this.os.fs.rm(projectPath);
    }
  }

  async exists(id: string): Promise<boolean> {
    return this.os.fs.exists(this.getProjectFilePath(id));
  }

  async update(
    id: string,
    updates: {
      name?: string;
      repoUrl?: string;
      repoType?: "git" | "fossil";
      description?: string;
      credentialId?: string;
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

    this.os.fs.writeFile(this.getProjectFilePath(id), dump(updatedData), { encoding: "utf-8" });

    return {
      ...updatedData,
      createdAt: new Date(updatedData.createdAt),
    };
  }
}
