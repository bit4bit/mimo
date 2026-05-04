import type { FC } from "hono/jsx";
import { Layout } from "../../../shared/components/Layout.js";

interface LandingPageProps {
  projectCount: number;
  sessionCount: number;
  threadCount: number;
  isAuthenticated: boolean;
  username?: string;
}

export const LandingPage: FC<LandingPageProps> = ({
  projectCount,
  sessionCount,
  threadCount,
  isAuthenticated,
  username,
}) => {
  return (
    <Layout title="MIMO - Minimal IDE for Modern Operations">
      <div class="container landing-container">
        <div class="landing-header">
          <h1 class="landing-title">MIMO</h1>
          <div class="landing-auth-actions">
            {isAuthenticated ? (
              <>
                <span class="text-muted">
                  Logged in as{" "}
                  <strong class="text-primary">{username}</strong>
                </span>
                <a
                  href="/auth/logout"
                  class="btn-secondary"
                  data-help-id="landing-page-a"
                >
                  Logout
                </a>
              </>
            ) : (
              <>
                <a href="/auth/login" class="btn" data-help-id="landing-page-a">
                  Login
                </a>
                <a
                  href="/auth/register"
                  class="btn-secondary"
                  data-help-id="landing-page-a"
                >
                  Register
                </a>
              </>
            )}
          </div>
        </div>

        <div class="landing-intro">
          <h2 class="landing-subtitle">
            Minimal IDE for Modern Operations
          </h2>
          <p class="landing-copy">
            MIMO provides a web-based interface for session-based development
            with AI integration. Manage projects, run agents, and sync files
            seamlessly.
          </p>
          <ul class="landing-feature-list">
            <li>
              <strong class="text-primary">Two-Frame UI</strong> - Chat and
              buffer-based interface for focused workflows
            </li>
            <li>
              <strong class="text-primary">Session Management</strong> -
              Create isolated development sessions
            </li>
            <li>
              <strong class="text-primary">AI Integration</strong> - Work
              with AI agents in your workspace
            </li>
            <li>
              <strong class="text-primary">File Sync</strong> - Automatic
              synchronization of changes
            </li>
          </ul>
        </div>

        <div class="landing-stats-row">
          <div>
            <div class="landing-stat-value">
              {projectCount}
            </div>
            <div class="text-muted">Projects</div>
          </div>
          <div>
            <div class="landing-stat-value">
              {sessionCount}
            </div>
            <div class="text-muted">Sessions</div>
          </div>
          <div>
            <div class="landing-stat-value">{threadCount}</div>
            <div class="text-muted">Chat threads</div>
          </div>
        </div>

        <style>{`
          .landing-container { max-width: 900px; }
          .landing-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; padding: 20px 0; border-bottom: 1px solid #444; }
          .landing-title { margin: 0; }
          .landing-auth-actions { display: flex; gap: 15px; align-items: center; }
          .landing-intro { margin-bottom: 40px; }
          .landing-subtitle { margin-bottom: 15px; }
          .landing-copy { color: #888; line-height: 1.6; margin-bottom: 20px; }
          .landing-feature-list { color: #888; line-height: 1.8; margin-left: 20px; }
          .landing-stats-row { display: flex; gap: 40px; margin-bottom: 40px; }
          .landing-stat-value { font-size: 2rem; font-weight: bold; }
        `}</style>
      </div>
    </Layout>
  );
};
