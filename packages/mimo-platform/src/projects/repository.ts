import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from "fs";
import { getPaths } from "../config/paths.js";
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
}

export interface PublicProject {
  id: string;
  name: string;
  description?: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: string;
}

export interface ProjectData {
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: string;
  description?: string;
}

export interface CreateProjectInput {
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
  description?: string;
}

export class ProjectRepository {
  private getProjectPath(id: string): string {
    return join(getPaths().projects, id);
  }

  private getProjectFilePath(id: string): string {
    return join(this.getProjectPath(id), "project.yaml");
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
    
    if (!existsSync(projectPath)) {
      mkdirSync(projectPath, { recursive: true });
    }

    const projectData: ProjectData = {
      id,
      name: input.name,
      repoUrl: input.repoUrl,
      repoType: input.repoType,
      owner: input.owner,
      createdAt: new Date().toISOString(),
      ...(input.description && { description: input.description }),
    };

    writeFileSync(
      this.getProjectFilePath(id),
      dump(projectData),
      "utf-8"
    );

    return {
      ...projectData,
      createdAt: new Date(projectData.createdAt),
    };
  }

  async findById(id: string): Promise<Project | null> {
    const filePath = this.getProjectFilePath(id);
    if (!existsSync(filePath)) {
      return null;
    }

    const content = readFileSync(filePath, "utf-8");
    const data = load(content) as ProjectData;
    
    return {
      ...data,
      createdAt: new Date(data.createdAt),
    };
  }

  async listByOwner(owner: string): Promise<Project[]> {
    const Paths = getPaths();
    if (!existsSync(Paths.projects)) {
      return [];
    }

    const entries = readdirSync(Paths.projects, { withFileTypes: true });
    const projects: Project[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectFile = join(Paths.projects, entry.name, "project.yaml");
        if (existsSync(projectFile)) {
          const content = readFileSync(projectFile, "utf-8");
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
    const Paths = getPaths();
    if (!existsSync(Paths.projects)) {
      return [];
    }

    const entries = readdirSync(Paths.projects, { withFileTypes: true });
    const projects: Project[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectFile = join(Paths.projects, entry.name, "project.yaml");
        if (existsSync(projectFile)) {
          const content = readFileSync(projectFile, "utf-8");
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
    return projects.map(project => ({
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
    
    if (existsSync(projectPath)) {
      // Delete project.yaml first
      const projectFile = this.getProjectFilePath(id);
      if (existsSync(projectFile)) {
        unlinkSync(projectFile);
      }
      
      // Delete any other files in the directory
      const entries = readdirSync(projectPath);
      for (const entry of entries) {
        const entryPath = join(projectPath, entry);
        if (existsSync(entryPath)) {
          unlinkSync(entryPath);
        }
      }
      
      // Delete the directory
      rmdirSync(projectPath);
    }
  }

  async exists(id: string): Promise<boolean> {
    return existsSync(this.getProjectFilePath(id));
  }

  async update(id: string, updates: { name?: string; repoUrl?: string; repoType?: "git" | "fossil"; description?: string }): Promise<Project> {
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
    };

    writeFileSync(
      this.getProjectFilePath(id),
      dump(updatedData),
      "utf-8"
    );

    return {
      ...updatedData,
      createdAt: new Date(updatedData.createdAt),
    };
  }
}

export const projectRepository = new ProjectRepository();
