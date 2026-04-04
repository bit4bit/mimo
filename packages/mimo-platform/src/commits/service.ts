import { vcs } from "../vcs/index.js";
import { sessionRepository } from "../sessions/repository.js";
import { projectRepository } from "../projects/repository.js";

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

    // Step 1: Sync agent-workspace with repo.fossil
    console.log(`[commit] Step 1: Syncing agent-workspace with repo.fossil...`);
    const syncResult = await vcs.fossilUp(session.agentWorkspacePath);
    if (!syncResult.success) {
      return {
        success: false,
        message: "Failed to sync with agent",
        error: syncResult.error || "fossil up failed",
        step: "sync",
      };
    }

    // Step 2: Copy files from agent-workspace to upstream
    console.log(`[commit] Step 2: Copying files to upstream...`);
    const copyResult = await vcs.cleanCopyToUpstream(
      session.agentWorkspacePath,
      session.upstreamPath
    );
    if (!copyResult.success) {
      return {
        success: false,
        message: "Failed to copy files",
        error: copyResult.error || "Copy failed",
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
    const pushResult = await vcs.pushUpstream(session.upstreamPath, repoType);
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
      message: "Changes committed and pushed successfully!",
      step: null,
    };
  }
}

export const commitService = new CommitService();
