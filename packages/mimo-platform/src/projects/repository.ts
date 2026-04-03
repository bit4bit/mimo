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
}

export interface ProjectData {
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
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
}

export const projectRepository = new ProjectRepository();
