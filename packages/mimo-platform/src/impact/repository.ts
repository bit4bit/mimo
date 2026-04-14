import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
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
  projectsPath: string;
}

export class ImpactRepository {
  constructor(private deps: ImpactRepositoryDeps) {}

  private getImpactDir(projectId: string): string {
    return join(this.deps.projectsPath, projectId, "impacts");
  }

  private getImpactPath(projectId: string, sessionId: string, commitHash: string): string {
    return join(this.getImpactDir(projectId), `${sessionId}-${commitHash}.yaml`);
  }

  ensureImpactDir(projectId: string): void {
    const impactDir = this.getImpactDir(projectId);
    if (!existsSync(impactDir)) {
      mkdirSync(impactDir, { recursive: true });
    }
  }

  save(record: ImpactRecord): void {
    this.ensureImpactDir(record.projectId);
    
    const filePath = this.getImpactPath(record.projectId, record.sessionId, record.commitHash);
    const yamlContent = YAML.stringify({
      ...record,
      commitDate: record.commitDate.toISOString(),
    });
    
    writeFileSync(filePath, yamlContent, "utf-8");
  }

  findByProject(projectId: string): ImpactRecord[] {
    const impactDir = this.getImpactDir(projectId);
    
    if (!existsSync(impactDir)) {
      return [];
    }

    const files = readdirSync(impactDir).filter(f => f.endsWith(".yaml"));
    const records: ImpactRecord[] = [];

    for (const file of files) {
      const filePath = join(impactDir, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const data = YAML.parse(content);
        records.push({
          ...data,
          commitDate: new Date(data.commitDate),
        });
      } catch (error) {
        logger.error(`[impact] Failed to load impact record from ${filePath}:`, error);
      }
    }

    // Sort by commit date descending (newest first)
    return records.sort((a, b) => b.commitDate.getTime() - a.commitDate.getTime());
  }

  findBySession(projectId: string, sessionId: string): ImpactRecord[] {
    return this.findByProject(projectId).filter(r => r.sessionId === sessionId);
  }

  findByCommitHash(projectId: string, commitHash: string): ImpactRecord | null {
    const records = this.findByProject(projectId);
    return records.find(r => r.commitHash === commitHash) || null;
  }

  delete(projectId: string, sessionId: string, commitHash: string): void {
    const filePath = this.getImpactPath(projectId, sessionId, commitHash);
    if (existsSync(filePath)) {
      const fs = require("fs");
      fs.unlinkSync(filePath);
    }
  }
}

// Legacy singleton export - will be removed once all consumers use mimoContext
export const impactRepository = new ImpactRepository({
  projectsPath: join(homedir(), ".mimo", "projects"),
});
