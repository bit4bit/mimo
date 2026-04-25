import type { OS } from "../os/types.js";
import YAML from "yaml";
import { logger } from "../logger.js";

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
  fossilUrl: string;
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

  ensureImpactDir(projectId: string): void {
    const impactDir = this.getImpactDir(projectId);
    if (!this.os.fs.exists(impactDir)) {
      this.os.fs.mkdir(impactDir, { recursive: true });
    }
  }

  save(record: ImpactRecord): void {
    this.ensureImpactDir(record.projectId);

    const filePath = this.getImpactPath(
      record.projectId,
      record.sessionId,
      record.commitHash,
    );
    const yamlContent = YAML.stringify({
      ...record,
      commitDate: record.commitDate.toISOString(),
    });

    this.os.fs.writeFile(filePath, yamlContent, { encoding: "utf-8" });
  }

  findByProject(projectId: string): ImpactRecord[] {
    const impactDir = this.getImpactDir(projectId);

    if (!this.os.fs.exists(impactDir)) {
      return [];
    }

    const files = (this.os.fs.readdir(impactDir) as string[]).filter((f) =>
      f.endsWith(".yaml"),
    );
    const records: ImpactRecord[] = [];

    for (const file of files) {
      const filePath = this.os.path.join(impactDir, file);
      try {
        const content = this.os.fs.readFile(filePath, "utf-8");
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
    }

    // Sort by commit date descending (newest first)
    return records.sort(
      (a, b) => b.commitDate.getTime() - a.commitDate.getTime(),
    );
  }

  findBySession(projectId: string, sessionId: string): ImpactRecord[] {
    return this.findByProject(projectId).filter(
      (r) => r.sessionId === sessionId,
    );
  }

  findByCommitHash(projectId: string, commitHash: string): ImpactRecord | null {
    const records = this.findByProject(projectId);
    return records.find((r) => r.commitHash === commitHash) || null;
  }

  delete(projectId: string, sessionId: string, commitHash: string): void {
    const filePath = this.getImpactPath(projectId, sessionId, commitHash);
    if (this.os.fs.exists(filePath)) {
      this.os.fs.unlink(filePath);
    }
  }
}
