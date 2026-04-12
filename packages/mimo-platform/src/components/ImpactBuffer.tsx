import type { FC } from "hono/jsx";

interface ImpactMetrics {
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
  byLanguage: Array<{
    language: string;
    files: number;
    linesAdded: number;
    linesRemoved: number;
    complexityDelta: number;
  }>;
}

interface ImpactTrend {
  files: { new: string; changed: string; deleted: string };
  linesOfCode: { added: string; removed: string; net: string };
  complexity: { cyclomatic: string; cognitive: string };
}

interface ImpactBufferProps {
  sessionId: string;
  metrics?: ImpactMetrics;
  trends?: ImpactTrend;
  sccInstalled?: boolean;
  sccError?: string;
}

export const ImpactBuffer: FC<ImpactBufferProps> = ({
  sessionId,
  metrics,
  trends,
  sccInstalled = true,
  sccError,
}) => {
  const hasMetrics = metrics !== undefined;

  return (
    <div class="buffer buffer-right" id="impact-buffer" data-session-id={sessionId}>
      <div class="buffer-header">
        <span>Impact</span>
        <div style="display: inline-flex; align-items: center; gap: 8px; float: right;">
          <span id="impact-stale-badge" class="impact-stale-badge" style="display: none;">⚠ Outdated</span>
          <span id="impact-calculating-badge" class="impact-calculating-badge" style="display: none;">⏳ Analyzing...</span>
          <button id="impact-refresh-btn" type="button" class="btn-small">Refresh</button>
        </div>
      </div>
      <div class="buffer-content" id="impact-content">
        {/* SCC Warning */}
        {!sccInstalled && (
          <div class="impact-warning">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span class="warning-icon">⚠️</span>
              <span class="warning-text">
                {sccError || "scc not installed - complexity metrics unavailable"}
              </span>
            </div>
            <div style="font-size: 11px; color: #888; padding-left: 24px;">
              Install scc from <a href="https://github.com/boyter/scc" target="_blank" style="color: #6ea8fe;">github.com/boyter/scc</a> and place the binary at: ~/.mimo/bin/scc
            </div>
          </div>
        )}

        {hasMetrics ? (
          <>
            {/* Files Section */}
            <div class="impact-section">
              <div class="impact-section-title">Files</div>
              <div class="impact-metric">
                <span class="impact-metric-label">New:</span>
                <span class="impact-metric-value">{metrics.files.new}</span>
                <span class={"impact-trend impact-trend-" + getTrendClass(trends?.files?.new)}>
                  {trends?.files?.new || "→"}
                </span>
              </div>
              <div class="impact-metric">
                <span class="impact-metric-label">Changed:</span>
                <span class="impact-metric-value">{metrics.files.changed}</span>
                <span class={"impact-trend impact-trend-" + getTrendClass(trends?.files?.changed)}>
                  {trends?.files?.changed || "→"}
                </span>
              </div>
              <div class="impact-metric">
                <span class="impact-metric-label">Deleted:</span>
                <span class="impact-metric-value">{metrics.files.deleted}</span>
                <span class={"impact-trend impact-trend-" + getTrendClass(trends?.files?.deleted)}>
                  {trends?.files?.deleted || "→"}
                </span>
              </div>
            </div>

            {/* Lines of Code Section */}
            <div class="impact-section">
              <div class="impact-section-title">Lines of Code</div>
              <div class="impact-metric">
                <span class="impact-metric-label">Added:</span>
                <span class="impact-metric-value">+{metrics.linesOfCode.added}</span>
                <span class={"impact-trend impact-trend-" + getTrendClass(trends?.linesOfCode?.added)}>
                  {trends?.linesOfCode?.added || "→"}
                </span>
              </div>
              <div class="impact-metric">
                <span class="impact-metric-label">Removed:</span>
                <span class="impact-metric-value">-{metrics.linesOfCode.removed}</span>
                <span class={"impact-trend impact-trend-" + getTrendClass(trends?.linesOfCode?.removed)}>
                  {trends?.linesOfCode?.removed || "→"}
                </span>
              </div>
              <div class="impact-metric">
                <span class="impact-metric-label">Net:</span>
                <span
                  class={`impact-metric-value ${metrics.linesOfCode.net >= 0 ? "positive" : "negative"}`}
                >
                  {metrics.linesOfCode.net >= 0 ? `+${metrics.linesOfCode.net}` : metrics.linesOfCode.net}
                </span>
                <span class={"impact-trend impact-trend-" + getTrendClass(trends?.linesOfCode?.net)}>
                  {trends?.linesOfCode?.net || "→"}
                </span>
              </div>
            </div>

            {/* Complexity Section - Only if scc is installed */}
            {sccInstalled && (
              <div class="impact-section">
                <div class="impact-section-title">Complexity</div>
                <div class="impact-metric">
                  <span class="impact-metric-label">Cyclomatic:</span>
                  <span class="impact-metric-value">{formatComplexityDelta(metrics.complexity.cyclomatic)}</span>
                  <span class={"impact-trend impact-trend-" + getTrendClass(trends?.complexity?.cyclomatic)}>
                    {trends?.complexity?.cyclomatic || "→"}
                  </span>
                </div>
                <div class="impact-metric">
                  <span class="impact-metric-label">Cognitive:</span>
                  <span class="impact-metric-value">{formatComplexityDelta(metrics.complexity.cognitive)}</span>
                  <span class={"impact-trend impact-trend-" + getTrendClass(trends?.complexity?.cognitive)}>
                    {trends?.complexity?.cognitive || "→"}
                  </span>
                </div>
                <div class="impact-metric">
                  <span class="impact-metric-label">Est. Time:</span>
                  <span class="impact-metric-value">
                    {formatEstimatedTime(metrics.complexity.estimatedMinutes)}
                  </span>
                </div>
              </div>
            )}

            {/* Language Breakdown Section */}
            {sccInstalled && metrics.byLanguage.length > 0 && (
              <div class="impact-section">
                <div class="impact-section-title">By Language</div>
                {metrics.byLanguage.map((lang) => (
                  <div class="impact-language" key={lang.language}>
                    <div class="impact-language-header">
                      <span class="impact-language-name">{lang.language}</span>
                      <span class="impact-language-files">{lang.files} files</span>
                    </div>
                    <div class="impact-language-metrics">
                      <span class="impact-language-loc">
                        {lang.linesAdded > 0 && `+${lang.linesAdded}`}
                        {lang.linesRemoved > 0 && ` -${lang.linesRemoved}`}
                      </span>
                      <span class="impact-language-complexity">
                        {lang.complexityDelta !== 0 &&
                          ` (${lang.complexityDelta > 0 ? "+" : ""}${lang.complexityDelta} cyc)`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div class="impact-loading">
            <p>Click Refresh to calculate impact metrics.</p>
            <p class="impact-loading-sub">Updates now arrive through WebSocket events.</p>
          </div>
        )}
      </div>

      <style>{`
        .impact-stale-badge {
          color: #ffd43b;
          font-size: 11px;
        }

        .impact-calculating-badge {
          color: #74c0fc;
          font-size: 11px;
        }
        
        .impact-section {
          margin-bottom: 20px;
          padding: 12px;
          background: #2d2d2d;
          border: 1px solid #444;
          border-radius: 4px;
        }
        
        .impact-section-title {
          font-size: 11px;
          text-transform: uppercase;
          color: #888;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid #444;
        }

        .impact-warning {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px;
          margin-bottom: 15px;
          background: #3d2d0b;
          border: 1px solid #665533;
          border-radius: 4px;
          font-size: 12px;
        }
        
        .warning-icon {
          font-size: 14px;
        }
        
        .warning-text {
          flex: 1;
          color: #d4d4d4;
        }
        
        .btn-small {
          padding: 3px 8px;
          font-size: 11px;
        }
        
        .impact-metric {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          font-family: monospace;
          font-size: 13px;
        }
        
        .impact-metric-label {
          color: #888;
          min-width: 80px;
        }
        
        .impact-metric-value {
          color: #d4d4d4;
          font-weight: 500;
        }
        
        .impact-metric-value.positive {
          color: #51cf66;
        }
        
        .impact-metric-value.negative {
          color: #ff6b6b;
        }
        
        .impact-trend {
          font-size: 14px;
          margin-left: 4px;
        }
        
        .impact-trend-up {
          color: #51cf66;
        }
        
        .impact-trend-down {
          color: #ff6b6b;
        }
        
        .impact-trend-stable {
          color: #888;
        }
        
        .impact-language {
          padding: 8px 0;
          border-bottom: 1px solid #333;
        }
        
        .impact-language:last-child {
          border-bottom: none;
        }
        
        .impact-language-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        
        .impact-language-name {
          font-weight: 500;
          color: #d4d4d4;
        }
        
        .impact-language-files {
          font-size: 11px;
          color: #888;
        }
        
        .impact-language-metrics {
          font-size: 12px;
          color: #888;
          font-family: monospace;
        }
        
        .impact-language-loc {
          color: #74c0fc;
        }
        
        .impact-language-complexity {
          color: #ffd43b;
        }
        
        .impact-no-data {
          color: #888;
          font-size: 12px;
          font-style: italic;
        }
        
        .impact-loading {
          text-align: center;
          padding: 40px 20px;
          color: #888;
        }
        
        .impact-loading-sub {
          font-size: 11px;
          margin-top: 10px;
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
};

function getTrendClass(trend?: string): string {
  if (trend === "↑") return "up";
  if (trend === "↓") return "down";
  return "stable";
}

function formatComplexityDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "0";
}

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
