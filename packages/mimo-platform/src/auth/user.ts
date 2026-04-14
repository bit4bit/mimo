import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { getPaths } from "../config/paths.js";
import { dump, load } from "js-yaml";

export interface UserCredentials {
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface User {
  username: string;
  createdAt: Date;
}

interface UserRepositoryDeps {
  usersPath?: string;
}

export class UserRepository {
  constructor(private deps: UserRepositoryDeps = {}) {}

  private getUsersPath(): string {
    return this.deps.usersPath ?? getPaths().users;
  }

  private getUserPath(username: string): string {
    return join(this.getUsersPath(), username);
  }

  private getCredentialsPath(username: string): string {
    return join(this.getUserPath(username), "credentials.yaml");
  }

  async exists(username: string): Promise<boolean> {
    return existsSync(this.getCredentialsPath(username));
  }

  async create(username: string, passwordHash: string): Promise<User> {
    if (await this.exists(username)) {
      throw new Error(`User "${username}" already exists`);
    }

    const userPath = this.getUserPath(username);
    if (!existsSync(userPath)) {
      mkdirSync(userPath, { recursive: true });
    }

    const credentials: UserCredentials = {
      username,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    writeFileSync(
      this.getCredentialsPath(username),
      dump(credentials),
      "utf-8"
    );

    return {
      username,
      createdAt: new Date(credentials.createdAt),
    };
  }

  async getCredentials(username: string): Promise<UserCredentials | null> {
    const path = this.getCredentialsPath(username);
    if (!existsSync(path)) {
      return null;
    }

    const content = readFileSync(path, "utf-8");
    return load(content) as UserCredentials;
  }

  async listUsers(): Promise<User[]> {
    const usersPath = this.getUsersPath();
    if (!existsSync(usersPath)) {
      return [];
    }

    const entries = readdirSync(usersPath, { withFileTypes: true });
    const users: User[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const credentialsPath = join(
          usersPath,
          entry.name,
          "credentials.yaml"
        );
        if (existsSync(credentialsPath)) {
          const content = readFileSync(credentialsPath, "utf-8");
          const creds = load(content) as UserCredentials;
          users.push({
            username: creds.username,
            createdAt: new Date(creds.createdAt),
          });
        }
      }
    }

    return users;
  }
}

export const userRepository = new UserRepository();
