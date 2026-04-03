import { join } from "path";
import { vcs, VCSResult } from "../vcs/index.js";
import { sessionRepository } from "../sessions/repository.js";

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
  conflicts?: ConflictInfo[];
  canRetry: boolean;
}

export interface ConflictInfo {
  file: string;
  type: "content" | "delete_modify" | "add_add";
  description: string;
}

export interface CommitHistoryEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export class CommitService {
  async commit(
    sessionId: string,
    message: string
  ): Promise<CommitResult> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      return {
        success: false,
        message: "Session not found",
        hasChanges: false,
        error: "Session not found",
      };
    }

    const checkoutPath = session.checkoutPath;

    // Check for changes first
    const statusResult = await vcs.getStatus(checkoutPath);
    if (!statusResult.success) {
      return {
        success: false,
        message: "Failed to check repository status",
        hasChanges: false,
        error: statusResult.error,
      };
    }

    // Check if there are any changes
    const hasChanges = statusResult.output && statusResult.output.trim().length > 0;
    if (!hasChanges) {
      return {
        success: false,
        message: "No changes to commit",
        hasChanges: false,
      };
    }

    // Commit the changes
    const commitResult = await vcs.commit(checkoutPath, message);
    
    if (!commitResult.success) {
      return {
        success: false,
        message: "Failed to commit changes",
        hasChanges: true,
        error: commitResult.error,
      };
    }

    // Extract commit hash from output
    const hashMatch = commitResult.output?.match(/(\[|\s)([a-f0-9]{10,})/);
    const commitHash = hashMatch ? hashMatch[2] : undefined;

    return {
      success: true,
      commitHash,
      message: `Changes committed successfully${commitHash ? ` (hash: ${commitHash})` : ""}`,
      hasChanges: true,
    };
  }

  async push(sessionId: string): Promise<PushResult> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      return {
        success: false,
        message: "Session not found",
        error: "Session not found",
        canRetry: false,
      };
    }

    const checkoutPath = session.checkoutPath;
    const pushResult = await vcs.sync(checkoutPath, "push");

    if (pushResult.success) {
      return {
        success: true,
        message: "Changes pushed successfully",
        canRetry: false,
      };
    }

    // Analyze error to determine if it's a conflict
    const error = pushResult.error || "";
    const output = pushResult.output || "";

    // Check for various conflict/error types
    const isConflict = 
      error.includes("conflict") ||
      error.includes("rejected") ||
      error.includes("non-fast-forward") ||
      output.includes("conflict") ||
      output.includes("merge failed");

    const isNetworkError = 
      error.includes("network") ||
      error.includes("connection") ||
      error.includes("timeout") ||
      error.includes("unreachable");

    if (isConflict) {
      const conflicts = this.parseConflicts(output + " " + error);
      
      return {
        success: false,
        message: "Push failed due to conflicts",
        error: "Remote repository has conflicting changes. Please pull latest changes and resolve conflicts.",
        conflicts,
        canRetry: true,
      };
    }

    if (isNetworkError) {
      return {
        success: false,
        message: "Network error during push",
        error: "Connection failed. Commit saved locally. Retry push when connection is restored.",
        canRetry: true,
      };
    }

    // Generic error
    return {
      success: false,
      message: "Push failed",
      error: pushResult.error || "Unknown error during push",
      canRetry: true,
    };
  }

  private parseConflicts(errorText: string): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];
    
    // Look for conflict patterns in error output
    const lines = errorText.split("\n");
    
    for (const line of lines) {
      // Content conflict (modified in both)
      const contentMatch = line.match(/(CONFLICT|conflict).*?:\s*(.+)/i);
      if (contentMatch) {
        conflicts.push({
          file: contentMatch[2].trim(),
          type: "content",
          description: "File modified in both local and remote",
        });
        continue;
      }

      // Delete/modify conflict
      const deleteMatch = line.match(/(delete|deleted).*?:\s*(.+)/i);
      if (deleteMatch) {
        conflicts.push({
          file: deleteMatch[2].trim(),
          type: "delete_modify",
          description: "File deleted in one location, modified in other",
        });
        continue;
      }

      // Add/add conflict
      const addMatch = line.match(/(add).*?:\s*(.+)/i);
      if (addMatch) {
        conflicts.push({
          file: addMatch[2].trim(),
          type: "add_add",
          description: "File added with different content",
        });
      }
    }

    return conflicts;
  }

  async getStatus(sessionId: string): Promise<{ success: boolean; output?: string; error?: string }> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      return {
        success: false,
        error: "Session not found",
      };
    }

    const result = await vcs.getStatus(session.checkoutPath);
    return {
      success: result.success,
      output: result.output,
      error: result.error,
    };
  }

  async getCommitHistory(sessionId: string, limit: number = 10): Promise<{ success: boolean; history?: CommitHistoryEntry[]; error?: string }> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      return {
        success: false,
        error: "Session not found",
      };
    }

    const result = await vcs.getCommitHistory(session.checkoutPath, limit);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    // Parse timeline output
    const history: CommitHistoryEntry[] = [];
    const lines = result.output?.split("\n") || [];
    
    // Fossil timeline format: [hash] YYYY-MM-DD HH:MM:SS message (user)
    for (const line of lines) {
      const match = line.match(/\[([a-f0-9]+)\]\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+(.+?)\s+\((.+?)\)/);
      if (match) {
        history.push({
          hash: match[1],
          date: match[2],
          message: match[3].trim(),
          author: match[4],
        });
      }
    }

    return {
      success: true,
      history,
    };
  }

  async commitAndPush(sessionId: string, message: string): Promise<{ commit: CommitResult; push: PushResult }> {
    const commitResult = await this.commit(sessionId, message);
    
    if (!commitResult.success) {
      return {
        commit: commitResult,
        push: {
          success: false,
          message: "Commit failed, push skipped",
          canRetry: false,
        },
      };
    }

    const pushResult = await this.push(sessionId);
    
    return {
      commit: commitResult,
      push: pushResult,
    };
  }
}

export const commitService = new CommitService();
