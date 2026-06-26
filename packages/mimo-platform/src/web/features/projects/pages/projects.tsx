// SPDX-License-Identifier: AGPL-3.0-only
import { Hono } from "hono";
import { Credential } from "../../../../domain/credentials/repository";
import { createAuthMiddleware } from "../../../../auth/middleware";
import { ProjectsSessionsPage } from "../components/ProjectsSessionsPage";
import { ProjectCreatePage } from "../components/ProjectCreatePage";
import { ProjectEditPage } from "../components/ProjectEditPage";
import { ImpactHistoryPage } from "../components/ImpactHistoryPage";
import { createSessionsRoutes } from "../../sessions/pages/sessions.js";
import type { MimoContext } from "../../../../infrastructure/context/mimo-context.js";
import { createInternalApiClient } from "../../../../api/rest/index.js";
import type {
  ListProjectsResponse,
  GetProjectResponse,
  CreateProjectResponse,
} from "../../../../api/rest/projects/types.js";
import type { Context } from "hono";

type ProjectsRoutesContext = Pick<MimoContext, "services" | "repos" | "env">;

interface ProjectsRoutesDeps {
  /** Optional custom fetch function for testing (routes to internal API) */
  fetchFn?: typeof fetch;
}

// Helper to detect if URL is SSH
function isSshUrl(url: string): boolean {
  return url.startsWith("git@") || url.startsWith("ssh://");
}

export function createProjectsRoutes(
  mimoContext: ProjectsRoutesContext,
  deps: ProjectsRoutesDeps = {},
) {
  const projects = new Hono();
  const credentialRepository = mimoContext.repos.credentials;
  const sessionRepository = mimoContext.repos.sessions;
  const impactRepository = mimoContext.repos.impacts;
  const auth = createAuthMiddleware(mimoContext.services.auth);
  const sessions = createSessionsRoutes(mimoContext, {
    fetchFn: deps.fetchFn,
  });

  // Helper to create API client with optional test fetch
  function createApiClient(c: Context) {
    return createInternalApiClient(c, mimoContext as MimoContext, {
      fetchFn: deps.fetchFn,
    });
  }

  // List all projects (GET /projects)
  projects.get("/", auth, async (c) => {
    const user = c.get("user") as { username: string };
    const selectedId = c.req.query("selected");
    const apiClient = createApiClient(c);

    // Call internal API for projects list
    const result = await apiClient.get<ListProjectsResponse>("/projects");

    if (!result.success) {
      return c.text(`Failed to load projects: ${result.error}`, result.status);
    }

    const projectsList = result.data.projects;

    let selectedProject = null;
    let selectedCredential: Credential | null = null;
    let selectedProjectSessions: Awaited<
      ReturnType<typeof sessionRepository.listByProject>
    > = [];

    if (selectedId) {
      // Call internal API for selected project
      const selectedResult = await apiClient.get<GetProjectResponse>(
        `/projects/${selectedId}`,
      );

      if (selectedResult.success) {
        selectedProject = selectedResult.data.project;
        selectedProjectSessions =
          await sessionRepository.listByProject(selectedId);
        if (selectedProject.credentialId) {
          selectedCredential = await credentialRepository.findById(
            selectedProject.credentialId,
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
          closeReason: s.closeReason,
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
  projects.get("/new", auth, async (c) => {
    const user = c.get("user") as { username: string };
    const credentials = await credentialRepository.findByOwner(user.username);
    const defaultInstructions = mimoContext.services.config.get(
      "defaultProjectInstructions",
    ) as string;
    return c.html(
      <ProjectCreatePage
        credentials={credentials}
        defaultInstructions={defaultInstructions}
      />,
    );
  });

  // Create project (POST /projects)
  projects.post("/", auth, async (c) => {
    const body = await c.req.parseBody();
    const name = body.name as string;
    const repoUrl = body.repoUrl as string;
    const repoType = (body.repoType as string) || "git";
    const description = body.description as string | undefined;
    const credentialId = body.credentialId as string | undefined;
    const sourceBranch = body.sourceBranch as string | undefined;
    const newBranch = body.newBranch as string | undefined;
    const agentSubpath = body.agentSubpath as string | undefined;
    const instructions = body.instructions as string | undefined;
    const clonePortRaw = body.clonePort as string | undefined;
    const user = c.get("user") as { username: string };

    let clonePortValue: number | undefined;
    if (clonePortRaw) {
      const parsed = parseInt(clonePortRaw, 10);
      if (
        isNaN(parsed) ||
        !Number.isInteger(parsed) ||
        parsed < 1 ||
        parsed > 65535
      ) {
        const credentials = await credentialRepository.findByOwner(
          user.username,
        );
        return c.html(
          <ProjectCreatePage
            credentials={credentials}
            error="SSH port must be an integer between 1 and 65535"
            defaultInstructions={instructions}
          />,
          400,
        );
      }
      clonePortValue = parsed;
    }

    // Pre-validate before calling internal API
    if (!name || !repoUrl) {
      const credentials = await credentialRepository.findByOwner(user.username);
      return c.html(
        <ProjectCreatePage
          credentials={credentials}
          error="Name and repository URL are required"
          defaultInstructions={instructions}
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
          <ProjectCreatePage
            credentials={credentials}
            error="Invalid repository URL"
            defaultInstructions={instructions}
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
          defaultInstructions={instructions}
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
          defaultInstructions={instructions}
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
            defaultInstructions={instructions}
          />,
          400,
        );
      }

      const expectedType = isSshUrl(repoUrl) ? "ssh" : "https";
      if (credential.type !== expectedType) {
        const credentials = await credentialRepository.findByOwner(
          user.username,
        );
        return c.html(
          <ProjectCreatePage
            credentials={credentials}
            error={`Credential type does not match repository URL type. Expected ${expectedType.toUpperCase()} but got ${credential.type.toUpperCase()}`}
            defaultInstructions={instructions}
          />,
          400,
        );
      }
    }

    // Use internal API client to create project
    const apiClient = createApiClient(c);
    const result = await apiClient.post<CreateProjectResponse>("/projects", {
      name,
      repoUrl,
      repoType,
      description,
      credentialId,
      sourceBranch,
      newBranch,
      agentSubpath,
      ...(instructions && { instructions }),
      ...(clonePortValue != null && { clonePort: clonePortValue }),
    });

    if (!result.success) {
      const credentials = await credentialRepository.findByOwner(user.username);
      return c.html(
        <ProjectCreatePage
          credentials={credentials}
          error={result.error}
          defaultInstructions={instructions}
        />,
        result.status >= 400 && result.status < 500 ? result.status : 500,
      );
    }

    return c.redirect(`/projects/${result.data.project.id}`, 302);
  });

  // View project (GET /projects/:id)
  projects.get("/:id", auth, async (c) => {
    const id = c.req.param("id");
    const apiClient = createApiClient(c);
    const result = await apiClient.get<GetProjectResponse>(`/projects/${id}`);

    if (!result.success) {
      if (result.status === 404) {
        return c.notFound();
      }
      return c.text(`Failed to load project: ${result.error}`, result.status);
    }

    return c.redirect(`/projects?selected=${id}`, 302);
  });

  // Edit project form (GET /projects/:id/edit)
  projects.get("/:id/edit", auth, async (c) => {
    const id = c.req.param("id");
    const user = c.get("user") as { username: string };
    const apiClient = createApiClient(c);
    const result = await apiClient.get<GetProjectResponse>(`/projects/${id}`);

    if (!result.success) {
      if (result.status === 404) {
        return c.notFound();
      }
      return c.text(`Failed to load project: ${result.error}`, result.status);
    }

    const credentials = await credentialRepository.findByOwner(user.username);
    return c.html(
      <ProjectEditPage
        project={result.data.project}
        credentials={credentials}
      />,
    );
  });

  // Update project (POST /projects/:id/edit)
  projects.post("/:id/edit", auth, async (c) => {
    const id = c.req.param("id");
    const user = c.get("user") as { username: string };
    const apiClient = createApiClient(c);

    // Fetch current project via internal API
    const getResult = await apiClient.get<GetProjectResponse>(
      `/projects/${id}`,
    );

    if (!getResult.success) {
      if (getResult.status === 404) {
        return c.notFound();
      }
      return c.text(
        `Failed to load project: ${getResult.error}`,
        getResult.status,
      );
    }

    const currentProject = getResult.data.project;

    const body = await c.req.parseBody();
    const name = body.name as string;
    const repoUrl = body.repoUrl as string;
    const repoType = (body.repoType as string) || "git";
    const description = body.description as string | undefined;
    const credentialId = body.credentialId as string | undefined;
    const instructions = body.instructions as string | undefined;

    // Pre-validation
    if (!name || !repoUrl) {
      const credentials = await credentialRepository.findByOwner(user.username);
      return c.html(
        <ProjectEditPage
          project={currentProject}
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
            project={currentProject}
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
          project={currentProject}
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
          project={currentProject}
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
            project={currentProject}
            credentials={credentials}
            error="Selected credential not found"
          />,
          400,
        );
      }

      const expectedType = isSshUrl(repoUrl) ? "ssh" : "https";
      if (credential.type !== expectedType) {
        const credentials = await credentialRepository.findByOwner(
          user.username,
        );
        return c.html(
          <ProjectEditPage
            project={currentProject}
            credentials={credentials}
            error={`Credential type does not match repository URL type. Expected ${expectedType.toUpperCase()} but got ${credential.type.toUpperCase()}`}
          />,
          400,
        );
      }
    }

    // Use internal API client to update project
    const result = await apiClient.put<{ project: typeof currentProject }>(
      `/projects/${id}`,
      {
        name,
        repoUrl,
        repoType,
        description,
        credentialId,
        ...(instructions !== undefined && { instructions }),
      },
    );

    if (!result.success) {
      const credentials = await credentialRepository.findByOwner(user.username);
      return c.html(
        <ProjectEditPage
          project={currentProject}
          credentials={credentials}
          error={result.error}
        />,
        result.status >= 400 && result.status < 500 ? result.status : 500,
      );
    }

    return c.redirect(`/projects/${id}`, 302);
  });

  // Delete project (POST /projects/:id/delete)
  projects.post("/:id/delete", auth, async (c) => {
    const id = c.req.param("id");
    const apiClient = createApiClient(c);
    const result = await apiClient.delete<{ deleted: true }>(`/projects/${id}`);

    if (!result.success) {
      if (result.status === 404) {
        return c.notFound();
      }
      return c.text(`Failed to delete project: ${result.error}`, result.status);
    }

    return c.redirect("/projects", 302);
  });

  // GET /projects/:id/impacts - Impact history page
  projects.get("/:id/impacts", auth, async (c) => {
    const id = c.req.param("id");
    const user = c.get("user") as { username: string };
    const apiClient = createApiClient(c);
    const result = await apiClient.get<GetProjectResponse>(`/projects/${id}`);

    if (!result.success) {
      if (result.status === 404) {
        return c.notFound();
      }
      return c.text(`Failed to load project: ${result.error}`, result.status);
    }

    const project = result.data.project;

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
  projects.get("/:id/notes", auth, async (c) => {
    const id = c.req.param("id");
    const apiClient = createApiClient(c);
    const result = await apiClient.get<GetProjectResponse>(`/projects/${id}`);

    if (!result.success) {
      if (result.status === 404) {
        return c.json({ error: "Project not found" }, 404);
      }
      return c.text(`Failed to load project: ${result.error}`, result.status);
    }

    const frameStateService = mimoContext.services.frameState;
    const content = await frameStateService.loadProjectNotes(id);

    return c.json({ content });
  });

  // POST /projects/:id/notes - Save project notes
  projects.post("/:id/notes", auth, async (c) => {
    const id = c.req.param("id");
    const apiClient = createApiClient(c);
    const result = await apiClient.get<GetProjectResponse>(`/projects/${id}`);

    if (!result.success) {
      if (result.status === 404) {
        return c.json({ error: "Project not found" }, 404);
      }
      return c.text(`Failed to load project: ${result.error}`, result.status);
    }

    const body = await c.req.json();
    const content = typeof body.content === "string" ? body.content : "";

    const frameStateService = mimoContext.services.frameState;
    await frameStateService.saveProjectNotes(id, content);

    return c.json({ success: true });
  });

  // Nested session routes
  projects.route("/:projectId/sessions", sessions);

  return projects;
}
