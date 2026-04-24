export interface HelpEntry {
  title: string;
  content: string;
}

export type HelpContent = Record<string, HelpEntry>;

export const defaultHelpContent: HelpContent = {
  "summary-buffer-summary-refresh-btn": {
    title: "Refresh Summary",
    content: "Click to generate a summary of what happened in the chat. The summary captures key topics, decisions, and outcomes.",
  },
  "summary-buffer-summary-analyze-select": {
    title: "Analyze Thread",
    content: "Select which chat thread to analyze for the summary. Each thread represents a different conversation context.",
  },
  "summary-buffer-summary-summarize-select": {
    title: "Summarize via Agent",
    content: "Select which agent model to use for generating the summary. Different models may produce different styles of summaries.",
  },
  "summary-buffer-summarize-via-label": {
    title: "Summarize via",
    content: "Select which chat thread the summarizing agent should use to receive the summary. This thread can be different from the analyzed thread, allowing you to summarize one conversation into another—useful for transferring context between chat threads or consolidating multiple discussions.",
  },
  "summary-buffer-summary-content": {
    title: "Summary Display",
    content: "This area shows the generated summary of the selected chat thread. The summary includes key topics discussed, decisions made, and any important outcomes.",
  },
  "summary-buffer-description": {
    title: "Summary Help",
    content: "The summary helps you remember what happened in the chat. Click Refresh to generate a new summary.",
  },
  "summary-tab-button": {
    title: "Summary Tab",
    content: "Click to view the Summary buffer. The summary helps you remember what happened in the chat.",
  },
  "impact-buffer-impact-refresh-btn-button": {
    title: "Refresh Impact",
    content: "Click to calculate impact metrics for the current session. Impact shows how your changes affect the codebase—including files modified, lines added or removed, complexity changes, duplication detection, and dependency analysis. These metrics are reset after each commit.",
  },
  "impact-buffer-description": {
    title: "Impact Analysis",
    content: "Impact provides signals about how the current session affects the codebase. It tracks file changes, lines of code (added/removed), cyclomatic complexity, code duplication, and dependency changes. Once you commit, these metrics are cleared and archived to the impact history.",
  },
  "impact-stale-badge": {
    title: "Outdated Impact",
    content: "The impact metrics are stale because files have changed since they were last calculated. Click Refresh to update the analysis.",
  },
  "impact-tab-button": {
    title: "Impact Tab",
    content: "Click to view the Impact buffer. Impact shows real-time metrics about how your current changes affect the codebase.",
  },
  "dashboard-stats-projects": {
    title: "Projects Count",
    content: "Shows the total number of projects you have access to. Click to view all projects.",
  },
  "dashboard-stats-sessions": {
    title: "Active Sessions",
    content: "Shows the number of currently active sessions. Active sessions are ones where the agent is connected and working.",
  },
  "login-page-username-input": {
    title: "Username",
    content: "Enter your username to log in to the MIMO platform.",
  },
  "login-page-password-input": {
    title: "Password",
    content: "Enter your password to log in. Your password is never stored or transmitted in plain text.",
  },
  "login-page-button": {
    title: "Login Button",
    content: "Click to authenticate with your username and password.",
  },
};