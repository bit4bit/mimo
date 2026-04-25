import type { OS } from "../os/types.js";
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
  os: OS;
  usersPath: string;
}

export class UserRepository {
  private os: OS;

  constructor(private deps: UserRepositoryDeps) {
    this.os = deps.os;
  }

  private getUsersPath(): string {
    return this.deps.usersPath;
  }

  private getUserPath(username: string): string {
    return this.os.path.join(this.getUsersPath(), username);
  }

  private getCredentialsPath(username: string): string {
    return this.os.path.join(this.getUserPath(username), "credentials.yaml");
  }

  async exists(username: string): Promise<boolean> {
    return this.os.fs.exists(this.getCredentialsPath(username));
  }

  async create(username: string, passwordHash: string): Promise<User> {
    if (await this.exists(username)) {
      throw new Error(`User "${username}" already exists`);
    }

    const userPath = this.getUserPath(username);
    if (!this.os.fs.exists(userPath)) {
      this.os.fs.mkdir(userPath, { recursive: true });
    }

    const credentials: UserCredentials = {
      username,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    this.os.fs.writeFile(this.getCredentialsPath(username), dump(credentials), {
      encoding: "utf-8",
    });

    return {
      username,
      createdAt: new Date(credentials.createdAt),
    };
  }

  async getCredentials(username: string): Promise<UserCredentials | null> {
    const path = this.getCredentialsPath(username);
    if (!this.os.fs.exists(path)) {
      return null;
    }

    const content = this.os.fs.readFile(path, "utf-8");
    return load(content) as UserCredentials;
  }

  async listUsers(): Promise<User[]> {
    const usersPath = this.getUsersPath();
    if (!this.os.fs.exists(usersPath)) {
      return [];
    }

    const entries = this.os.fs.readdir(usersPath, {
      withFileTypes: true,
    }) as import("../os/types.js").DirEnt[];
    const users: User[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const credentialsPath = this.os.path.join(
          usersPath,
          entry.name,
          "credentials.yaml",
        );
        if (this.os.fs.exists(credentialsPath)) {
          const content = this.os.fs.readFile(credentialsPath, "utf-8");
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
export const userRepository = new UserRepository({
  os: null as any,
  usersPath: "",
});
