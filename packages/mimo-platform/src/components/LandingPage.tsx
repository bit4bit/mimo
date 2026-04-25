import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

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
      <div class="container" style="max-width: 900px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; padding: 20px 0; border-bottom: 1px solid #444;">
          <h1 style="margin: 0;">MIMO</h1>
          <div style="display: flex; gap: 15px; align-items: center;">
            {isAuthenticated ? (
              <>
                <span style="color: #888;">
                  Logged in as{" "}
                  <strong style="color: #d4d4d4;">{username}</strong>
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

        <div style="margin-bottom: 40px;">
          <h2 style="margin-bottom: 15px;">
            Minimal IDE for Modern Operations
          </h2>
          <p style="color: #888; line-height: 1.6; margin-bottom: 20px;">
            MIMO provides a web-based interface for session-based development
            with AI integration. Manage projects, run agents, and sync files
            seamlessly.
          </p>
          <ul style="color: #888; line-height: 1.8; margin-left: 20px;">
            <li>
              <strong style="color: #d4d4d4;">Two-Frame UI</strong> - Chat and
              buffer-based interface for focused workflows
            </li>
            <li>
              <strong style="color: #d4d4d4;">Session Management</strong> -
              Create isolated development sessions
            </li>
            <li>
              <strong style="color: #d4d4d4;">AI Integration</strong> - Work
              with AI agents in your workspace
            </li>
            <li>
              <strong style="color: #d4d4d4;">File Sync</strong> - Automatic
              synchronization of changes
            </li>
          </ul>
        </div>

        <div style="display: flex; gap: 40px; margin-bottom: 40px;">
          <div>
            <div style="font-size: 2rem; font-weight: bold;">
              {projectCount}
            </div>
            <div style="color: #888;">Projects</div>
          </div>
          <div>
            <div style="font-size: 2rem; font-weight: bold;">
              {sessionCount}
            </div>
            <div style="color: #888;">Sessions</div>
          </div>
          <div>
            <div style="font-size: 2rem; font-weight: bold;">{threadCount}</div>
            <div style="color: #888;">Chat threads</div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
