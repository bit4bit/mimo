import { vcs } from "../vcs/index.js";
import { sessionRepository } from "../sessions/repository.js";
import { projectRepository } from "../projects/repository.js";
import { impactRepository } from "../impact/repository.js";
import { impactCalculator } from "../impact/calculator.js";

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

export class CommitService {
  async commitAndPush(sessionId: string): Promise<CommitAndPushResult> {
    // Step 0: Get session and project
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      return {
        success: false,
        message: "Session not found",
        error: "Session not found",
        step: null,
      };
    }

    const project = await projectRepository.findById(session.projectId);
    if (!project) {
      return {
        success: false,
        message: "Project not found",
        error: "Project not found",
        step: null,
      };
    }

    const repoType = project.repoType;

    // Step 0.5: Ensure agent-workspace has fossil checkout (for legacy sessions)
    const fossilPath = `${session.upstreamPath}/../repo.fossil`;
    const { existsSync } = await import("fs");
    const { join } = await import("path");
    const fslckoutPath = join(session.agentWorkspacePath, ".fslckout");
    
    if (!existsSync(fslckoutPath)) {
      console.log(`[commit] Initializing fossil checkout in agent-workspace...`);
      const openResult = await vcs.openFossil(fossilPath, session.agentWorkspacePath);
      if (!openResult.success) {
        console.error(`[commit] Failed to initialize checkout: ${openResult.error}`);
        return {
          success: false,
          message: "Failed to initialize fossil checkout",
          error: openResult.error || "Checkout initialization failed",
          step: null,
        };
      }
    }

    // Step 1: Sync agent-workspace with repo.fossil
    console.log(`[commit] Step 1: Syncing agent-workspace with repo.fossil...`);
    const syncResult = await vcs.fossilUp(session.agentWorkspacePath);
    if (!syncResult.success) {
      // Check if it's because checkout doesn't exist
      if (syncResult.error?.includes("not within an open check-out") ||
          syncResult.error?.includes("current directory is not within")) {
        console.log(`[commit] Checkout not initialized, opening fossil repo...`);
        const openResult = await vcs.openFossil(fossilPath, session.agentWorkspacePath);
        if (!openResult.success) {
          return {
            success: false,
            message: "Failed to open fossil checkout",
            error: openResult.error || "fossil open failed",
            step: "sync",
          };
        }
        // Retry fossil up after opening
        const retryResult = await vcs.fossilUp(session.agentWorkspacePath);
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

    // Step 2: Generate patch, store, and apply to upstream
    console.log(`[commit] Step 2: Generating and applying patch...`);
    const { dirname } = await import("path");
    const sessionDir = dirname(session.agentWorkspacePath);
    const patchDir = join(sessionDir, "patches");
    const patchResult = await vcs.generateAndApplyPatch(
      session.agentWorkspacePath,
      session.upstreamPath,
      patchDir,
      repoType
    );
    if (!patchResult.success) {
      return {
        success: false,
        message: "Failed to apply patch",
        error: patchResult.error || "Patch failed",
        step: "copy",
      };
    }

    // Step 3: Commit in upstream
    console.log(`[commit] Step 3: Committing in upstream...`);
    const commitResult = await vcs.commitUpstream(session.upstreamPath, repoType);
    if (!commitResult.success) {
      // Check if no changes
      if (commitResult.output?.includes("nothing to commit") ||
          commitResult.output?.includes("No changes to commit")) {
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

    // Check if actually committed (not "nothing to commit" or "No changes")
    if (commitResult.output?.includes("nothing to commit") ||
        commitResult.output?.includes("No changes to commit")) {
      return {
        success: true,
        message: "No changes to commit",
        step: null,
      };
    }

    // Step 4: Push to remote
    console.log(`[commit] Step 4: Pushing to remote...`);
    const pushResult = await vcs.pushUpstream(session.upstreamPath, repoType, undefined, project.newBranch);
    if (!pushResult.success) {
      return {
        success: false,
        message: "Push failed",
        error: pushResult.error || "Push failed",
        step: "push",
      };
    }

    // Step 5: Capture and save impact metrics
    console.log(`[commit] Step 5: Capturing impact metrics...`);
    try {
      const { metrics } = await impactCalculator.calculateImpact(
        sessionId,
        session.upstreamPath,
        session.agentWorkspacePath
      );

      // Get commit hash from the commit result
      const commitHash = commitResult.output?.match(/[a-f0-9]{40}|[a-f0-9]{64}/)?.[0] || "unknown";

      // Save impact record
      impactRepository.save({
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
        fossilUrl: ``, // Will be populated if fossil server is running
      });

      console.log(`[commit] Impact metrics saved for commit ${commitHash.slice(0, 8)}`);
    } catch (error) {
      console.error(`[commit] Failed to capture impact metrics:`, error);
      // Don't fail the commit if impact capture fails
    }

    return {
      success: true,
      message: "Changes committed and pushed successfully!",
      step: null,
    };
  }
}

export const commitService = new CommitService();
