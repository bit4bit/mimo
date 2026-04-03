import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { getUserPath, Paths } from "../config/paths.js";
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

export class UserRepository {
  private getCredentialsPath(username: string): string {
    return join(getUserPath(username), "credentials.yaml");
  }

  async exists(username: string): Promise<boolean> {
    return existsSync(this.getCredentialsPath(username));
  }

  async create(username: string, passwordHash: string): Promise<User> {
    if (await this.exists(username)) {
      throw new Error(`User "${username}" already exists`);
    }

    const userPath = getUserPath(username);
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
    if (!existsSync(Paths.users)) {
      return [];
    }

    const entries = readdirSync(Paths.users, { withFileTypes: true });
    const users: User[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const credentialsPath = join(
          Paths.users,
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
