// SPDX-License-Identifier: AGPL-3.0-only
import { logger } from "../../logger.js";
import type { VCS } from "../vcs/index.js";
import type { OS } from "../../infrastructure/os/types.js";
import {
  applySelectedFiles,
  detectChangedFiles,
  detectChangedFilesFromPatchPreviewAsync,
  type FileChange,
} from "./changed-files.js";
import { parsePatchPreview, type DiffHunk } from "./patch-preview.js";
import type { Credential } from "../credentials/repository.js";
import { ChangedFilesCache } from "./changed-files-cache.js";
import type { ChangedFilesResult } from "../files/changed-files.js";
import { createManifestStore } from "../files/tree-manifest.js";

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

export interface CommitServiceDeps {
  sessionRepository: any;
  projectRepository: any;
  credentialRepository: {
    findById: (id: string, owner: string) => Promise<Credential | null>;
  };
  impactRepository: any;
  impactCalculator: any;
  vcs: VCS;
  os: OS;
  changedFilesCache?: ChangedFilesCache;
}

export class CommitService {
  private patchCache = new Map<string, { patch: string; cachedAt: number }>();
  private readonly PATCH_CACHE_TTL_MS = 30_000;
  private changedFilesCache: ChangedFilesCache;

  constructor(private deps: CommitServiceDeps) {
    this.changedFilesCache = deps.changedFilesCache ?? new ChangedFilesCache();
  }

  /**
   * Generate (or reuse a recently cached) patch for a session.
   * Caching avoids running `git diff` twice in the common preview-then-commit
   * flow while the TTL keeps the window short enough that stale data is rare.
   */
  private async getCachedPatch(
    sessionId: string,
    agentWorkspacePath: string,
    upstreamPath: string,
  ): Promise<{ patch: string } | { error: string }> {
    const cached = this.patchCache.get(sessionId);
    if (cached && Date.now() - cached.cachedAt < this.PATCH_CACHE_TTL_MS) {
      logger.debug(`[commit] using cached patch for session ${sessionId}`);
      return { patch: cached.patch };
    }

    const genResult = await this.deps.vcs.generatePatch(
      agentWorkspacePath,
      upstreamPath,
    );

    if (!genResult.success) {
      return {
        error: genResult.error || "Failed to generate patch",
      };
    }

    const patch = genResult.patch || "";
    this.patchCache.set(sessionId, { patch, cachedAt: Date.now() });
    return { patch };
  }

  private async invalidatePatchCache(
    sessionId: string,
    upstreamPath?: string,
  ): Promise<void> {
    this.patchCache.delete(sessionId);
    this.changedFilesCache.invalidate(sessionId);

    if (upstreamPath) {
      const manifestStore = createManifestStore(
        this.deps.os,
        this.deps.os.path.join(
          this.deps.os.path.dirname(upstreamPath),
          ".manifests",
        ),
      );
      await manifestStore.invalidate(upstreamPath);
    }
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

    // Compare the two working trees directly. This is a size-first, VCS-agnostic
    // walk that prunes excluded paths (`.git`, `node_modules`, fossil internals)
    // and reads file content only to disambiguate same-size files. It avoids the
    // whole-tree `git diff --no-index --binary` that, on large repositories,
    // walks and base85-encodes the entire `.git` store even for one changed file.
    const manifestStore = createManifestStore(
      this.deps.os,
      this.deps.os.path.join(
        this.deps.os.path.dirname(session.agentWorkspacePath),
        ".manifests",
      ),
    );
    const detected = await detectChangedFiles(
      this.deps.os,
      session.upstreamPath,
      session.agentWorkspacePath,
      undefined,
      manifestStore,
    );

    // Share the derived changed-file list with impact analysis.
    this.changedFilesCache.set(
      session.id,
      session.upstreamPath,
      session.agentWorkspacePath,
      detected,
    );

    // Do not include hunks in the initial preview response. For large diffs
    // sending every hunk makes the response huge and slow, often causing
    // browser/network timeouts. Hunks are fetched on demand via getFileHunks().
    const files: PreviewFile[] = detected.files.map((file) => ({ ...file }));

    return {
      success: true,
      preview: {
        summary: detected.summary,
        files,
      },
    };
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
  ): Promise<FileHunksResult> {
    const session = await this.deps.sessionRepository.findById(sessionId);
    if (!session) {
      return { success: false, error: "Session not found" };
    }

    const { os, vcs } = this.deps;
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
  ): Promise<SelectiveCommitResult> {
    const session = await this.deps.sessionRepository.findById(sessionId);
    if (!session) {
      return {
        success: false,
        message: "Session not found",
        error: "Session not found",
        step: null,
      };
    }

    const project = await this.deps.projectRepository.findById(
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

    const repoType = project.repoType;

    if (!commitMessage || commitMessage.trim() === "") {
      return {
        success: false,
        message: "Commit message is required",
        error: "Commit message is required",
        step: null,
      };
    }

    // Generate patch first — same source we now use for the preview.
    // This replaces the expensive full-directory MD5 scan.
    const { dirname, join } = await import("path");
    const patchResult = await this.getCachedPatch(
      session.id,
      session.agentWorkspacePath,
      session.upstreamPath,
    );

    if ("error" in patchResult) {
      return {
        success: false,
        message: "Failed to compare workspaces",
        error: patchResult.error,
        step: "sync",
      };
    }

    const patch = patchResult.patch;
    if (patch.trim().length === 0) {
      return {
        success: true,
        message: "No changes to commit",
        step: null,
      };
    }

    const patchPreview = parsePatchPreview(patch);

    // Derive changed files from the patch instead of scanning both trees.
    const changes = await detectChangedFilesFromPatchPreviewAsync(
      this.deps.os,
      session.upstreamPath,
      session.agentWorkspacePath,
      patchPreview,
    );

    // Cache the derived changed-file list so impact analysis can reuse it
    // without re-scanning both directories.
    this.changedFilesCache.set(
      session.id,
      session.upstreamPath,
      session.agentWorkspacePath,
      changes,
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

    // Store patch for history (generated before apply, so it has the actual diff)
    const sessionDir = dirname(session.agentWorkspacePath);
    const patchDir = join(sessionDir, "patches");
    await this.deps.vcs.storePatch(patchDir, patch);

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

    // Commit succeeded: future previews must reflect the new upstream state,
    // so drop any cached patch for this session and delete the upstream manifest.
    await this.invalidatePatchCache(session.id, session.upstreamPath);

    return {
      success: true,
      message: "Changes committed and pushed successfully",
      step: null,
    };
  }

  /**
   * Force push upstream commits to remote.
   * This is a destructive operation that overwrites remote history.
   */
  async forcePush(sessionId: string): Promise<CommitAndPushResult> {
    const session = await this.deps.sessionRepository.findById(sessionId);
    if (!session) {
      return {
        success: false,
        message: "Session not found",
        error: "Session not found",
        step: null,
      };
    }

    const project = await this.deps.projectRepository.findById(
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
    return this.commitAndPushSelective(
      sessionId,
      message,
      undefined,
      undefined,
    );
  }
}
