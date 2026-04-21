import { vcs } from "../vcs/index.js";
import { logger } from "../logger.js";
import {
  detectChangedFiles,
  applySelectedFiles,
  type FileChange,
} from "./changed-files.js";
import {
  parsePatchPreview,
  type DiffHunk,
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

export interface PreviewFile extends FileChange {
  hunks?: DiffHunk[];
  isBinary?: boolean;
}

export interface CommitPreviewResult {
  success: boolean;
  preview?: {
    summary: { added: number; modified: number; deleted: number; binary: number };
    files: PreviewFile[];
  };
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

    // Detect changed files (accurate file list)
    const detected = await detectChangedFiles(
      session.upstreamPath,
      session.agentWorkspacePath,
    );

    if (detected.files.length === 0) {
      return {
        success: true,
        preview: {
          summary: { added: 0, modified: 0, deleted: 0, binary: 0 },
          files: [],
        },
      };
    }

    // Generate patch for inline diff display
    const genResult = await this.deps.vcs.generatePatch(
      session.agentWorkspacePath,
      session.upstreamPath,
    );

    let patchPreview = null;
    if (genResult.success && genResult.patch) {
      patchPreview = parsePatchPreview(genResult.patch);
    }

    // Merge detected files with patch hunks for modified files
    const files: PreviewFile[] = detected.files.map((file) => {
      const previewFile: PreviewFile = { ...file };

      if (patchPreview) {
        const patchFile = patchPreview.files.find((f) => f.path === file.path);
        if (patchFile) {
          previewFile.hunks = patchFile.hunks;
          previewFile.isBinary = patchFile.isBinary;
        }
      }

      return previewFile;
    });

    return {
      success: true,
      preview: {
        summary: { ...detected.summary, binary: patchPreview?.summary.binary || 0 },
        files,
      },
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

    // Detect changed files
    const changes = await detectChangedFiles(
      session.upstreamPath,
      session.agentWorkspacePath,
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

    // Generate patch BEFORE applying (captures actual changes)
    const { dirname, join } = await import("path");
    const genResult = await this.deps.vcs.generatePatch(
      session.agentWorkspacePath,
      session.upstreamPath,
    );

    // Apply selected files
    const applyResult = applySelectedFiles(
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
    if (genResult.success && genResult.patch) {
      const sessionDir = dirname(session.agentWorkspacePath);
      const patchDir = join(sessionDir, "patches");
      await this.deps.vcs.storePatch(patchDir, genResult.patch);
    }

    // Commit in upstream
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

    // Push to remote
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

    return {
      success: true,
      message: "Changes committed and pushed successfully",
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
    const message = commitMessage?.trim() || `Mimo commit at ${new Date().toISOString()}`;
    return this.commitAndPushSelective(
      sessionId,
      message,
      undefined,
      undefined,
    );
  }
}
