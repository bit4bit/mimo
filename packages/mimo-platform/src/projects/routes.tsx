import { Hono } from "hono";
import { CreateProjectInput } from "../projects/repository";
import { Credential } from "../credentials/repository";
import { authMiddleware } from "../auth/middleware";
import { ProjectsSessionsPage } from "../components/ProjectsSessionsPage";
import { ProjectCreatePage } from "../components/ProjectCreatePage";
import { ProjectEditPage } from "../components/ProjectEditPage";
import { ImpactHistoryPage } from "../components/ImpactHistoryPage";
import { createSessionsRoutes } from "../sessions/routes";
import type { MimoContext } from "../context/mimo-context.js";

type ProjectsRoutesContext = Pick<MimoContext, "services" | "repos">;

export function createProjectsRoutes(mimoContext: ProjectsRoutesContext) {
  const projects = new Hono();
  const projectRepository = mimoContext.repos.projects;
  const sessionRepository = mimoContext.repos.sessions;
  const credentialRepository = mimoContext.repos.credentials;
  const impactRepository = mimoContext.repos.impacts;
  const sessions = createSessionsRoutes(mimoContext);

  // Helper to detect if URL is SSH
  function isSshUrl(url: string): boolean {
    return url.startsWith("git@") || url.startsWith("ssh://");
  }

  // Helper to get credential type from URL
  function getCredentialTypeFromUrl(url: string): "https" | "ssh" {
    return isSshUrl(url) ? "ssh" : "https";
  }

  // List all projects (GET /projects)
  projects.get("/", authMiddleware, async (c) => {
    const user = c.get("user") as { username: string };
    const selectedId = c.req.query("selected");
    const projectsList = await projectRepository.listByOwner(user.username);

    let selectedProject = null;
    let selectedCredential: Credential | null = null;
    let selectedProjectSessions: Awaited<ReturnType<typeof sessionRepository.listByProject>> =
      [];

    if (selectedId) {
      const candidate = await projectRepository.findById(selectedId);
      if (candidate && candidate.owner === user.username) {
        selectedProject = candidate;
        selectedProjectSessions = await sessionRepository.listByProject(candidate.id);
        if (candidate.credentialId) {
          selectedCredential = await credentialRepository.findById(
            candidate.credentialId,
            user.username,
          );
        }
      }
    }

    return c.html(
      <ProjectsSessionsPage
        projects={projectsList}
        selectedProject={selectedProject}
        selectedProjectId={selectedProject?.id ?? selectedId}
        selectedProjectSessions={selectedProjectSessions.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          createdAt: s.createdAt,
          priority: s.priority,
          sessionTtlDays: s.sessionTtlDays,
        }))}
        selectedCredential={
          selectedCredential
            ? {
                name: selectedCredential.name,
              }
            : null
        }
      />,
    );
  });

  // Show create form (GET /projects/new)
  projects.get("/new", authMiddleware, async (c) => {
    const user = c.get("user") as { username: string };
    const credentials = await credentialRepository.findByOwner(user.username);
    return c.html(<ProjectCreatePage credentials={credentials} />);
  });

  // Create project (POST /projects)
  projects.post("/", authMiddleware, async (c) => {
    const body = await c.req.parseBody();
    const name = body.name as string;
    const repoUrl = body.repoUrl as string;
    const repoType = (body.repoType as string) || "git";
    const description = body.description as string | undefined;
    const credentialId = body.credentialId as string | undefined;
    const sourceBranch = body.sourceBranch as string | undefined;
    const newBranch = body.newBranch as string | undefined;
    const user = c.get("user") as { username: string };

    if (!name || !repoUrl) {
      const credentials = await credentialRepository.findByOwner(user.username);
      return c.html(
        <ProjectCreatePage
          credentials={credentials}
          error="Name and repository URL are required"
        />,
        400,
      );
    }

    // Validate URL format
    try {
      new URL(repoUrl);
    } catch {
      // Allow SSH URLs (git@github.com:user/repo.git)
      if (!isSshUrl(repoUrl)) {
        const credentials = await credentialRepository.findByOwner(
          user.username,
        );
        return c.html(
          <ProjectCreatePage
            credentials={credentials}
            error="Invalid repository URL"
          />,
          400,
        );
      }
    }

    // Validate repo type
    if (repoType !== "git" && repoType !== "fossil") {
      const credentials = await credentialRepository.findByOwner(user.username);
      return c.html(
        <ProjectCreatePage
          credentials={credentials}
          error="Repository type must be 'git' or 'fossil'"
        />,
        400,
      );
    }

    // Validate description length
    if (description && description.length > 500) {
      const credentials = await credentialRepository.findByOwner(user.username);
      return c.html(
        <ProjectCreatePage
          credentials={credentials}
          error="Description must be 500 characters or less"
        />,
        400,
      );
    }

    // Validate credential if provided
    if (credentialId) {
      const credential = await credentialRepository.findById(
        credentialId,
        user.username,
      );
      if (!credential) {
        const credentials = await credentialRepository.findByOwner(
          user.username,
        );
        return c.html(
          <ProjectCreatePage
            credentials={credentials}
            error="Selected credential not found"
          />,
          400,
        );
      }

      // Validate credential type matches URL type
      const expectedType = getCredentialTypeFromUrl(repoUrl);
      if (credential.type !== expectedType) {
        const credentials = await credentialRepository.findByOwner(
          user.username,
        );
        return c.html(
          <ProjectCreatePage
            credentials={credentials}
            error={`Credential type does not match repository URL type. Expected ${expectedType.toUpperCase()} but got ${credential.type.toUpperCase()}`}
          />,
          400,
        );
      }
    }

    try {
      const project = await projectRepository.create({
        name,
        repoUrl,
        repoType: repoType as "git" | "fossil",
        owner: user.username,
        description: description || undefined,
        credentialId: credentialId || undefined,
        sourceBranch: sourceBranch || undefined,
        newBranch: newBranch || undefined,
      });

      return c.redirect(`/projects/${project.id}`, 302);
    } catch (error) {
      const credentials = await credentialRepository.findByOwner(user.username);
      return c.html(
        <ProjectCreatePage
          credentials={credentials}
          error="Failed to create project"
        />,
        500,
      );
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

    return c.redirect(`/projects?selected=${id}`, 302);
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

    const credentials = await credentialRepository.findByOwner(user.username);
    return c.html(
      <ProjectEditPage project={project} credentials={credentials} />,
    );
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
    const credentialId = body.credentialId as string | undefined;

    if (!name || !repoUrl) {
      const credentials = await credentialRepository.findByOwner(user.username);
      return c.html(
        <ProjectEditPage
          project={project}
          credentials={credentials}
          error="Name and repository URL are required"
        />,
        400,
      );
    }

    // Validate URL format
    try {
      new URL(repoUrl);
    } catch {
      if (!isSshUrl(repoUrl)) {
        const credentials = await credentialRepository.findByOwner(
          user.username,
        );
        return c.html(
          <ProjectEditPage
            project={project}
            credentials={credentials}
            error="Invalid repository URL"
          />,
          400,
        );
      }
    }

    // Validate repo type
    if (repoType !== "git" && repoType !== "fossil") {
      const credentials = await credentialRepository.findByOwner(user.username);
      return c.html(
        <ProjectEditPage
          project={project}
          credentials={credentials}
          error="Repository type must be 'git' or 'fossil'"
        />,
        400,
      );
    }

    // Validate description length
    if (description && description.length > 500) {
      const credentials = await credentialRepository.findByOwner(user.username);
      return c.html(
        <ProjectEditPage
          project={project}
          credentials={credentials}
          error="Description must be 500 characters or less"
        />,
        400,
      );
    }

    // Validate credential if provided
    if (credentialId) {
      const credential = await credentialRepository.findById(
        credentialId,
        user.username,
      );
      if (!credential) {
        const credentials = await credentialRepository.findByOwner(
          user.username,
        );
        return c.html(
          <ProjectEditPage
            project={project}
            credentials={credentials}
            error="Selected credential not found"
          />,
          400,
        );
      }

      // Validate credential type matches URL type
      const expectedType = getCredentialTypeFromUrl(repoUrl);
      if (credential.type !== expectedType) {
        const credentials = await credentialRepository.findByOwner(
          user.username,
        );
        return c.html(
          <ProjectEditPage
            project={project}
            credentials={credentials}
            error={`Credential type does not match repository URL type. Expected ${expectedType.toUpperCase()} but got ${credential.type.toUpperCase()}`}
          />,
          400,
        );
      }
    }

    try {
      await projectRepository.update(id, {
        name,
        repoUrl,
        repoType: repoType as "git" | "fossil",
        description: description || undefined,
        credentialId: credentialId || undefined,
      });

      return c.redirect(`/projects/${id}`, 302);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update project";
      const credentials = await credentialRepository.findByOwner(user.username);
      return c.html(
        <ProjectEditPage
          project={project}
          credentials={credentials}
          error={errorMessage}
        />,
        500,
      );
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

  // GET /projects/:id/impacts - Impact history page
  projects.get("/:id/impacts", authMiddleware, async (c) => {
    const id = c.req.param("id");
    const project = await projectRepository.findById(id);

    if (!project) {
      return c.notFound();
    }

    const user = c.get("user") as { username: string };
    if (project.owner !== user.username) {
      return c.notFound();
    }

    // Get all impact records for this project
    const impacts = await impactRepository.findByProject(id);

    // Get all sessions for this project to check existence
    const allSessions = await sessionRepository.listByProject(id);
    const sessionMap = new Map();

    for (const impact of impacts) {
      const session = allSessions.find((s) => s.id === impact.sessionId);
      sessionMap.set(impact.sessionId, {
        id: impact.sessionId,
        name: impact.sessionName,
        exists: !!session,
      });
    }

    return c.html(
      <ImpactHistoryPage
        project={project}
        impacts={impacts}
        sessions={sessionMap}
      />,
    );
  });

  // GET /projects/:id/notes - Fetch project notes
  projects.get("/:id/notes", authMiddleware, async (c) => {
    const id = c.req.param("id");
    const project = await projectRepository.findById(id);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const user = c.get("user") as { username: string };
    if (project.owner !== user.username) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const frameStateService = mimoContext.services.frameState;
    const content = frameStateService.loadProjectNotes(id);

    return c.json({ content });
  });

  // POST /projects/:id/notes - Save project notes
  projects.post("/:id/notes", authMiddleware, async (c) => {
    const id = c.req.param("id");
    const project = await projectRepository.findById(id);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const user = c.get("user") as { username: string };
    if (project.owner !== user.username) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const body = await c.req.json();
    const content = typeof body.content === "string" ? body.content : "";

    const frameStateService = mimoContext.services.frameState;
    frameStateService.saveProjectNotes(id, content);

    return c.json({ success: true });
  });

  // Nested session routes
  projects.route("/:projectId/sessions", sessions);

  return projects;
}
