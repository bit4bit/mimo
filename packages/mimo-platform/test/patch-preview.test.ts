// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "bun:test";
import {
  parsePatchPreview,
  buildTreeFromFiles,
  filterPatchByPaths,
  validateSelectedPaths,
} from "../src/commits/patch-preview.js";
import type { FileChange } from "../src/commits/patch-preview.js";

describe("Patch Preview Parser", () => {
  describe("1.4 Added/Modified/Deleted Parsing", () => {
    it("should parse added files correctly", () => {
      const patch = `diff --git a/new-file.txt b/new-file.txt
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/new-file.txt
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3
`;

      const result = parsePatchPreview(patch);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe("new-file.txt");
      expect(result.files[0].status).toBe("added");
      expect(result.files[0].isBinary).toBe(false);
      expect(result.summary.added).toBe(1);
      expect(result.summary.modified).toBe(0);
      expect(result.summary.deleted).toBe(0);
    });

    it("should parse modified files correctly", () => {
      const patch = `diff --git a/existing-file.txt b/existing-file.txt
index 1234567..abcdefg 100644
--- a/existing-file.txt
+++ b/existing-file.txt
@@ -1,3 +1,4 @@
 line 1
-line 2
+line 2 modified
 line 3
+line 4
`;

      const result = parsePatchPreview(patch);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe("existing-file.txt");
      expect(result.files[0].status).toBe("modified");
      expect(result.files[0].isBinary).toBe(false);
      expect(result.summary.added).toBe(0);
      expect(result.summary.modified).toBe(1);
      expect(result.summary.deleted).toBe(0);
    });

    it("should parse deleted files correctly", () => {
      const patch = `diff --git a/deleted-file.txt b/deleted-file.txt
deleted file mode 100644
index 1234567..0000000
--- a/deleted-file.txt
+++ /dev/null
@@ -1,3 +0,0 @@
-line 1
-line 2
-line 3
`;

      const result = parsePatchPreview(patch);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe("deleted-file.txt");
      expect(result.files[0].status).toBe("deleted");
      expect(result.files[0].isBinary).toBe(false);
      expect(result.summary.added).toBe(0);
      expect(result.summary.modified).toBe(0);
      expect(result.summary.deleted).toBe(1);
    });

    it("should parse multiple files with mixed statuses", () => {
      const patch = `diff --git a/added.txt b/added.txt
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/added.txt
@@ -0,0 +1,2 @@
+new line 1
+new line 2

diff --git a/modified.txt b/modified.txt
index 1234567..abcdefg 100644
--- a/modified.txt
+++ b/modified.txt
@@ -1,2 +1,3 @@
 line 1
-line 2
+modified line 2
+line 3

diff --git a/deleted.txt b/deleted.txt
deleted file mode 100644
index 1234567..0000000
--- a/deleted.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-old line 1
-old line 2
`;

      const result = parsePatchPreview(patch);

      expect(result.files).toHaveLength(3);
      expect(result.summary.added).toBe(1);
      expect(result.summary.modified).toBe(1);
      expect(result.summary.deleted).toBe(1);

      const added = result.files.find((f) => f.path === "added.txt");
      const modified = result.files.find((f) => f.path === "modified.txt");
      const deleted = result.files.find((f) => f.path === "deleted.txt");

      expect(added?.status).toBe("added");
      expect(modified?.status).toBe("modified");
      expect(deleted?.status).toBe("deleted");
    });

    it("should extract diff hunks for modified files", () => {
      const patch = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,6 @@
 context line 1
 context line 2
-removed line
+added line 1
+added line 2
 context line 3
 context line 4
`;

      const result = parsePatchPreview(patch);

      expect(result.files[0].hunks).toBeDefined();
      expect(result.files[0].hunks).toHaveLength(1);
      expect(result.files[0].hunks![0].oldStart).toBe(1);
      expect(result.files[0].hunks![0].oldCount).toBe(5);
      expect(result.files[0].hunks![0].newStart).toBe(1);
      expect(result.files[0].hunks![0].newCount).toBe(6);
      expect(result.files[0].hunks![0].lines.length).toBeGreaterThan(0);
    });

    it("should parse multiple hunks in a file", () => {
      const patch = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 line 1
-line 2
+modified line 2
 line 3
@@ -10,3 +10,4 @@
 line 10
 line 11
+inserted line
 line 12
`;

      const result = parsePatchPreview(patch);

      expect(result.files[0].hunks).toHaveLength(2);
      expect(result.files[0].hunks![0].oldStart).toBe(1);
      expect(result.files[0].hunks![1].oldStart).toBe(10);
    });
  });

  describe("1.5 Binary File Handling", () => {
    it("should parse binary file changes", () => {
      const patch = `diff --git a/image.png b/image.png
index 1234567..abcdefg 100644
Binary files a/image.png and b/image.png differ
`;

      const result = parsePatchPreview(patch);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe("image.png");
      expect(result.files[0].status).toBe("modified");
      expect(result.files[0].isBinary).toBe(true);
      expect(result.files[0].hunks).toBeUndefined();
      expect(result.summary.binary).toBe(1);
    });

    it("should handle GIT binary patch format", () => {
      const patch = `diff --git a/binary.bin b/binary.bin
index 1234567..abcdefg 100644
GIT binary patch
delta 123
some-binary-content
more-binary-content

`;

      const result = parsePatchPreview(patch);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe("binary.bin");
      expect(result.files[0].isBinary).toBe(true);
    });

    it("should handle new binary files", () => {
      const patch = `diff --git a/new-image.jpg b/new-image.jpg
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/new-image.jpg differ
`;

      const result = parsePatchPreview(patch);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe("new-image.jpg");
      expect(result.files[0].status).toBe("added");
      expect(result.files[0].isBinary).toBe(true);
    });

    it("should handle deleted binary files", () => {
      const patch = `diff --git a/old-image.gif b/old-image.gif
deleted file mode 100644
index 1234567..0000000
Binary files a/old-image.gif and /dev/null differ
`;

      const result = parsePatchPreview(patch);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe("old-image.gif");
      expect(result.files[0].status).toBe("deleted");
      expect(result.files[0].isBinary).toBe(true);
    });
  });

  describe("1.2 Tree Building", () => {
    it("should build tree from flat file paths", () => {
      const files: FileChange[] = [
        { path: "src/main.ts", status: "modified", isBinary: false },
        { path: "src/utils/helper.ts", status: "added", isBinary: false },
        { path: "README.md", status: "modified", isBinary: false },
      ];

      const tree = buildTreeFromFiles(files);

      expect(tree).toHaveLength(2);
      // Directories should come first
      expect(tree[0].name).toBe("src");
      expect(tree[0].type).toBe("directory");
      expect(tree[0].children).toHaveLength(2);

      expect(tree[1].name).toBe("README.md");
      expect(tree[1].type).toBe("file");
    });

    it("should handle nested directories", () => {
      const files: FileChange[] = [
        {
          path: "src/components/modals/dialog.tsx",
          status: "added",
          isBinary: false,
        },
        {
          path: "src/components/buttons/Button.tsx",
          status: "modified",
          isBinary: false,
        },
        { path: "src/utils/date.ts", status: "deleted", isBinary: false },
      ];

      const tree = buildTreeFromFiles(files);

      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe("src");
      expect(tree[0].children).toHaveLength(2);

      const components = tree[0].children?.find((n) => n.name === "components");
      expect(components).toBeDefined();
      expect(components?.children).toHaveLength(2);
    });

    it("should sort directories before files alphabetically", () => {
      const files: FileChange[] = [
        { path: "zebra.txt", status: "modified", isBinary: false },
        { path: "alpha.txt", status: "added", isBinary: false },
        { path: "delta/nested.txt", status: "modified", isBinary: false },
        { path: "beta/file.txt", status: "added", isBinary: false },
      ];

      const tree = buildTreeFromFiles(files);

      // Directories first, sorted alphabetically
      expect(tree[0].name).toBe("beta");
      expect(tree[1].name).toBe("delta");
      // Files next, sorted alphabetically
      expect(tree[2].name).toBe("alpha.txt");
      expect(tree[3].name).toBe("zebra.txt");
    });

    it("should preserve file status in tree nodes", () => {
      const files: FileChange[] = [
        { path: "added.txt", status: "added", isBinary: false },
        { path: "modified.txt", status: "modified", isBinary: true },
        { path: "deleted.txt", status: "deleted", isBinary: false },
      ];

      const tree = buildTreeFromFiles(files);

      expect(tree.find((n) => n.name === "added.txt")?.status).toBe("added");
      expect(tree.find((n) => n.name === "modified.txt")?.status).toBe(
        "modified",
      );
      expect(tree.find((n) => n.name === "modified.txt")?.isBinary).toBe(true);
      expect(tree.find((n) => n.name === "deleted.txt")?.status).toBe(
        "deleted",
      );
    });
  });

  describe("Patch Filtering", () => {
    it("should filter patch by selected paths", () => {
      const patch = `diff --git a/file1.txt b/file1.txt
index 1234567..abcdefg 100644
--- a/file1.txt
+++ b/file1.txt
@@ -1,2 +1,2 @@
 line 1
-line 2
+modified line 2

diff --git a/file2.txt b/file2.txt
index 1234567..abcdefg 100644
--- a/file2.txt
+++ b/file2.txt
@@ -1,2 +1,2 @@
 line 1
-line 2
+modified line 2

diff --git a/file3.txt b/file3.txt
index 1234567..abcdefg 100644
--- a/file3.txt
+++ b/file3.txt
@@ -1,2 +1,2 @@
 line 1
-line 2
+modified line 2
`;

      const filtered = filterPatchByPaths(patch, ["file1.txt", "file3.txt"]);

      expect(filtered).toContain("file1.txt");
      expect(filtered).toContain("file3.txt");
      expect(filtered).not.toContain("file2.txt");
    });

    it("should return empty string when no paths selected", () => {
      const patch = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
`;

      const filtered = filterPatchByPaths(patch, []);

      expect(filtered).toBe("");
    });

    it("should preserve trailing newline when selected file is not last in original patch", () => {
      // Regression: filterPatchByPaths dropped the trailing \n when the last
      // selected file was not the last file in the original patch, causing
      // git apply to report "corrupt patch at line N".
      const patch = `diff --git a/first.md b/first.md
new file mode 100644
--- /dev/null
+++ b/first.md
@@ -0,0 +1,1 @@
+content
diff --git a/second.md b/second.md
new file mode 100644
--- /dev/null
+++ b/second.md
@@ -0,0 +1,1 @@
+content
`;

      // Select only first.md (not last in original patch)
      const filtered = filterPatchByPaths(patch, ["first.md"]);

      expect(filtered).toContain("first.md");
      expect(filtered).not.toContain("second.md");
      expect(filtered.endsWith("\n")).toBe(true);
    });
  });

  describe("Path Validation", () => {
    it("should return empty array for valid selected paths", () => {
      const preview = parsePatchPreview(`diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-old
+new
`);

      const invalid = validateSelectedPaths(preview, ["file.txt"]);

      expect(invalid).toHaveLength(0);
    });

    it("should return invalid paths not in preview", () => {
      const preview = parsePatchPreview(`diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-old
+new
`);

      const invalid = validateSelectedPaths(preview, [
        "file.txt",
        "nonexistent.txt",
        "also-not-there.js",
      ]);

      expect(invalid).toHaveLength(2);
      expect(invalid).toContain("nonexistent.txt");
      expect(invalid).toContain("also-not-there.js");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty patch", () => {
      const result = parsePatchPreview("");

      expect(result.files).toHaveLength(0);
      expect(result.tree).toHaveLength(0);
      expect(result.summary).toEqual({
        added: 0,
        modified: 0,
        deleted: 0,
        binary: 0,
      });
    });

    it("should handle mode-only changes", () => {
      const patch = `diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
`;

      const result = parsePatchPreview(patch);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe("script.sh");
      expect(result.files[0].oldMode).toBe("100644");
      expect(result.files[0].newMode).toBe("100755");
    });

    it("should handle 'No newline at end of file' marker", () => {
      const patch = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
 line 1
-line 2
\\ No newline at end of file
+line 2 modified
+line 3
`;

      const result = parsePatchPreview(patch);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].hunks![0].lines).toContain(
        "\\ No newline at end of file",
      );
    });
  });
});
