import { join } from "path";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "fs";
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
  usersPath: string;
}

export class UserRepository {
  constructor(private deps: UserRepositoryDeps) {}

  private getUsersPath(): string {
    return this.deps.usersPath;
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
      "utf-8",
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
        const credentialsPath = join(usersPath, entry.name, "credentials.yaml");
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

// Legacy singleton export - requires paths to be injected via constructor
// This will fail at runtime if not initialized with proper paths
// Use createMimoContext() instead for proper initialization
export const userRepository = new UserRepository({ usersPath: "" });
