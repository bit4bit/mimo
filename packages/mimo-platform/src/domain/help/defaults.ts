// SPDX-License-Identifier: AGPL-3.0-only
export interface HelpEntry {
  title: string;
  content: string;
}

export type HelpContent = Record<string, HelpEntry>;

export const defaultHelpContent: HelpContent = {
  "summary-buffer-summary-refresh-btn": {
    title: "Refresh Summary",
    content:
      "Click to generate a summary of what happened in the chat. The summary captures key topics, decisions, and outcomes.",
  },
  "summary-buffer-summary-analyze-select": {
    title: "Analyze Thread",
    content:
      "Select which chat thread to analyze for the summary. Each thread represents a different conversation context.",
  },
  "summary-buffer-summary-summarize-select": {
    title: "Summarize via Agent",
    content:
      "Select which agent model to use for generating the summary. Different models may produce different styles of summaries.",
  },
  "summary-buffer-summarize-via-label": {
    title: "Summarize via",
    content:
      "Select which chat thread the summarizing agent should use to receive the summary. This thread can be different from the analyzed thread, allowing you to summarize one conversation into another—useful for transferring context between chat threads or consolidating multiple discussions.",
  },
  "summary-buffer-summary-content": {
    title: "Summary Display",
    content:
      "This area shows the generated summary of the selected chat thread. The summary includes key topics discussed, decisions made, and any important outcomes.",
  },
  "summary-buffer-description": {
    title: "Summary Help",
    content:
      "The summary helps you remember what happened in the chat. Click Refresh to generate a new summary.",
  },
  "summary-tab-button": {
    title: "Summary Tab",
    content:
      "Click to view the Summary buffer. The summary helps you remember what happened in the chat.",
  },
  "impact-buffer-impact-refresh-btn-button": {
    title: "Refresh Impact",
    content:
      "Click to calculate impact metrics for the current session. Impact shows how your changes affect the codebase—including files modified, lines added or removed, complexity changes, duplication detection, and dependency analysis. These metrics are reset after each commit.",
  },
  "impact-buffer-description": {
    title: "Impact Analysis",
    content:
      "Impact provides signals about how the current session affects the codebase. It tracks file changes, lines of code (added/removed), cyclomatic complexity, code duplication, and dependency changes. Once you commit, these metrics are cleared and archived to the impact history.",
  },
  "impact-stale-badge": {
    title: "Outdated Impact",
    content:
      "The impact metrics are stale because files have changed since they were last calculated. Click Refresh to update the analysis.",
  },
  "impact-tab-button": {
    title: "Impact Tab",
    content:
      "Click to view the Impact buffer. Impact shows real-time metrics about how your current changes affect the codebase.",
  },
  "dashboard-stats-projects": {
    title: "Projects Count",
    content:
      "Shows the total number of projects you have access to. Click to view all projects.",
  },
  "dashboard-stats-sessions": {
    title: "Active Sessions",
    content:
      "Shows the number of currently active sessions. Active sessions are ones where the agent is connected and working.",
  },
  "login-page-username-input": {
    title: "Username",
    content: "Enter your username to log in to the MIMO platform.",
  },
  "login-page-password-input": {
    title: "Password",
    content:
      "Enter your password to log in. Your password is never stored or transmitted in plain text.",
  },
  "login-page-button": {
    title: "Login Button",
    content: "Click to authenticate with your username and password.",
  },
  "file-tree-tab-button": {
    title: "Files Tab",
    content:
      "Click to view the FileTree buffer. The FileTree shows the session workspace as a collapsible directory tree and highlights files that have changed (added or modified) in this session.",
  },
  "file-tree-buffer-refresh-btn-button": {
    title: "Refresh File Tree",
    content:
      "Click to re-fetch the file list and changed-files list from the server and rebuild the tree. The tree also refreshes automatically when you switch back to the Files tab.",
  },
  "file-tree-root": {
    title: "File Tree",
    content:
      "The workspace directory tree. Directories collapse by default except the ancestors of changed files, which auto-expand so changed-file highlights stay visible. Click a directory to toggle it; click a file to open it in the Edit or Patch buffer.",
  },
  "file-tree-dir": {
    title: "Directory",
    content:
      "Click to expand or collapse this directory. Directories with changed descendants expand automatically on refresh.",
  },
  "file-tree-leaf": {
    title: "File",
    content:
      "Click to open this file. Added and unchanged files open in the Edit buffer; modified files open in the Patch buffer with the diff visible. Deleted files are not shown.",
  },
  "review-tab-button": {
    title: "Review Tab",
    content:
      "Click to view the Review buffer. The Review buffer shows a GitHub-style review of all agent work in this session: a tree of changed files (added, modified, and deleted) on the left and a unified diff of the selected file on the right. The compare bar shows the initial project branch state on the left and the current session branch on the right.",
  },
  "review-buffer-compare": {
    title: "Compare Range",
    content:
      "Shows the review comparison like a GitHub compare view: the left ref is the initial project-branch state the session started from, and the right ref is the current session branch. The diff below covers everything between those two states.",
  },
  "review-buffer-refresh-btn-button": {
    title: "Refresh Review",
    content:
      "Click to re-fetch the changed-file list and rebuild the tree. The Review buffer does not refresh automatically — use this button when the agent has committed new work and you want to see the updated diff.",
  },
  "review-buffer-tree-pane": {
    title: "Changed-File Tree",
    content:
      "A tree of only the files the agent changed (added, modified, or deleted), grouped by directory with + / ~ / - status badges. Deleted files appear here even though they are gone from the working tree. Directories start collapsed except the ancestors of changed files. Click a file to view its diff on the right.",
  },
  "review-buffer-diff-pane": {
    title: "Unified Diff",
    content:
      "Shows the unified diff for the file selected in the tree, with +/- line highlighting and the change-navigation overview track. Binary files show a placeholder instead of a diff. When no file is selected, an empty-state message is shown.",
  },
  "review-tree-root": {
    title: "Review Tree",
    content:
      "The changed-file tree for this session. Click a directory to expand or collapse it; click a file to load its diff in the right pane.",
  },
  "review-tree-dir": {
    title: "Directory",
    content:
      "Click to expand or collapse this directory. Directories with changed descendants expand automatically on refresh.",
  },
  "review-tree-leaf": {
    title: "Changed File",
    content:
      "Click to view this file's unified diff on the right. The status badge shows whether the file was added (+), modified (~), or deleted (-).",
  },
  "layout-pinned-menu-btn": {
    title: "Pinned Sessions",
    content:
      "Click to open the pinned-sessions drawer. The drawer lists every session you've pinned (up to 5), showing the session title and branch. Click an entry to jump to that session, or click \"View all in parallel\" to open the /pinned page with one iframe per pinned session.",
  },
  "pinned-sessions-drawer-close": {
    title: "Close Drawer",
    content:
      "Click here (or press Escape, or click outside the drawer) to close the pinned-sessions drawer without navigating.",
  },
  "pinned-sessions-drawer-parallel": {
    title: "View selected in parallel",
    content:
      "Opens /pinned with only the drawer entries whose selection checkboxes are checked (default all checked). Each selected session renders in its own side-by-side iframe so you can watch or interact with several sessions at once. Toggle checkboxes to choose which sessions to include; the action label shows the current count.",
  },
  "session-detail-page-pin-checkbox": {
    title: "Pin Session",
    content:
      "Check this box to add the current session to your pinned list (capped at 5). Pinned sessions appear in the side-menu drawer and the /pinned parallel view. Re-checking an already-pinned session moves it to the top of the list. If the cap is reached, an inline error is shown.",
  },
  "pinned-parallel-column-iframe": {
    title: "Active Column Indicator",
    content:
      "The highlighted column is the one whose iframe currently holds keyboard focus. Click into another column to move focus; keybindings apply only to the focused session.",
  },
  "pinned-parallel-column-unpin": {
    title: "Unpin Column",
    content:
      "Remove this session from your pinned list. The column is removed from the parallel view immediately.",
  },
  "pinned-parallel-group-chips": {
    title: "Filter by Group",
    content:
      "Click a group chip to filter the parallel view to only the pinned sessions in that group. The 'All' chip clears the filter. The chip set is derived from your current pin list; a group disappears when you remove its last pin. The selected group is encoded in the URL (?group=<name>) so back/forward and shared links work.",
  },
  "session-detail-page-pin-group-picker": {
    title: "Pin Groups",
    content:
      "When the session is pinned, each chip is a group this session belongs to. Click × to remove the session from that group. Click '+ add group' to pin this session under another group, typing either a new name or selecting one of your existing groups. Removing the last chip unpins the session. The 5-entry pin cap counts all group rows for the session.",
  },
};
