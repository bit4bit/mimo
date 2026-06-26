// SPDX-License-Identifier: AGPL-3.0-only
import type { OS } from "../../infrastructure/os/types.js";
import YAML from "yaml";
import { logger } from "../../logger.js";

export interface ImpactRecord {
  id: string;
  sessionId: string;
  sessionName: string;
  projectId: string;
  commitHash: string;
  commitDate: Date;
  files: {
    new: number;
    changed: number;
    deleted: number;
  };
  linesOfCode: {
    added: number;
    removed: number;
    net: number;
  };
  complexity: {
    cyclomatic: number;
    cognitive: number;
    estimatedMinutes: number;
  };
  complexityByLanguage: Array<{
    language: string;
    files: number;
    linesAdded: number;
    linesRemoved: number;
    complexityDelta: number;
  }>;
  cloneUrl?: string;
}

interface ImpactRepositoryDeps {
  os: OS;
  projectsPath: string;
}

export class ImpactRepository {
  private os: OS;

  constructor(private deps: ImpactRepositoryDeps) {
    this.os = deps.os;
  }

  private getImpactDir(projectId: string): string {
    return this.os.path.join(this.deps.projectsPath, projectId, "impacts");
  }

  private getImpactPath(
    projectId: string,
    sessionId: string,
    commitHash: string,
  ): string {
    return this.os.path.join(
      this.getImpactDir(projectId),
      `${sessionId}-${commitHash}.yaml`,
    );
  }

  async ensureImpactDir(projectId: string): Promise<void> {
    const impactDir = this.getImpactDir(projectId);
    if (!(await this.os.fs.existsAsync(impactDir))) {
      await this.os.fs.mkdirAsync(impactDir, { recursive: true });
    }
  }

  async save(record: ImpactRecord): Promise<void> {
    await this.ensureImpactDir(record.projectId);

    const filePath = this.getImpactPath(
      record.projectId,
      record.sessionId,
      record.commitHash,
    );
    const yamlContent = YAML.stringify({
      ...record,
      commitDate: record.commitDate.toISOString(),
    });

    await this.os.fs.writeFileAsync(filePath, yamlContent, {
      encoding: "utf-8",
    });
  }

  async findByProject(projectId: string): Promise<ImpactRecord[]> {
    const impactDir = this.getImpactDir(projectId);

    if (!(await this.os.fs.existsAsync(impactDir))) {
      return [];
    }

    const files = (
      (await this.os.fs.readdirAsync(impactDir)) as string[]
    ).filter((f) => f.endsWith(".yaml"));
    const records: ImpactRecord[] = [];

    await Promise.all(
      files.map(async (file) => {
        const filePath = this.os.path.join(impactDir, file);
        try {
          const content = await this.os.fs.readFileAsync(filePath, "utf-8");
          const data = YAML.parse(content);
          records.push({
            ...data,
            commitDate: new Date(data.commitDate),
          });
        } catch (error) {
          logger.error(
            `[impact] Failed to load impact record from ${filePath}:`,
            error,
          );
        }
      }),
    );

    // Sort by commit date descending (newest first)
    return records.sort(
      (a, b) => b.commitDate.getTime() - a.commitDate.getTime(),
    );
  }

  async findBySession(
    projectId: string,
    sessionId: string,
  ): Promise<ImpactRecord[]> {
    const records = await this.findByProject(projectId);
    return records.filter((r) => r.sessionId === sessionId);
  }

  async findByCommitHash(
    projectId: string,
    commitHash: string,
  ): Promise<ImpactRecord | null> {
    const records = await this.findByProject(projectId);
    return records.find((r) => r.commitHash === commitHash) || null;
  }

  async delete(
    projectId: string,
    sessionId: string,
    commitHash: string,
  ): Promise<void> {
    const filePath = this.getImpactPath(projectId, sessionId, commitHash);
    if (await this.os.fs.existsAsync(filePath)) {
      await this.os.fs.unlinkAsync(filePath);
    }
  }

  async deleteByProject(projectId: string): Promise<void> {
    const impactDir = this.getImpactDir(projectId);
    if (!(await this.os.fs.existsAsync(impactDir))) return;

    const files = (
      (await this.os.fs.readdirAsync(impactDir)) as string[]
    ).filter((f) => f.endsWith(".yaml"));
    await Promise.all(
      files.map((file) =>
        this.os.fs.unlinkAsync(this.os.path.join(impactDir, file)),
      ),
    );
  }
}
