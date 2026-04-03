import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";

interface Project {
  id: string;
  name: string;
  repoUrl: string;
  repoType: "git" | "fossil";
  owner: string;
  createdAt: Date;
}

interface ProjectDetailProps {
  project: Project;
}

export const ProjectDetailPage: FC<ProjectDetailProps> = ({ project }) => {
  return (
    <Layout title={project.name}>
      <div class="container" style="max-width: 800px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1>{project.name}</h1>
          <div>
            <a href="/projects" class="btn">Back to Projects</a>
          </div>
        </div>

        <div class="project-details">
          <div class="detail-row">
            <label>Repository URL:</label>
            <div>{project.repoUrl}</div>
          </div>
          <div class="detail-row">
            <label>Repository Type:</label>
            <div>{project.repoType}</div>
          </div>
          <div class="detail-row">
            <label>Owner:</label>
            <div>{project.owner}</div>
          </div>
          <div class="detail-row">
            <label>Created:</label>
            <div>{new Date(project.createdAt).toLocaleString()}</div>
          </div>
        </div>

        <div class="actions" style="margin-top: 30px;">
          <h2>Actions</h2>
          <form method="POST" action={`/projects/${project.id}/delete`} style="margin-top: 15px;">
            <button type="submit" class="btn-danger">Delete Project</button>
          </form>
        </div>
      </div>
    </Layout>
  );
};
