import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface PublicProject {
  id: string;
  name: string;
  description?: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: string;
}

interface LandingPageProps {
  projects: PublicProject[];
  isAuthenticated: boolean;
  username?: string;
}

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

export const LandingPage: FC<LandingPageProps> = ({ projects, isAuthenticated, username }) => {
  return (
    <Layout title="MIMO - Minimal IDE for Modern Operations">
      <div class="container" style="max-width: 900px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; padding: 20px 0; border-bottom: 1px solid #444;">
          <h1 style="margin: 0;">MIMO</h1>
          <div style="display: flex; gap: 15px; align-items: center;">
            {isAuthenticated ? (
              <>
                <span style="color: #888;">Logged in as <strong style="color: #d4d4d4;">{username}</strong></span>
                <a href="/auth/logout" class="btn-secondary">Logout</a>
              </>
            ) : (
              <>
                <a href="/auth/login" class="btn">Login</a>
                <a href="/auth/register" class="btn-secondary">Register</a>
              </>
            )}
          </div>
        </div>

        <div style="margin-bottom: 40px;">
          <h2 style="margin-bottom: 15px;">Minimal IDE for Modern Operations</h2>
          <p style="color: #888; line-height: 1.6; margin-bottom: 20px;">
            MIMO provides an Emacs-style interface for session-based development with AI integration.
            Manage projects, run agents, and sync files seamlessly.
          </p>
          <ul style="color: #888; line-height: 1.8; margin-left: 20px;">
            <li><strong style="color: #d4d4d4;">Emacs-style UI</strong> - Keyboard-driven interface inspired by Emacs</li>
            <li><strong style="color: #d4d4d4;">Session Management</strong> - Create isolated development sessions</li>
            <li><strong style="color: #d4d4d4;">AI Integration</strong> - Work with AI agents in your workspace</li>
            <li><strong style="color: #d4d4d4;">File Sync</strong> - Automatic synchronization of changes</li>
          </ul>
        </div>

        <div style="margin-bottom: 20px;">
          <h2 style="margin-bottom: 20px;">Projects ({projects.length})</h2>
          {projects.length === 0 ? (
            <div class="empty-state">
              <p>No projects yet.</p>
              {isAuthenticated && <a href="/projects/new" class="btn">Create your first project</a>}
            </div>
          ) : (
            <div class="project-list">
              {projects.map((project) => (
                <a href={`/projects/${project.id}`} class="project-card" style="text-decoration: none; color: inherit; display: block;">
                  <div class="project-header">
                    <span class="project-name">{project.name}</span>
                    <span class={`repo-type ${project.repoType}`}>{project.repoType}</span>
                  </div>
                  <div class="project-meta">
                    <span style="margin-right: 15px;">Owner: {project.owner}</span>
                    <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div style="color: #888; margin-top: 8px; font-size: 14px;">
                    {project.description ? truncateText(project.description, 200) : <span style="color: #666;">No description</span>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};