// SPDX-License-Identifier: AGPL-3.0-only
import { logger } from "../../logger.js";
import type { VCS } from "../vcs/index.js";
import type { OS } from "../../infrastructure/os/types.js";
import {
  applySelectedFiles,
  detectChangedFiles,
  type FileChange,
  type ChangedFilesResult,
} from "./changed-files.js";
import { parsePatchPreview, type DiffHunk } from "./patch-preview.js";
import type { Credential } from "../credentials/repository.js";
import { ChangedFilesCache } from "./changed-files-cache.js";
import {
  createManifestStore,
  type ManifestStore,
} from "../files/tree-manifest.js";

export interface CommitResult {
  success: boolean;
  commitHash?: string;
  message: string;
  error?: string;
  hasChanges: boolean;
}

export interface PushResult {
  success: boolean;
  message: string;
  error?: string;
}

export interface CommitAndPushResult {
  success: boolean;
  message: string;
  error?: string;
  step: "sync" | "copy" | "commit" | "push" | null;
}

export interface PreviewFile extends FileChange {
  hunks?: DiffHunk[];
  isBinary?: boolean;
}

export interface CommitPreviewResult {
  success: boolean;
  preview?: {
    summary: {
      added: number;
      modified: number;
      deleted: number;
    };
    files: PreviewFile[];
  };
  error?: string;
}

export interface FileHunksResult {
  success: boolean;
  hunks?: DiffHunk[];
  isBinary?: boolean;
  error?: string;
}

export interface SelectiveCommitResult extends CommitAndPushResult {
  invalidPaths?: string[];
}

export interface RepoQualifiedSelectedPath {
  repoId: string;
  path: string;
}

export interface RepoCommitResult {
  repoId: string;
  status: "committed" | "skipped" | "failed";
  message: string;
  error?: string;
  step?: "sync" | "copy" | "commit" | "push" | null;
}

export interface MultiRepoCommitResult {
  success: boolean;
  message: string;
  results: RepoCommitResult[];
}

export interface CommitServiceDeps {
  sessionRepository: any;
  projectRepository: any;
  credentialRepository: {
    findById: (id: string, owner: string) => Promise<Credential | null>;
  };
  managedRepositories?: {
    findById: (id: string, owner: string) => Promise<{
      repoUrl: string;
      repoType: "git" | "fossil";
      credentialId?: string;
      clonePort?: number;
    } | null>;
  };
  impactRepository: any;
  impactCalculator: any;
  vcs: VCS;
  os: OS;
  changedFilesCache?: ChangedFilesCache;
}

export class CommitService {
  private changedFilesCache: ChangedFilesCache;

  constructor(private deps: CommitServiceDeps) {
    this.changedFilesCache = deps.changedFilesCache ?? new ChangedFilesCache();
  }

  /**
   * Build the persisted per-session manifest store. Both the preview and the
   * commit path derive their changed-file list from `detectChangedFiles`, so
   * they must share the same manifest directory to keep their stat-caches in
   * sync. `upstream` and `agent-workspace` are siblings, so either path yields
   * the same session directory.
   */
  private manifestStoreFor(treePath: string): ManifestStore {
    return createManifestStore(
      this.deps.os,
      this.deps.os.path.join(this.deps.os.path.dirname(treePath), ".manifests"),
    );
  }

  /**
   * Resolve the session's git `baseline` to a concrete commit SHA in the agent
   * workspace, or null when the session has no baseline (pre-git-range sessions)
   * or the workspace is not a resolvable git checkout. When non-null, the
   * preview/hunks/impact read paths use the native git commit-range
   * (`<baseline>..HEAD`) instead of the two-tree filesystem scan.
   */
  private async resolveBaseline(session: {
    baseline?: string;
    agentWorkspacePath: string;
  }): Promise<string | null> {
    if (!session.baseline) return null;
    try {
      return await this.deps.vcs.revParse(
        session.agentWorkspacePath,
        session.baseline,
      );
    } catch {
      return null;
    }
  }

  /**
   * After a successful commit the upstream checkout has changed, so any cached
   * changed-file list and the upstream stat-manifest must be dropped to force a
   * fresh comparison on the next preview/commit.
   */
  private async invalidateCaches(
    sessionId: string,
    upstreamPath?: string,
  ): Promise<void> {
    this.changedFilesCache.invalidate(sessionId);

    if (upstreamPath) {
      await this.manifestStoreFor(upstreamPath).invalidate(upstreamPath);
    }
  }

  private projectReposFor(project: any): any[] {
    return project.repositories;
  }

  private async applyRepoContext(session: any, project: any, repoId?: string) {
    const sessionRepo = repoId
      ? session.repos.find((repo: any) => repo.projectRepoId === repoId)
      : session.repos[0];
    if (!sessionRepo) {
      throw new Error("Repository not found");
    }
    const projectRepo =
      this.projectReposFor(project).find(
        (repo) => repo.id === sessionRepo.projectRepoId,
      ) ?? this.projectReposFor(project)[0];

    const managed =
      projectRepo?.repoId && this.deps.managedRepositories
        ? await this.deps.managedRepositories.findById(
            projectRepo.repoId,
            project.owner,
          )
        : null;

    return {
      session: {
        ...session,
        upstreamPath: sessionRepo.upstreamPath,
        agentWorkspacePath: sessionRepo.workspacePath,
        branch: sessionRepo.branch ?? session.branch,
        baseline: sessionRepo.baseline ?? session.baseline,
      },
      project: {
        ...project,
        repoUrl: managed?.repoUrl ?? projectRepo?.repoUrl,
        repoType: managed?.repoType ?? projectRepo?.repoType,
        credentialId: managed?.credentialId ?? projectRepo?.credentialId,
        sourceBranch: projectRepo?.sourceBranch,
        newBranch: projectRepo?.newBranch,
        clonePort: managed?.clonePort ?? projectRepo?.clonePort,
      },
      repoId: sessionRepo.projectRepoId,
    };
  }

  private async persistRepoBaseline(
    session: any,
    repoId: string | undefined,
    baseline: string,
  ): Promise<void> {
    if (!repoId) {
      await this.deps.sessionRepository.update(session.id, { baseline });
      return;
    }
    await this.deps.sessionRepository.update(session.id, {
      ...(repoId === "default" && { baseline }),
      repos: session.repos.map((repo: any) =>
        repo.projectRepoId === repoId ? { ...repo, baseline } : repo,
      ),
    });
  }
  private async getPreviewForRepo(
    session: any,
    repoId?: string,
  ): Promise<CommitPreviewResult> {
    const baseline = await this.resolveBaseline(session);
    let detected: ChangedFilesResult;
    if (baseline) {
      detected = await this.deps.vcs.diffNameStatus(
        session.agentWorkspacePath,
        baseline,
      );
    } else {
      const manifestStore = this.manifestStoreFor(session.agentWorkspacePath);
      detected = await detectChangedFiles(
        this.deps.os,
        session.upstreamPath,
        session.agentWorkspacePath,
        undefined,
        manifestStore,
      );
    }

    this.changedFilesCache.set(
      session.id,
      session.upstreamPath,
      session.agentWorkspacePath,
      detected,
      repoId,
    );

    return {
      success: true,
      preview: {
        summary: detected.summary,
        files: detected.files.map((file) => ({
          ...file,
          ...(repoId && { repoId }),
        })),
      },
    };
  }

  /**
   * Get commit preview for a session.
   * Detects changed files by comparing workspace with upstream.
   * Also generates patch for inline diff display.
   */
  async getPreview(sessionId: string): Promise<CommitPreviewResult> {
    const session = await this.deps.sessionRepository.findById(sessionId);
    if (!session) {
      return {
        success: false,
        error: "Session not found",
      };
    }

    const project = await this.deps.projectRepository.findById(
      session.projectId,
    );
    if (!project) {
      return {
        success: false,
        error: "Project not found",
      };
    }

    const aggregate: NonNullable<CommitPreviewResult["preview"]> = {
      summary: { added: 0, modified: 0, deleted: 0 },
      files: [],
    };
    for (const repo of session.repos) {
      const context = await this.applyRepoContext(
        session,
        project,
        repo.projectRepoId,
      );
      const result = await this.getPreviewForRepo(
        context.session,
        context.repoId,
      );
      if (!result.success || !result.preview) {
        return result;
      }
      aggregate.files.push(...result.preview.files);
      aggregate.summary.added += result.preview.summary.added;
      aggregate.summary.modified += result.preview.summary.modified;
      aggregate.summary.deleted += result.preview.summary.deleted;
    }
    return { success: true, preview: aggregate };
  }

  /**
   * Get the diff hunks for a single file in a session.
   * This is the on-demand complement to getPreview(): the preview returns the
   * file list and summary, and this endpoint returns the actual diff for a
   * selected file when the user expands it.
   */
  async getFileHunks(
    sessionId: string,
    filePath: string,
    repoId?: string,
  ): Promise<FileHunksResult> {
    let session = await this.deps.sessionRepository.findById(sessionId);
    if (!session) {
      return { success: false, error: "Session not found" };
    }
    const project = await this.deps.projectRepository.findById(session.projectId);
    if (!project) {
      return { success: false, error: "Project not found" };
    }
    session = (await this.applyRepoContext(session, project, repoId)).session;

    const { os, vcs } = this.deps;

    // Preferred path: compute the per-file diff from the git commit range for
    // that path, reading only the requested file from git's object store. No
    // dependency on the `upstream/` working tree.
    const baseline = await this.resolveBaseline(session);
    if (baseline) {
      const { hunks, isBinary } = await vcs.diffFileRange(
        session.agentWorkspacePath,
        baseline,
        filePath,
      );
      return { success: true, hunks, isBinary };
    }

    const upstreamFile = os.path.join(session.upstreamPath, filePath);
    const workspaceFile = os.path.join(session.agentWorkspacePath, filePath);
    const [upstreamExists, workspaceExists] = await Promise.all([
      os.fs.existsAsync(upstreamFile),
      os.fs.existsAsync(workspaceFile),
    ]);

    if (!upstreamExists && !workspaceExists) {
      return { success: false, error: "File not found in preview" };
    }

    // Diff just this file's two versions ("/dev/null" renders add/delete) rather
    // than diffing the whole tree. O(one file), independent of repository size.
    const diffResult = await vcs.diffFile(
      upstreamExists ? upstreamFile : "/dev/null",
      workspaceExists ? workspaceFile : "/dev/null",
    );

    if (!diffResult.success) {
      return { success: false, error: diffResult.error };
    }

    const patch = diffResult.patch || "";
    if (patch.trim().length === 0) {
      return { success: true, hunks: [] };
    }

    const patchPreview = parsePatchPreview(patch);
    const patchFile = patchPreview.files[0];

    return {
      success: true,
      hunks: patchFile?.hunks,
      isBinary: patchFile?.isBinary,
    };
  }

  /**
   * Commit and push with selective file application.
   * Copies selected files from workspace to upstream, then commits.
   */
  async commitAndPushSelective(
    sessionId: string,
    commitMessage: string,
    selectedPaths?: string[],
    applyStatuses?: { added: boolean; modified: boolean; deleted: boolean },
    repoId?: string,
  ): Promise<SelectiveCommitResult> {
    let session = await this.deps.sessionRepository.findById(sessionId);
    if (!session) {
      return {
        success: false,
        message: "Session not found",
        error: "Session not found",
        step: null,
      };
    }

    let project = await this.deps.projectRepository.findById(
      session.projectId,
    );
    if (!project) {
      return {
        success: false,
        message: "Project not found",
        error: "Project not found",
        step: null,
      };
    }

    try {
      const context = await this.applyRepoContext(session, project, repoId);
      session = context.session;
      project = context.project;
      repoId = context.repoId;
    } catch (error) {
      return {
        success: false,
        message: "Repository not found",
        error: error instanceof Error ? error.message : "Repository not found",
        step: null,
      };
    }

    const repoType = project.repoType;

    if (!commitMessage || commitMessage.trim() === "") {
      return {
        success: false,
        message: "Commit message is required",
        error: "Commit message is required",
        step: null,
      };
    }

    // Derive the changed-file list the same way the preview does — never
    // building a whole-repository `git diff --binary` just to learn which files
    // changed. Reuse the warm cache populated by the preview that normally
    // precedes the commit; on a miss recompute from the git commit range
    // (`<baseline>..HEAD`) when the session has a baseline, otherwise fall back
    // to the two-tree stat-diff against the persisted manifest store.
    const baseline = await this.resolveBaseline(session);
    let changes = this.changedFilesCache.get(
      session.id,
      session.upstreamPath,
      session.agentWorkspacePath,
      repoId,
    );
    if (!changes) {
      changes = baseline
        ? await this.deps.vcs.diffNameStatus(
            session.agentWorkspacePath,
            baseline,
          )
        : await detectChangedFiles(
            this.deps.os,
            session.upstreamPath,
            session.agentWorkspacePath,
            undefined,
            this.manifestStoreFor(session.agentWorkspacePath),
          );
    }

    // Cache the derived changed-file list so impact analysis can reuse it
    // without re-scanning both directories.
    this.changedFilesCache.set(
      session.id,
      session.upstreamPath,
      session.agentWorkspacePath,
      changes,
      repoId,
    );

    if (changes.files.length === 0) {
      return {
        success: true,
        message: "No changes to commit",
        step: null,
      };
    }

    // Filter by status if applyStatuses provided
    let availablePaths = changes.files.map((f) => f.path);
    if (applyStatuses) {
      availablePaths = changes.files
        .filter((f) => {
          if (f.status === "added" && applyStatuses.added) return true;
          if (f.status === "modified" && applyStatuses.modified) return true;
          if (f.status === "deleted" && applyStatuses.deleted) return true;
          return false;
        })
        .map((f) => f.path);
    }

    // If no paths selected, use all available paths
    const pathsToApply =
      selectedPaths && selectedPaths.length > 0
        ? selectedPaths
        : availablePaths;

    // Validate selected paths
    const validPaths = new Set(changes.files.map((f) => f.path));
    const invalidPaths = pathsToApply.filter((p) => !validPaths.has(p));

    if (invalidPaths.length > 0) {
      return {
        success: false,
        message: "Invalid file paths selected",
        error: `Selected paths not found: ${invalidPaths.join(", ")}`,
        step: null,
        invalidPaths,
      };
    }

    if (pathsToApply.length === 0) {
      return {
        success: false,
        message: "No files selected for commit",
        error: "At least one file must be selected to commit",
        step: null,
      };
    }

    // Apply selected files
    const applyResult = applySelectedFiles(
      this.deps.os,
      session.upstreamPath,
      session.agentWorkspacePath,
      pathsToApply,
    );

    if (!applyResult.success) {
      return {
        success: false,
        message: "Failed to apply changes",
        error: applyResult.error || "Apply failed",
        step: "copy",
      };
    }

    // Commit in upstream
    const commitResult = await this.deps.vcs.commitUpstream(
      session.upstreamPath,
      repoType,
      commitMessage,
    );

    if (
      commitResult.output?.includes("nothing to commit") ||
      commitResult.output?.includes("No changes to commit")
    ) {
      return {
        success: true,
        message: "No changes to commit",
        step: null,
      };
    }

    if (!commitResult.success) {
      return {
        success: false,
        message: "Failed to commit changes",
        error: commitResult.error || "Commit failed",
        step: "commit",
      };
    }

    // ── Create impact record for successful commit ─────────────────────────
    try {
      const { metrics } = await this.deps.impactCalculator.calculateImpact(
        session.id,
        session.upstreamPath,
        session.agentWorkspacePath,
        false,
        changes,
      );

      const complexityByLanguage =
        metrics.byLanguage?.map((lang: any) => ({
          language: lang.language,
          files: lang.files ?? 0,
          linesAdded: lang.linesAdded ?? 0,
          linesRemoved: lang.linesRemoved ?? 0,
          complexityDelta: lang.complexityDelta ?? 0,
        })) ?? [];

      const impactRecord = {
        id: `${session.id}-${commitResult.commitHash || Date.now()}`,
        sessionId: session.id,
        sessionName: session.name,
        projectId: session.projectId,
        commitHash: commitResult.commitHash || "unknown",
        commitDate: new Date(),
        files: {
          new: metrics.files?.new ?? 0,
          changed: metrics.files?.changed ?? 0,
          deleted: metrics.files?.deleted ?? 0,
        },
        linesOfCode: {
          added: metrics.linesOfCode?.added ?? 0,
          removed: metrics.linesOfCode?.removed ?? 0,
          net: metrics.linesOfCode?.net ?? 0,
        },
        complexity: {
          cyclomatic: metrics.complexity?.cyclomatic ?? 0,
          cognitive: metrics.complexity?.cognitive ?? 0,
          estimatedMinutes: metrics.complexity?.estimatedMinutes ?? 0,
        },
        complexityByLanguage,
        cloneUrl: "",
      };

      this.deps.impactRepository.save(impactRecord);
      logger.debug(
        `[commit] Impact record saved for session ${session.id} commit ${impactRecord.commitHash}`,
      );
    } catch (impactError) {
      // Impact recording is best-effort; do not fail the commit if it errors
      logger.error(
        `[commit] Failed to save impact record for session ${session.id}:`,
        impactError,
      );
    }
    // ────────────────────────────────────────────────────────────────────────

    let pushCredential: Credential | undefined;
    if (project.credentialId) {
      const credential = await this.deps.credentialRepository.findById(
        project.credentialId,
        project.owner,
      );
      if (!credential) {
        return {
          success: false,
          message: "Push failed",
          error: "Project credential not found",
          step: "push",
        };
      }
      pushCredential = credential;
    }

    // Push to remote
    const pushBranch = session.branch || project.newBranch || undefined;
    const effectiveClonePort = session.clonePort ?? project.clonePort;
    const pushResult = await this.deps.vcs.pushUpstream(
      session.upstreamPath,
      repoType,
      pushCredential,
      pushBranch,
      undefined,
      effectiveClonePort,
    );

    if (!pushResult.success) {
      return {
        success: false,
        message: "Push failed",
        error: pushResult.error || "Push failed",
        step: "push",
      };
    }

    // Commit succeeded: the just-committed paths are now part of upstream state.
    // Advance the baseline (Decision 2a checkpoint commit) so the next
    // `<baseline>..HEAD` preview no longer reports them, while the remaining
    // changes stay pending — preserving two-endpoint semantics without touching
    // the agent workspace's HEAD. Persist the new baseline so it survives
    // restarts.
    if (baseline) {
      const newBaseline = await this.deps.vcs.advanceBaseline(
        session.agentWorkspacePath,
        baseline,
        pathsToApply,
      );
      if (newBaseline && newBaseline !== baseline) {
        await this.persistRepoBaseline(session, repoId, newBaseline);
      } else if (!newBaseline) {
        logger.error(
          `[commit] Failed to advance baseline for session ${session.id}; committed files may reappear in the next preview`,
        );
      }
    }

    // Future previews must reflect the new upstream state, so drop the cached
    // changed-file list and delete the upstream manifest.
    await this.invalidateCaches(session.id, session.upstreamPath);

    return {
      success: true,
      message: "Changes committed and pushed successfully",
      step: null,
    };
  }

  async commitAndPushAcrossRepos(
    sessionId: string,
    commitMessage: string,
    selectedPaths?: Array<string | RepoQualifiedSelectedPath>,
    applyStatuses?: { added: boolean; modified: boolean; deleted: boolean },
  ): Promise<MultiRepoCommitResult> {
    const session = await this.deps.sessionRepository.findById(sessionId);
    if (!session) {
      return {
        success: false,
        message: "Session not found",
        results: [],
      };
    }
    const project = await this.deps.projectRepository.findById(session.projectId);
    if (!project) {
      return {
        success: false,
        message: "Project not found",
        results: [],
      };
    }
    const selectedByRepo = new Map<string, string[]>();
    for (const selected of selectedPaths ?? []) {
      if (typeof selected === "string") continue;
      const paths = selectedByRepo.get(selected.repoId) ?? [];
      paths.push(selected.path);
      selectedByRepo.set(selected.repoId, paths);
    }

    const results: RepoCommitResult[] = [];
    for (const repo of session.repos) {
      const result = await this.commitAndPushSelective(
        sessionId,
        commitMessage,
        selectedByRepo.has(repo.projectRepoId)
          ? selectedByRepo.get(repo.projectRepoId)
          : undefined,
        applyStatuses,
        repo.projectRepoId,
      );
      results.push({
        repoId: repo.projectRepoId,
        status: result.success
          ? result.message.includes("No changes")
            ? "skipped"
            : "committed"
          : "failed",
        message: result.message,
        error: result.error,
        step: result.step,
      });
    }

    const failed = results.filter((result) => result.status === "failed");
    const committed = results.filter((result) => result.status === "committed");
    return {
      success: failed.length === 0,
      message:
        failed.length > 0
          ? `${failed.length} repository commit(s) failed`
          : committed.length === 0
            ? "No changes to commit"
            : "Changes committed and pushed successfully",
      results,
    };
  }

  /**
   * Force push upstream commits to remote.
   * This is a destructive operation that overwrites remote history.
   */
  async forcePush(
    sessionId: string,
    repoId?: string,
  ): Promise<CommitAndPushResult> {
    let session = await this.deps.sessionRepository.findById(sessionId);
    if (!session) {
      return {
        success: false,
        message: "Session not found",
        error: "Session not found",
        step: null,
      };
    }

    let project = await this.deps.projectRepository.findById(
      session.projectId,
    );
    if (!project) {
      return {
        success: false,
        message: "Project not found",
        error: "Project not found",
        step: null,
      };
    }

    try {
      const context = await this.applyRepoContext(session, project, repoId);
      session = context.session;
      project = context.project;
    } catch (error) {
      return {
        success: false,
        message: "Repository not found",
        error: error instanceof Error ? error.message : "Repository not found",
        step: null,
      };
    }

    const repoType = project.repoType;
    const pushBranch = session.branch || project.newBranch || undefined;
    let pushCredential: Credential | undefined;

    if (project.credentialId) {
      const credential = await this.deps.credentialRepository.findById(
        project.credentialId,
        project.owner,
      );
      if (!credential) {
        return {
          success: false,
          message: "Force push failed",
          error: "Project credential not found",
          step: "push",
        };
      }
      pushCredential = credential;
    }

    // Push to remote with force flag
    const effectiveClonePortForce = session.clonePort ?? project.clonePort;
    const pushResult = await this.deps.vcs.pushUpstream(
      session.upstreamPath,
      repoType,
      pushCredential,
      pushBranch,
      { force: true },
      effectiveClonePortForce,
    );

    if (!pushResult.success) {
      // Check for "no upstream branch" / "no remote configured"
      if (
        pushResult.error?.includes("no upstream branch") ||
        pushResult.error?.includes("has no upstream branch") ||
        pushResult.output?.includes("No remote configured")
      ) {
        return {
          success: true,
          message: "No remote configured",
          step: null,
        };
      }

      return {
        success: false,
        message: "Force push failed",
        error: pushResult.error || "Force push failed",
        step: "push",
      };
    }

    return {
      success: true,
      message: "Force push completed successfully",
      step: null,
    };
  }

  /**
   * Commit and push all changes (backward compatibility).
   * Alias for commitAndPushSelective with no selected paths.
   */
  async commitAndPush(
    sessionId: string,
    commitMessage?: string,
  ): Promise<CommitAndPushResult> {
    // Generate default message if none provided
    const message =
      commitMessage?.trim() || `Mimo commit at ${new Date().toISOString()}`;
    const session = await this.deps.sessionRepository.findById(sessionId);
    if (session?.repos?.length) {
      const result = await this.commitAndPushAcrossRepos(sessionId, message);
      return {
        success: result.success,
        message: result.message,
        error: result.success ? undefined : result.message,
        step: null,
      };
    }
    return this.commitAndPushSelective(
      sessionId,
      message,
      undefined,
      undefined,
    );
  }
}
