import { vcs } from "../vcs/index.js";
import { logger } from "../logger.js";
import {
  parsePatchPreview,
  type PatchPreview,
  filterPatchByPaths,
} from "./patch-preview.js";

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

export interface CommitPreviewResult {
  success: boolean;
  preview?: PatchPreview;
  error?: string;
}

export interface SelectiveCommitResult extends CommitAndPushResult {
  invalidPaths?: string[];
}

export interface CommitServiceDeps {
  sessionRepository: typeof sessionRepository;
  projectRepository: typeof projectRepository;
  impactRepository: typeof impactRepository;
  impactCalculator: typeof impactCalculator;
  vcs: typeof vcs;
}

export class CommitService {
  constructor(private deps: CommitServiceDeps) {}
  /**
   * Get commit preview for a session.
   * Generates a patch between agent-workspace and upstream, then parses it into preview format.
   */
  async getPreview(sessionId: string): Promise<CommitPreviewResult> {
    // Get session and project
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

    // Ensure agent-workspace has fossil checkout
    const fossilPath = this.deps.sessionRepository.getFossilPath(sessionId);
    const { existsSync } = await import("fs");
    const { join } = await import("path");
    const fslckoutPath = join(session.agentWorkspacePath, ".fslckout");

    if (!existsSync(fslckoutPath)) {
      const openResult = await this.deps.vcs.openFossil(
        fossilPath,
        session.agentWorkspacePath,
      );
      if (!openResult.success) {
        return {
          success: false,
          error: `Failed to initialize fossil checkout: ${openResult.error}`,
        };
      }
    }

    // Sync agent-workspace with repo.fossil
    const syncResult = await this.deps.vcs.fossilUp(session.agentWorkspacePath);
    if (!syncResult.success) {
      if (
        syncResult.error?.includes("not within an open check-out") ||
        syncResult.error?.includes("current directory is not within")
      ) {
        const openResult = await this.deps.vcs.openFossil(
          fossilPath,
          session.agentWorkspacePath,
        );
        if (!openResult.success) {
          return {
            success: false,
            error: `Failed to open fossil checkout: ${openResult.error}`,
          };
        }
        const retryResult = await this.deps.vcs.fossilUp(
          session.agentWorkspacePath,
        );
        if (!retryResult.success) {
          return {
            success: false,
            error: `Failed to sync with agent: ${retryResult.error}`,
          };
        }
      } else {
        return {
          success: false,
          error: `Failed to sync with agent: ${syncResult.error}`,
        };
      }
    }

    // Generate patch
    const genResult = await this.deps.vcs.generatePatch(
      session.agentWorkspacePath,
      session.upstreamPath,
    );

    if (!genResult.success) {
      return {
        success: false,
        error: `Failed to generate patch: ${genResult.error}`,
      };
    }

    // No changes - return empty preview
    if (!genResult.patch || genResult.patch.trim() === "") {
      return {
        success: true,
        preview: {
          summary: { added: 0, modified: 0, deleted: 0, binary: 0 },
          files: [],
          tree: [],
        },
      };
    }

    // Parse patch into preview format
    const preview = parsePatchPreview(genResult.patch);

    return {
      success: true,
      preview,
    };
  }

  /**
   * Commit and push with selective file application.
   * Only applies selected paths from the generated patch.
   */
  async commitAndPushSelective(
    sessionId: string,
    commitMessage: string,
    selectedPaths?: string[],
    applyStatuses?: { added: boolean; modified: boolean; deleted: boolean },
  ): Promise<SelectiveCommitResult> {
    // Get session and project
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

    // Validate commit message
    if (!commitMessage || commitMessage.trim() === "") {
      return {
        success: false,
        message: "Commit message is required",
        error: "Commit message is required",
        step: null,
      };
    }

    // Ensure agent-workspace has fossil checkout
    const fossilPath = this.deps.sessionRepository.getFossilPath(sessionId);
    const { existsSync } = await import("fs");
    const { join, dirname } = await import("path");
    const fslckoutPath = join(session.agentWorkspacePath, ".fslckout");

    if (!existsSync(fslckoutPath)) {
      const openResult = await this.deps.vcs.openFossil(
        fossilPath,
        session.agentWorkspacePath,
      );
      if (!openResult.success) {
        return {
          success: false,
          message: "Failed to initialize fossil checkout",
          error: openResult.error || "Checkout initialization failed",
          step: null,
        };
      }
    }

    // Step 1: Sync agent-workspace with repo.fossil
    const syncResult = await this.deps.vcs.fossilUp(session.agentWorkspacePath);
    if (!syncResult.success) {
      if (
        syncResult.error?.includes("not within an open check-out") ||
        syncResult.error?.includes("current directory is not within")
      ) {
        const openResult = await this.deps.vcs.openFossil(
          fossilPath,
          session.agentWorkspacePath,
        );
        if (!openResult.success) {
          return {
            success: false,
            message: "Failed to open fossil checkout",
            error: openResult.error || "fossil open failed",
            step: "sync",
          };
        }
        const retryResult = await this.deps.vcs.fossilUp(
          session.agentWorkspacePath,
        );
        if (!retryResult.success) {
          return {
            success: false,
            message: "Failed to sync with agent",
            error: retryResult.error || "fossil up failed after open",
            step: "sync",
          };
        }
      } else {
        return {
          success: false,
          message: "Failed to sync with agent",
          error: syncResult.error || "fossil up failed",
          step: "sync",
        };
      }
    }

    // Step 2: Generate patch
    const genResult = await this.deps.vcs.generatePatch(
      session.agentWorkspacePath,
      session.upstreamPath,
    );

    if (!genResult.success) {
      return {
        success: false,
        message: "Failed to generate patch",
        error: genResult.error || "Patch generation failed",
        step: "copy",
      };
    }

    // No changes
    if (!genResult.patch || genResult.patch.trim() === "") {
      return {
        success: true,
        message: "No changes to commit",
        step: null,
      };
    }

    // Parse patch to get available files
    const preview = parsePatchPreview(genResult.patch);

    // Filter by status if applyStatuses provided
    let availablePaths = preview.files.map((f) => f.path);
    if (applyStatuses) {
      availablePaths = preview.files
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
    const validPaths = new Set(preview.files.map((f) => f.path));
    const invalidPaths = pathsToApply.filter((p) => !validPaths.has(p));

    if (invalidPaths.length > 0) {
      return {
        success: false,
        message: "Invalid file paths selected",
        error: `Selected paths not found in preview: ${invalidPaths.join(", ")}`,
        step: null,
        invalidPaths,
      };
    }

    // Check if any files are selected
    if (pathsToApply.length === 0) {
      return {
        success: false,
        message: "No files selected for commit",
        error: "At least one file must be selected to commit",
        step: null,
      };
    }

    // Filter patch to selected paths
    const filteredPatch = filterPatchByPaths(genResult.patch, pathsToApply);

    if (filteredPatch.trim() === "") {
      return {
        success: false,
        message: "No changes to apply for selected files",
        error: "Selected files have no changes to commit",
        step: null,
      };
    }

    // Step 3: Store and apply filtered patch
    const sessionDir = dirname(session.agentWorkspacePath);
    const patchDir = join(sessionDir, "patches");
    const patchPath = await this.deps.vcs.storePatch(patchDir, filteredPatch);

    const applyResult = await this.deps.vcs.applyPatch(
      patchPath,
      session.upstreamPath,
      repoType,
    );
    if (!applyResult.success) {
      return {
        success: false,
        message: "Failed to apply patch",
        error: applyResult.error || "Patch failed",
        step: "copy",
      };
    }

    // Step 4: Commit in upstream
    const commitResult = await this.deps.vcs.commitUpstream(
      session.upstreamPath,
      repoType,
      commitMessage,
    );
    if (!commitResult.success) {
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
      return {
        success: false,
        message: "Failed to commit changes",
        error: commitResult.error || "Commit failed",
        step: "commit",
      };
    }

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

    // Step 5: Push to remote
    const pushBranch = session.branch || project.newBranch || undefined;
    const pushResult = await this.deps.vcs.pushUpstream(
      session.upstreamPath,
      repoType,
      undefined,
      pushBranch,
    );
    if (!pushResult.success) {
      return {
        success: false,
        message: "Push failed",
        error: pushResult.error || "Push failed",
        step: "push",
      };
    }

    // Step 6: Capture and save impact metrics (best effort - don't fail commit if this fails)
    try {
      const sccService = await import("../impact/scc-service.js");
      if (sccService.sccService.isInstalled()) {
        const { metrics } = await this.deps.impactCalculator.calculateImpact(
          sessionId,
          session.upstreamPath,
          session.agentWorkspacePath,
        );

        const commitHash =
          commitResult.output?.match(/[a-f0-9]{40}|[a-f0-9]{64}/)?.[0] ||
          "unknown";

        this.deps.impactRepository.save({
          id: `${sessionId}-${commitHash}`,
          sessionId: sessionId,
          sessionName: session.name,
          projectId: session.projectId,
          commitHash: commitHash,
          commitDate: new Date(),
          files: {
            new: metrics.files.new,
            changed: metrics.files.changed,
            deleted: metrics.files.deleted,
          },
          linesOfCode: {
            added: metrics.linesOfCode.added,
            removed: metrics.linesOfCode.removed,
            net: metrics.linesOfCode.net,
          },
          complexity: {
            cyclomatic: metrics.complexity.cyclomatic,
            cognitive: metrics.complexity.cognitive,
            estimatedMinutes: metrics.complexity.estimatedMinutes,
          },
          complexityByLanguage: metrics.byLanguage,
          fossilUrl: ``,
        });
      } else {
        logger.debug(`[commit] Skipping impact metrics - scc not installed`);
      }
    } catch (error) {
      logger.error(`[commit] Failed to capture impact metrics:`, error);
      // Don't fail the commit if impact capture fails
    }

    return {
      success: true,
      message: "Changes committed and pushed successfully!",
      step: null,
    };
  }

  async commitAndPush(
    sessionId: string,
    commitMessage?: string,
  ): Promise<CommitAndPushResult> {
    // Use default message if none provided
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
