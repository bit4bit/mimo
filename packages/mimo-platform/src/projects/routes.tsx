import { Hono } from "hono";
import { projectRepository, CreateProjectInput } from "../projects/repository";
import { sessionRepository } from "../sessions/repository";
import { authMiddleware } from "../auth/middleware";
import { ProjectsListPage } from "../components/ProjectsListPage";
import { ProjectDetailPage } from "../components/ProjectDetailPage";
import { ProjectCreatePage } from "../components/ProjectCreatePage";
import { ProjectEditPage } from "../components/ProjectEditPage";
import sessions from "../sessions/routes";

const projects = new Hono();

// List all projects (GET /projects)
projects.get("/", authMiddleware, async (c) => {
  const user = c.get("user") as { username: string };
  const projectsList = await projectRepository.listByOwner(user.username);
  return c.html(<ProjectsListPage projects={projectsList} />);
});

// Show create form (GET /projects/new)
projects.get("/new", authMiddleware, (c) => {
  return c.html(<ProjectCreatePage />);
});

// Create project (POST /projects)
projects.post("/", authMiddleware, async (c) => {
  const body = await c.req.parseBody();
  const name = body.name as string;
  const repoUrl = body.repoUrl as string;
  const repoType = (body.repoType as string) || "git";
  const description = body.description as string | undefined;

  if (!name || !repoUrl) {
    return c.html(<ProjectCreatePage error="Name and repository URL are required" />, 400);
  }

  // Validate URL format
  try {
    new URL(repoUrl);
  } catch {
    return c.html(<ProjectCreatePage error="Invalid repository URL" />, 400);
  }

  // Validate repo type
  if (repoType !== "git" && repoType !== "fossil") {
    return c.html(<ProjectCreatePage error="Repository type must be 'git' or 'fossil'" />, 400);
  }

  // Validate description length
  if (description && description.length > 500) {
    return c.html(<ProjectCreatePage error="Description must be 500 characters or less" />, 400);
  }

  const user = c.get("user") as { username: string };
  
  try {
    const project = await projectRepository.create({
      name,
      repoUrl,
      repoType: repoType as "git" | "fossil",
      owner: user.username,
      description: description || undefined,
    });

    return c.redirect(`/projects/${project.id}`, 302);
  } catch (error) {
    return c.html(<ProjectCreatePage error="Failed to create project" />, 500);
  }
});

// View project (GET /projects/:id)
projects.get("/:id", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const project = await projectRepository.findById(id);
  
  if (!project) {
    return c.notFound();
  }

  const user = c.get("user") as { username: string };
  if (project.owner !== user.username) {
    return c.notFound();
  }

  const sessions = await sessionRepository.listByProject(id);

  return c.html(<ProjectDetailPage project={project} sessions={sessions} />);
});

// Edit project form (GET /projects/:id/edit)
projects.get("/:id/edit", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const project = await projectRepository.findById(id);
  
  if (!project) {
    return c.notFound();
  }

  const user = c.get("user") as { username: string };
  if (project.owner !== user.username) {
    return c.notFound();
  }

  return c.html(<ProjectEditPage project={project} />);
});

// Update project (POST /projects/:id/edit)
projects.post("/:id/edit", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const project = await projectRepository.findById(id);
  
  if (!project) {
    return c.notFound();
  }

  const user = c.get("user") as { username: string };
  if (project.owner !== user.username) {
    return c.notFound();
  }

  const body = await c.req.parseBody();
  const name = body.name as string;
  const repoUrl = body.repoUrl as string;
  const repoType = (body.repoType as string) || "git";
  const description = body.description as string | undefined;

  if (!name || !repoUrl) {
    return c.html(<ProjectEditPage project={project} error="Name and repository URL are required" />, 400);
  }

  // Validate URL format
  try {
    new URL(repoUrl);
  } catch {
    return c.html(<ProjectEditPage project={project} error="Invalid repository URL" />, 400);
  }

  // Validate repo type
  if (repoType !== "git" && repoType !== "fossil") {
    return c.html(<ProjectEditPage project={project} error="Repository type must be 'git' or 'fossil'" />, 400);
  }

  // Validate description length
  if (description && description.length > 500) {
    return c.html(<ProjectEditPage project={project} error="Description must be 500 characters or less" />, 400);
  }

  try {
    await projectRepository.update(id, {
      name,
      repoUrl,
      repoType: repoType as "git" | "fossil",
      description: description || undefined,
    });

    return c.redirect(`/projects/${id}`, 302);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to update project";
    return c.html(<ProjectEditPage project={project} error={errorMessage} />, 500);
  }
});

// Delete project (POST /projects/:id/delete)
projects.post("/:id/delete", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const project = await projectRepository.findById(id);
  
  if (!project) {
    return c.notFound();
  }

  const user = c.get("user") as { username: string };
  if (project.owner !== user.username) {
    return c.notFound();
  }

  await projectRepository.delete(id);
  return c.redirect("/projects", 302);
});

// Nested session routes
projects.route("/:projectId/sessions", sessions);

export default projects;
