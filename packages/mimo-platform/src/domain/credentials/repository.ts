// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
import { dump, load } from "js-yaml";
import crypto from "crypto";

export type CredentialType = "https" | "ssh";

export interface HttpsCredential {
  id: string;
  name: string;
  type: "https";
  username: string;
  password: string;
  owner: string;
  createdAt: Date;
}

export interface SshCredential {
  id: string;
  name: string;
  type: "ssh";
  privateKey: string;
  owner: string;
  createdAt: Date;
}

export type Credential = HttpsCredential | SshCredential;

export interface CredentialData {
  id: string;
  name: string;
  type: CredentialType;
  owner: string;
  createdAt: string;
  // HTTPS specific
  username?: string;
  password?: string;
  // SSH specific
  privateKey?: string;
}

export interface CreateHttpsCredentialInput {
  name: string;
  type: "https";
  username: string;
  password: string;
  owner: string;
}

export interface CreateSshCredentialInput {
  name: string;
  type: "ssh";
  privateKey: string;
  owner: string;
}

export type CreateCredentialInput =
  | CreateHttpsCredentialInput
  | CreateSshCredentialInput;

interface CredentialRepositoryDeps {
  os: OS;
  usersPath: string;
}

export class CredentialRepository {
  private os: OS;

  constructor(private deps: CredentialRepositoryDeps) {
    this.os = deps.os;
  }

  private getCredentialsDirPath(username: string): string {
    return this.os.path.join(this.deps.usersPath, username, "credentials");
  }

  private getCredentialFilePath(username: string, id: string): string {
    return this.os.path.join(
      this.getCredentialsDirPath(username),
      `${id}.yaml`,
    );
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  private validateSshPrivateKey(key: string): boolean {
    // Check for common SSH key formats
    const opensshPattern = /^-----BEGIN OPENSSH PRIVATE KEY-----/;
    const rsaPattern = /^-----BEGIN RSA PRIVATE KEY-----/;
    const pemPattern = /^-----BEGIN EC PRIVATE KEY-----/;
    const ed25519Pattern = /^-----BEGIN PRIVATE KEY-----/;

    return (
      opensshPattern.test(key) ||
      rsaPattern.test(key) ||
      pemPattern.test(key) ||
      ed25519Pattern.test(key)
    );
  }

  async create(input: CreateCredentialInput): Promise<Credential> {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Credential name is required");
    }

    const id = this.generateId();
    const credentialsDir = this.getCredentialsDirPath(input.owner);

    if (!(await this.os.fs.existsAsync(credentialsDir))) {
      await this.os.fs.mkdirAsync(credentialsDir, { recursive: true });
    }

    let credentialData: CredentialData;

    if (input.type === "https") {
      credentialData = {
        id,
        name: input.name,
        type: "https",
        owner: input.owner,
        username: input.username,
        password: input.password,
        createdAt: new Date().toISOString(),
      };
    } else {
      // SSH credential
      if (!this.validateSshPrivateKey(input.privateKey)) {
        throw new Error("Invalid SSH private key format");
      }

      credentialData = {
        id,
        name: input.name,
        type: "ssh",
        owner: input.owner,
        privateKey: input.privateKey,
        createdAt: new Date().toISOString(),
      };
    }

    const filePath = this.getCredentialFilePath(input.owner, id);
    await this.os.fs.writeFileAsync(filePath, dump(credentialData), {
      encoding: "utf-8",
    });

    // Set file permissions to 600 (owner read/write only)
    await this.os.fs.chmodAsync(filePath, 0o600);

    return {
      ...credentialData,
      createdAt: new Date(credentialData.createdAt),
    } as Credential;
  }

  async findById(id: string, owner: string): Promise<Credential | null> {
    const filePath = this.getCredentialFilePath(owner, id);
    if (!(await this.os.fs.existsAsync(filePath))) {
      return null;
    }

    const content = await this.os.fs.readFileAsync(filePath, "utf-8");
    const data = load(content) as CredentialData;

    return {
      ...data,
      createdAt: new Date(data.createdAt),
    } as Credential;
  }

  async findByOwner(owner: string): Promise<Credential[]> {
    const credentialsDir = this.getCredentialsDirPath(owner);
    if (!(await this.os.fs.existsAsync(credentialsDir))) {
      return [];
    }

    const entries = (await this.os.fs.readdirAsync(credentialsDir, {
      withFileTypes: true,
    })) as import("../../infrastructure/os/types.js").DirEnt[];
    const credentials: Credential[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isFile() && entry.name.endsWith(".yaml")) {
          const filePath = this.os.path.join(credentialsDir, entry.name);
          const content = await this.os.fs.readFileAsync(filePath, "utf-8");
          const data = load(content) as CredentialData;
          credentials.push({
            ...data,
            createdAt: new Date(data.createdAt),
          } as Credential);
        }
      }),
    );

    return credentials;
  }

  async update(
    id: string,
    owner: string,
    updates: Partial<CreateCredentialInput>,
  ): Promise<Credential> {
    const credential = await this.findById(id, owner);
    if (!credential) {
      throw new Error("Credential not found");
    }

    const filePath = this.getCredentialFilePath(owner, id);
    const content = await this.os.fs.readFileAsync(filePath, "utf-8");
    const data = load(content) as CredentialData;

    // Update name
    if (updates.name !== undefined) {
      data.name = updates.name;
    }

    // Update type-specific fields
    if (credential.type === "https" && updates.type === "https") {
      if (updates.username !== undefined) {
        data.username = updates.username;
      }
      if (updates.password !== undefined) {
        data.password = updates.password;
      }
    } else if (credential.type === "ssh" && updates.type === "ssh") {
      if (updates.privateKey !== undefined) {
        if (!this.validateSshPrivateKey(updates.privateKey)) {
          throw new Error("Invalid SSH private key format");
        }
        data.privateKey = updates.privateKey;
      }
    }

    await this.os.fs.writeFileAsync(filePath, dump(data), {
      encoding: "utf-8",
    });
    await this.os.fs.chmodAsync(filePath, 0o600);

    return {
      ...data,
      createdAt: new Date(data.createdAt),
    } as Credential;
  }

  async delete(id: string, owner: string): Promise<void> {
    const filePath = this.getCredentialFilePath(owner, id);
    if (await this.os.fs.existsAsync(filePath)) {
      await this.os.fs.unlinkAsync(filePath);
    }
  }

  async exists(id: string, owner: string): Promise<boolean> {
    return this.os.fs.existsAsync(this.getCredentialFilePath(owner, id));
  }
}

// Legacy singleton export - requires paths to be injected via constructor
// This will fail at runtime if not initialized with proper paths
// Use createMimoContext() instead for proper initialization
export const credentialRepository = new CredentialRepository({
  os: null as any,
  usersPath: "",
});
