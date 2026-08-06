// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
import { dump, load } from "js-yaml";
import crypto from "crypto";

export type ManagedRepoType = "git" | "fossil";

export interface ManagedRepository {
  id: string;
  name: string;
  repoUrl: string;
  repoType: ManagedRepoType;
  credentialId?: string;
  clonePort?: number;
  owner: string;
  createdAt: Date;
}

export interface ManagedRepositoryData {
  id: string;
  name: string;
  repoUrl: string;
  repoType: ManagedRepoType;
  credentialId?: string;
  clonePort?: number;
  owner: string;
  createdAt: string;
}

export interface CreateManagedRepositoryInput {
  name: string;
  repoUrl: string;
  repoType: ManagedRepoType;
  credentialId?: string;
  clonePort?: number;
  owner: string;
}

export interface UpdateManagedRepositoryInput {
  name?: string;
  repoUrl?: string;
  repoType?: ManagedRepoType;
  credentialId?: string | null;
  clonePort?: number | null;
}

interface ManagedRepositoryRepositoryDeps {
  os: OS;
  usersPath: string;
}

export class ManagedRepositoryRepository {
  private os: OS;

  constructor(private deps: ManagedRepositoryRepositoryDeps) {
    this.os = deps.os;
  }

  private getRepositoriesDirPath(username: string): string {
    return this.os.path.join(this.deps.usersPath, username, "repositories");
  }

  private getRepositoryFilePath(username: string, id: string): string {
    return this.os.path.join(
      this.getRepositoriesDirPath(username),
      `${id}.yaml`,
    );
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  private toEntity(data: ManagedRepositoryData): ManagedRepository {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
    };
  }

  private async assertNameAvailable(
    name: string,
    owner: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.findByOwner(owner);
    const clash = existing.find(
      (repo) =>
        repo.name.trim().toLowerCase() === name.trim().toLowerCase() &&
        repo.id !== excludeId,
    );
    if (clash) {
      throw new Error(`Repository with name "${name}" already exists`);
    }
  }

  async create(
    input: CreateManagedRepositoryInput,
  ): Promise<ManagedRepository> {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Repository name is required");
    }
    if (!input.repoUrl || input.repoUrl.trim().length === 0) {
      throw new Error("Repository URL is required");
    }

    await this.assertNameAvailable(input.name, input.owner);

    const repositoriesDir = this.getRepositoriesDirPath(input.owner);
    if (!(await this.os.fs.existsAsync(repositoriesDir))) {
      await this.os.fs.mkdirAsync(repositoriesDir, { recursive: true });
    }

    const data: ManagedRepositoryData = {
      id: this.generateId(),
      name: input.name,
      repoUrl: input.repoUrl,
      repoType: input.repoType,
      ...(input.credentialId ? { credentialId: input.credentialId } : {}),
      ...(input.clonePort !== undefined
        ? { clonePort: input.clonePort }
        : {}),
      owner: input.owner,
      createdAt: new Date().toISOString(),
    };

    const filePath = this.getRepositoryFilePath(input.owner, data.id);
    await this.os.fs.writeFileAsync(filePath, dump(data), {
      encoding: "utf-8",
    });

    return this.toEntity(data);
  }

  async findById(
    id: string,
    owner: string,
  ): Promise<ManagedRepository | null> {
    const filePath = this.getRepositoryFilePath(owner, id);
    if (!(await this.os.fs.existsAsync(filePath))) {
      return null;
    }

    const content = await this.os.fs.readFileAsync(filePath, "utf-8");
    const data = load(content) as ManagedRepositoryData;
    return this.toEntity(data);
  }

  async findByOwner(owner: string): Promise<ManagedRepository[]> {
    const repositoriesDir = this.getRepositoriesDirPath(owner);
    if (!(await this.os.fs.existsAsync(repositoriesDir))) {
      return [];
    }

    const entries = (await this.os.fs.readdirAsync(repositoriesDir, {
      withFileTypes: true,
    })) as import("../../infrastructure/os/types.js").DirEnt[];
    const repositories: ManagedRepository[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isFile() && entry.name.endsWith(".yaml")) {
          const filePath = this.os.path.join(repositoriesDir, entry.name);
          const content = await this.os.fs.readFileAsync(filePath, "utf-8");
          const data = load(content) as ManagedRepositoryData;
          repositories.push(this.toEntity(data));
        }
      }),
    );

    return repositories;
  }

  async update(
    id: string,
    owner: string,
    updates: UpdateManagedRepositoryInput,
  ): Promise<ManagedRepository> {
    const existing = await this.findById(id, owner);
    if (!existing) {
      throw new Error("Repository not found");
    }

    if (
      updates.name !== undefined &&
      updates.name.trim().toLowerCase() !== existing.name.trim().toLowerCase()
    ) {
      if (updates.name.trim().length === 0) {
        throw new Error("Repository name is required");
      }
      await this.assertNameAvailable(updates.name, owner, id);
    }

    if (updates.repoUrl !== undefined && updates.repoUrl.trim().length === 0) {
      throw new Error("Repository URL is required");
    }

    const filePath = this.getRepositoryFilePath(owner, id);
    const content = await this.os.fs.readFileAsync(filePath, "utf-8");
    const data = load(content) as ManagedRepositoryData;

    if (updates.name !== undefined) {
      data.name = updates.name;
    }
    if (updates.repoUrl !== undefined) {
      data.repoUrl = updates.repoUrl;
    }
    if (updates.repoType !== undefined) {
      data.repoType = updates.repoType;
    }
    if (updates.credentialId !== undefined) {
      if (updates.credentialId === null) {
        delete data.credentialId;
      } else {
        data.credentialId = updates.credentialId;
      }
    }
    if (updates.clonePort !== undefined) {
      if (updates.clonePort === null) {
        delete data.clonePort;
      } else {
        data.clonePort = updates.clonePort;
      }
    }

    await this.os.fs.writeFileAsync(filePath, dump(data), {
      encoding: "utf-8",
    });

    return this.toEntity(data);
  }

  async delete(id: string, owner: string): Promise<void> {
    const filePath = this.getRepositoryFilePath(owner, id);
    if (await this.os.fs.existsAsync(filePath)) {
      await this.os.fs.unlinkAsync(filePath);
    }
  }

  async exists(id: string, owner: string): Promise<boolean> {
    return this.os.fs.existsAsync(this.getRepositoryFilePath(owner, id));
  }
}
