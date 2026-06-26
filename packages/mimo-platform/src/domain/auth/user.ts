// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
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
    return this.os.fs.existsAsync(this.getCredentialsPath(username));
  }

  async create(username: string, passwordHash: string): Promise<User> {
    if (await this.exists(username)) {
      throw new Error(`User "${username}" already exists`);
    }

    const userPath = this.getUserPath(username);
    if (!(await this.os.fs.existsAsync(userPath))) {
      await this.os.fs.mkdirAsync(userPath, { recursive: true });
    }

    const credentials: UserCredentials = {
      username,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    await this.os.fs.writeFileAsync(
      this.getCredentialsPath(username),
      dump(credentials),
      {
        encoding: "utf-8",
      },
    );

    return {
      username,
      createdAt: new Date(credentials.createdAt),
    };
  }

  async getCredentials(username: string): Promise<UserCredentials | null> {
    const path = this.getCredentialsPath(username);
    if (!(await this.os.fs.existsAsync(path))) {
      return null;
    }

    const content = await this.os.fs.readFileAsync(path, "utf-8");
    return load(content) as UserCredentials;
  }

  async listUsers(): Promise<User[]> {
    const usersPath = this.getUsersPath();
    if (!(await this.os.fs.existsAsync(usersPath))) {
      return [];
    }

    const entries = (await this.os.fs.readdirAsync(usersPath, {
      withFileTypes: true,
    })) as import("../../infrastructure/os/types.js").DirEnt[];
    const users: User[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory()) {
          const credentialsPath = this.os.path.join(
            usersPath,
            entry.name,
            "credentials.yaml",
          );
          if (await this.os.fs.existsAsync(credentialsPath)) {
            const content = await this.os.fs.readFileAsync(
              credentialsPath,
              "utf-8",
            );
            const creds = load(content) as UserCredentials;
            users.push({
              username: creds.username,
              createdAt: new Date(creds.createdAt),
            });
          }
        }
      }),
    );

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
