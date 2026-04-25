import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface Project {
  id: string;
  name: string;
}

interface ImpactRecord {
  id: string;
  sessionId: string;
  sessionName: string;
  projectId: string;
  commitHash: string;
  commitDate: Date;
  files: {
    new: number;
    changed: number;
    deleted: number;
  };
  linesOfCode: {
    added: number;
    removed: number;
    net: number;
  };
  complexity: {
    cyclomatic: number;
    cognitive: number;
    estimatedMinutes: number;
  };
  complexityByLanguage: Array<{
    language: string;
    files: number;
    linesAdded: number;
    linesRemoved: number;
    complexityDelta: number;
  }>;
  fossilUrl: string;
}

interface SessionInfo {
  id: string;
  name: string;
  exists: boolean;
}

interface ImpactHistoryProps {
  project: Project;
  impacts: ImpactRecord[];
  sessions: Map<string, SessionInfo>;
}

export const ImpactHistoryPage: FC<ImpactHistoryProps> = ({
  project,
  impacts,
  sessions,
}) => {
  return (
    <Layout title={`Impact History - ${project.name}`}>
      <div
        class="container"
        style="max-width: 1200px; margin: 0 auto; padding: 20px;"
      >
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div>
            <h1>Impact History</h1>
            <p style="color: #888; margin: 5px 0 0 0;">
              Project: {project.name}
            </p>
          </div>
          <a
            href={`/projects/${project.id}`}
            class="btn-secondary"
            data-help-id="impact-history-page-a"
          >
            Back to Project
          </a>
        </div>

        {impacts.length === 0 ? (
          <div class="empty-state">
            <p>No impact records yet.</p>
            <p style="font-size: 12px; margin-top: 10px;">
              Commit changes in sessions to generate impact records.
            </p>
          </div>
        ) : (
          <div class="impact-table-container">
            <table class="impact-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Commit</th>
                  <th>Files</th>
                  <th>Lines of Code</th>
                  <th>Complexity</th>
                  <th>Est. Time</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {impacts.map((impact) => {
                  const sessionInfo = sessions.get(impact.sessionId);
                  const sessionExists = sessionInfo?.exists ?? false;

                  return (
                    <tr key={impact.id}>
                      <td>
                        {sessionExists ? (
                          <a
                            href={`/projects/${project.id}/sessions/${impact.sessionId}`}
                            target="_blank"
                            class="session-link"
                            data-help-id="impact-history-page-session-link-a"
                          >
                            {impact.sessionName}
                          </a>
                        ) : (
                          <span class="session-deleted">
                            {impact.sessionName}
                            <span class="deleted-badge">(deleted)</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <a
                          href={`/projects/${project.id}/timeline?c=${impact.commitHash}`}
                          target="_blank"
                          class="commit-link"
                          title={impact.commitHash}
                          data-help-id="impact-history-page-commit-link-a"
                        >
                          {impact.commitHash.slice(0, 8)}...
                        </a>
                      </td>
                      <td>
                        <div class="metric-group">
                          <span class="metric-new" title="New files">
                            +{impact.files.new}
                          </span>
                          <span class="metric-changed" title="Changed files">
                            ~{impact.files.changed}
                          </span>
                          <span class="metric-deleted" title="Deleted files">
                            -{impact.files.deleted}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div class="metric-group">
                          <span class="metric-added" title="Lines added">
                            +{impact.linesOfCode.added}
                          </span>
                          <span class="metric-removed" title="Lines removed">
                            -{impact.linesOfCode.removed}
                          </span>
                          <span
                            class={`metric-net ${impact.linesOfCode.net >= 0 ? "positive" : "negative"}`}
                            title="Net change"
                          >
                            ({impact.linesOfCode.net >= 0 ? "+" : ""}
                            {impact.linesOfCode.net})
                          </span>
                        </div>
                      </td>
                      <td>
                        <div class="metric-group">
                          <span title="Cyclomatic complexity">
                            {impact.complexity.cyclomatic > 0 ? "+" : ""}
                            {impact.complexity.cyclomatic} cyc
                          </span>
                        </div>
                      </td>
                      <td>
                        {formatEstimatedTime(
                          impact.complexity.estimatedMinutes,
                        )}
                      </td>
                      <td>
                        <span
                          class="date-cell"
                          title={impact.commitDate.toISOString()}
                        >
                          {formatRelativeDate(impact.commitDate)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #888;
        }
        
        .impact-table-container {
          overflow-x: auto;
        }
        
        .impact-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        
        .impact-table th,
        .impact-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #444;
        }
        
        .impact-table th {
          background: #2d2d2d;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          font-size: 11px;
        }
        
        .impact-table tr:hover td {
          background: #2d2d2d;
        }
        
        .session-link {
          color: #74c0fc;
          text-decoration: none;
        }
        
        .session-link:hover {
          text-decoration: underline;
        }
        
        .session-deleted {
          color: #888;
        }
        
        .deleted-badge {
          margin-left: 6px;
          padding: 2px 6px;
          background: #3d0b0b;
          color: #ff6b6b;
          font-size: 10px;
          border-radius: 3px;
        }
        
        .commit-link {
          color: #74c0fc;
          font-family: monospace;
          text-decoration: none;
        }
        
        .commit-link:hover {
          text-decoration: underline;
        }
        
        .metric-group {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        
        .metric-group span {
          font-family: monospace;
        }
        
        .metric-new {
          color: #74c0fc;
        }
        
        .metric-changed {
          color: #ffd43b;
        }
        
        .metric-deleted {
          color: #ff6b6b;
        }
        
        .metric-added {
          color: #51cf66;
        }
        
        .metric-removed {
          color: #ff6b6b;
        }
        
        .metric-net.positive {
          color: #51cf66;
        }
        
        .metric-net.negative {
          color: #ff6b6b;
        }
        
        .date-cell {
          color: #888;
          font-size: 12px;
        }
      `}</style>
    </Layout>
  );
};

function formatEstimatedTime(minutes: number): string {
  if (minutes < 60) {
    return `~${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `~${hours} hr${hours !== 1 ? "s" : ""}`;
  }
  return `~${hours} hr${hours !== 1 ? "s" : ""} ${mins} min`;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: diffDays > 365 ? "numeric" : undefined,
  });
}
