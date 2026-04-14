import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface Project {
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: Date;
  description?: string;
}

interface ProjectsListProps {
  projects: Project[];
}

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

export const ProjectsListPage: FC<ProjectsListProps> = ({ projects }) => {
  return (
    <Layout title="Projects">
      <div class="container" style="max-width: 800px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1>Projects</h1>
          <a href="/projects/new" class="btn">
            Create Project
          </a>
        </div>

        {projects.length === 0 ? (
          <div class="empty-state">
            <p>No projects yet.</p>
            <a href="/projects/new" class="btn">
              Create your first project
            </a>
          </div>
        ) : (
          <div class="project-list">
            {projects.map((project) => (
              <div key={project.id} class="project-card">
                <div class="project-header">
                  <a href={`/projects/${project.id}`} class="project-name">
                    {project.name}
                  </a>
                  <span class={`repo-type ${project.repoType}`}>
                    {project.repoType}
                  </span>
                </div>
                <div style="color: #888; margin: 8px 0; font-size: 14px;">
                  {project.description ? (
                    truncateText(project.description, 200)
                  ) : (
                    <span style="color: #666;">No description</span>
                  )}
                </div>
                <div class="project-meta">
                  <span>{project.repoUrl}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};
