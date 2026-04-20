import type { FC } from "hono/jsx";
import { Layout } from "./Layout.js";
import { DataTable, type DataTableColumn } from "./DataTable.js";

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
  const columns: DataTableColumn<Project>[] = [
    {
      key: "name",
      label: "Name",
      render: (project) => (
        <a href={`/projects/${project.id}`} class="project-name">
          {project.name}
        </a>
      ),
    },
    {
      key: "repoType",
      label: "Type",
      render: (project) => (
        <span class={`repo-type ${project.repoType}`}>
          {project.repoType}
        </span>
      ),
    },
    {
      key: "description",
      label: "Description",
      render: (project) =>
        project.description ? (
          truncateText(project.description, 80)
        ) : (
          <span style="color: #666;">No description</span>
        ),
    },
    {
      key: "repoUrl",
      label: "Repository",
      render: (project) => (
        <span class="project-meta">{truncateText(project.repoUrl, 50)}</span>
      ),
    },
  ];

  return (
    <Layout title="Projects">
      <div class="container-wide">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1>Projects</h1>
          <a href="/projects/new" class="btn">
            Create Project
          </a>
        </div>

        <DataTable
          rows={projects}
          columns={columns}
          searchFields={["name"]}
          pageSize={10}
          emptyMessage="No projects yet."
          emptyAction={
            <a href="/projects/new" class="btn">
              Create your first project
            </a>
          }
          sortBy="createdAt"
          sortDesc={true}
        />
      </div>
    </Layout>
  );
};
