/**
 * Patch preview parser for commit modal change tree.
 * Extracts file-level status and modified-file hunks from unified diff patches.
 */

export type FileStatus = "added" | "modified" | "deleted";

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

export interface FileChange {
  path: string;
  status: FileStatus;
  isBinary: boolean;
  hunks?: DiffHunk[];
  oldMode?: string;
  newMode?: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  status?: FileStatus;
  isBinary?: boolean;
  children?: TreeNode[];
}

export interface PatchPreview {
  summary: {
    added: number;
    modified: number;
    deleted: number;
    binary: number;
  };
  files: FileChange[];
  tree: TreeNode[];
}

/**
 * Parse a unified diff patch and extract file changes with status and hunks.
 */
export function parsePatchPreview(patch: string): PatchPreview {
  const files: FileChange[] = [];
  const lines = patch.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Look for diff --git header
    if (line.startsWith("diff --git")) {
      const result = parseFileDiff(lines, i);
      if (result.file) {
        files.push(result.file);
      }
      i = result.nextIndex;
      continue;
    }

    i++;
  }

  // Build tree from file paths
  const tree = buildTreeFromFiles(files);

  // Calculate summary
  const summary = {
    added: files.filter((f) => f.status === "added").length,
    modified: files.filter((f) => f.status === "modified").length,
    deleted: files.filter((f) => f.status === "deleted").length,
    binary: files.filter((f) => f.isBinary).length,
  };

  return {
    summary,
    files,
    tree,
  };
}

/**
 * Parse a single file diff starting at the given index.
 * Returns the parsed file and the next index to continue from.
 */
function parseFileDiff(
  lines: string[],
  startIndex: number,
): { file: FileChange | null; nextIndex: number } {
  const headerLine = lines[startIndex];
  const match = headerLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (!match) {
    return { file: null, nextIndex: startIndex + 1 };
  }

  const oldPath = match[1];
  const newPath = match[2];

  let i = startIndex + 1;
  let status: FileStatus = "modified";
  let isBinary = false;
  let oldMode: string | undefined;
  let newMode: string | undefined;
  const hunks: DiffHunk[] = [];

  // Parse header lines until we hit hunk or next diff
  while (i < lines.length) {
    const line = lines[i];

    // Check for next diff - stop parsing this file
    if (line.startsWith("diff --git")) {
      break;
    }

    // Handle deleted file
    if (line.startsWith("deleted file mode")) {
      status = "deleted";
      i++;
      continue;
    }

    // Handle new file
    if (line.startsWith("new file mode")) {
      status = "added";
      const modeMatch = line.match(/new file mode (\d+)/);
      if (modeMatch) {
        newMode = modeMatch[1];
      }
      i++;
      continue;
    }

    // Handle mode change
    if (line.startsWith("old mode ")) {
      const oldMatch = line.match(/old mode (\d+)/);
      if (oldMatch) {
        oldMode = oldMatch[1];
      }
      i++;
      continue;
    }

    if (line.startsWith("new mode ")) {
      const newMatch = line.match(/new mode (\d+)/);
      if (newMatch) {
        newMode = newMatch[1];
      }
      i++;
      continue;
    }

    // Handle index line
    if (line.startsWith("index ")) {
      i++;
      continue;
    }

    // Handle rename detection
    if (line.startsWith("rename from ") || line.startsWith("rename to ")) {
      i++;
      continue;
    }

    if (line.startsWith("similarity index ")) {
      i++;
      continue;
    }

    // Handle binary files
    if (line.startsWith("Binary files ")) {
      isBinary = true;
      i++;
      continue;
    }

    if (line.startsWith("GIT binary patch")) {
      isBinary = true;
      // Skip until next diff or end
      i++;
      while (i < lines.length && !lines[i].startsWith("diff --git")) {
        i++;
      }
      break;
    }

    // Handle "No newline at end of file" markers
    if (line.startsWith("\\ ")) {
      // Add to current hunk if exists
      if (hunks.length > 0) {
        hunks[hunks.length - 1].lines.push(line);
      }
      i++;
      continue;
    }

    // Parse hunk header
    if (line.startsWith("@@")) {
      const hunkResult = parseHunk(lines, i);
      if (hunkResult.hunk) {
        hunks.push(hunkResult.hunk);
      }
      i = hunkResult.nextIndex;
      continue;
    }

    i++;
  }

  // Determine the file path
  // For deleted files, use oldPath; for added, use newPath; otherwise newPath
  const path = status === "deleted" ? oldPath : newPath;

  // If it's a rename, treat it as modified for v1 (per design decision)
  // The file appears as deleted + added in patch format

  return {
    file: {
      path,
      status,
      isBinary,
      hunks: hunks.length > 0 ? hunks : undefined,
      oldMode,
      newMode,
    },
    nextIndex: i,
  };
}

/**
 * Parse a hunk starting at the given index.
 * Returns the parsed hunk and the next index to continue from.
 */
function parseHunk(
  lines: string[],
  startIndex: number,
): { hunk: DiffHunk | null; nextIndex: number } {
  const headerLine = lines[startIndex];
  const match = headerLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (!match) {
    return { hunk: null, nextIndex: startIndex + 1 };
  }

  const oldStart = parseInt(match[1], 10);
  const oldCount = match[2] ? parseInt(match[2], 10) : 1;
  const newStart = parseInt(match[3], 10);
  const newCount = match[4] ? parseInt(match[4], 10) : 1;

  const hunkLines: string[] = [headerLine];
  let i = startIndex + 1;

  while (i < lines.length) {
    const line = lines[i];

    // Stop at next hunk or next file
    if (line.startsWith("@@") || line.startsWith("diff --git")) {
      break;
    }

    hunkLines.push(line);
    i++;
  }

  return {
    hunk: {
      oldStart,
      oldCount,
      newStart,
      newCount,
      lines: hunkLines,
    },
    nextIndex: i,
  };
}

/**
 * Build a tree structure from file paths.
 */
export function buildTreeFromFiles(files: FileChange[]): TreeNode[] {
  // Use a nested map structure: path -> { node, children: Map }
  interface TreeNodeInternal {
    node: TreeNode;
    children: Map<string, TreeNodeInternal>;
  }

  const root: Map<string, TreeNodeInternal> = new Map();

  for (const file of files) {
    const parts = file.path.split("/");
    let currentPath = "";
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!currentLevel.has(part)) {
        const node: TreeNode = {
          name: part,
          path: currentPath,
          type: isLast ? "file" : "directory",
        };

        if (isLast) {
          node.status = file.status;
          node.isBinary = file.isBinary;
        }

        currentLevel.set(part, {
          node,
          children: new Map(),
        });
      }

      const internalNode = currentLevel.get(part)!;

      if (!isLast) {
        currentLevel = internalNode.children;
      }
    }
  }

  // Convert internal structure to TreeNode arrays recursively
  function convertToTreeNodes(
    level: Map<string, TreeNodeInternal>,
  ): TreeNode[] {
    const result: TreeNode[] = [];

    for (const [_, internal] of level) {
      const node: TreeNode = { ...internal.node };
      if (internal.children.size > 0) {
        node.children = convertToTreeNodes(internal.children);
      }
      result.push(node);
    }

    // Sort: directories first, then alphabetically
    result.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return result;
  }

  return convertToTreeNodes(root);
}

/**
 * Sort tree nodes: directories first, then files, both alphabetically.
 */
function sortTreeNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    // Directories come before files
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  // Recursively sort children
  for (const node of nodes) {
    if (node.children) {
      sortTreeNodes(node.children);
    }
  }
}

/**
 * Filter a patch to include only selected file paths.
 */
export function filterPatchByPaths(
  patch: string,
  selectedPaths: string[],
): string {
  if (selectedPaths.length === 0) {
    return "";
  }

  const selectedSet = new Set(selectedPaths);
  const lines = patch.split("\n");
  const result: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("diff --git")) {
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (match) {
        const oldPath = match[1];
        const newPath = match[2];

        // Find the file path for this diff
        // Look ahead to determine if it's a deleted file
        let j = i + 1;
        let isDeleted = false;
        while (j < lines.length && !lines[j].startsWith("diff --git")) {
          if (lines[j].startsWith("deleted file mode")) {
            isDeleted = true;
            break;
          }
          j++;
        }

        const filePath = isDeleted ? oldPath : newPath;

        // Collect this entire file diff
        const fileDiffStart = i;
        let fileDiffEnd = i + 1;
        while (
          fileDiffEnd < lines.length &&
          !lines[fileDiffEnd].startsWith("diff --git")
        ) {
          fileDiffEnd++;
        }

        // Include if path is selected
        if (selectedSet.has(filePath)) {
          result.push(...lines.slice(fileDiffStart, fileDiffEnd));
        }

        i = fileDiffEnd;
        continue;
      }
    }

    i++;
  }

  const joined = result.join("\n");
  // Ensure the patch ends with a newline. When the last selected file is not
  // the last file in the original patch, the slice does not include the empty
  // trailing element that produces the final \n, so we add it back here.
  // git apply requires every line (including the last) to be newline-terminated.
  return joined.length > 0 && !joined.endsWith("\n") ? joined + "\n" : joined;
}

/**
 * Get all file paths from a parsed preview.
 */
export function getAllFilePaths(preview: PatchPreview): string[] {
  return preview.files.map((f) => f.path);
}

/**
 * Validate that all selected paths exist in the preview.
 * Returns invalid paths, or empty array if all valid.
 */
export function validateSelectedPaths(
  preview: PatchPreview,
  selectedPaths: string[],
): string[] {
  const validPaths = new Set(preview.files.map((f) => f.path));
  return selectedPaths.filter((p) => !validPaths.has(p));
}
