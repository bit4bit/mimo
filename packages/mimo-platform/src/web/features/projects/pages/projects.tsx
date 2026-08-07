// SPDX-License-Identifier: AGPL-3.0-only
import { Hono } from "hono";
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
import type {
  ListFeaturesResponse,
  FeatureResponse,
} from "../../../../api/rest/projects/features-types.js";
import type { Context } from "hono";

type ProjectsRoutesContext = Pick<MimoContext, "services" | "repos" | "env">;

interface ProjectsRoutesDeps {
  /** Optional custom fetch function for testing (routes to internal API) */
  fetchFn?: typeof fetch;
}

function asArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function buildPickedRepositories(
  body: Record<string, unknown>,
  managedRepositories: Array<{ id: string; name: string }>,
): any[] {
  const selectedIds = [
    ...asArray(body["repoSelected[]"]),
    ...asArray(body.repoSelected),
  ];

  return selectedIds
    .map((id) => {
      const managed = managedRepositories.find((repo) => repo.id === id);
      if (!managed) return null;
      return {
        id: managed.name,
        name: managed.name,
        repoId: managed.id,
        mountPath: (body[`mountPath_${id}`] as string)?.trim() || managed.name,
        sourceBranch:
          (body[`sourceBranch_${id}`] as string)?.trim() || undefined,
        newBranch: (body[`newBranch_${id}`] as string)?.trim() || undefined,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
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
    const tab = c.req.query("tab") === "features" ? "features" : "sessions";
    const apiClient = createApiClient(c);

    // Call internal API for projects list
    const result = await apiClient.get<ListProjectsResponse>("/projects");

    if (!result.success) {
      return c.text(`Failed to load projects: ${result.error}`, result.status);
    }

    const projectsList = result.data.projects;

    let selectedProject = null;
    let selectedRepositories: Array<{
      name: string;
      mountPath: string;
      credentialName: string | null;
    }> = [];
    let selectedProjectSessions: Awaited<
      ReturnType<typeof sessionRepository.listByProject>
    > = [];
    let selectedProjectFeatures: FeatureResponse[] = [];

    if (selectedId) {
      // Call internal API for selected project
      const selectedResult = await apiClient.get<GetProjectResponse>(
        `/projects/${selectedId}`,
      );

      if (selectedResult.success) {
        selectedProject = selectedResult.data.project;
        selectedProjectSessions =
          await sessionRepository.listByProject(selectedId);
        const entries = selectedProject.repositories ?? [];
        selectedRepositories = await Promise.all(
          entries.map(async (entry: any) => {
            const managed = entry.repoId
              ? await mimoContext.repos.managedRepositories.findById(
                  entry.repoId,
                  user.username,
                )
              : null;
            let credentialName: string | null = null;
            const credentialId = managed?.credentialId ?? entry.credentialId;
            if (credentialId) {
              const credential = await credentialRepository.findById(
                credentialId,
                user.username,
              );
              credentialName = credential?.name ?? null;
            }
            return {
              name: managed?.name ?? entry.name,
              mountPath: entry.mountPath,
              credentialName,
            };
          }),
        );
        // Load features for the Features tab (best-effort).
        const featuresResult = await apiClient.get<ListFeaturesResponse>(
          `/projects/${selectedId}/features`,
        );
        if (featuresResult.success) {
          selectedProjectFeatures = featuresResult.data.features;
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
        selectedRepositories={selectedRepositories}
        activeTab={tab}
        features={selectedProjectFeatures}
      />,
    );
  });

  // Show create form (GET /projects/new)
  projects.get("/new", auth, async (c) => {
    const user = c.get("user") as { username: string };
    const managedRepositories =
      await mimoContext.repos.managedRepositories.findByOwner(user.username);
    const defaultInstructions = mimoContext.services.config.get(
      "defaultProjectInstructions",
    ) as string;
    return c.html(
      <ProjectCreatePage
        repositories={managedRepositories}
        defaultInstructions={defaultInstructions}
      />,
    );
  });

  // Create project (POST /projects)
  projects.post("/", auth, async (c) => {
    const body = await c.req.parseBody();
    const name = body.name as string;
    const description = body.description as string | undefined;
    const agentSubpath = body.agentSubpath as string | undefined;
    const instructions = body.instructions as string | undefined;
    const user = c.get("user") as { username: string };
    const managedRepositories =
      await mimoContext.repos.managedRepositories.findByOwner(user.username);

    const renderError = (error: string, status = 400) =>
      c.html(
        <ProjectCreatePage
          repositories={managedRepositories}
          error={error}
          defaultInstructions={instructions}
        />,
        status,
      );

    const repositories = buildPickedRepositories(body, managedRepositories);

    if (!name) {
      return renderError("Project name is required");
    }
    if (repositories.length === 0) {
      return renderError("Pick at least one repository for the project");
    }
    if (description && description.length > 500) {
      return renderError("Description must be 500 characters or less");
    }

    // Use internal API client to create project
    const apiClient = createApiClient(c);
    const result = await apiClient.post<CreateProjectResponse>("/projects", {
      name,
      repositories,
      description,
      agentSubpath,
      ...(instructions && { instructions }),
    });

    if (!result.success) {
      return renderError(
        result.error,
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

    const managedRepositories =
      await mimoContext.repos.managedRepositories.findByOwner(user.username);
    return c.html(
      <ProjectEditPage
        project={result.data.project}
        repositories={managedRepositories}
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
    const description = body.description as string | undefined;
    const instructions = body.instructions as string | undefined;
    const managedRepositories =
      await mimoContext.repos.managedRepositories.findByOwner(user.username);

    const renderError = (error: string, status = 400) =>
      c.html(
        <ProjectEditPage
          project={currentProject}
          repositories={managedRepositories}
          error={error}
        />,
        status,
      );

    const repositories = buildPickedRepositories(body, managedRepositories);

    if (!name) {
      return renderError("Project name is required");
    }
    if (repositories.length === 0) {
      return renderError("Pick at least one repository for the project");
    }
    if (description && description.length > 500) {
      return renderError("Description must be 500 characters or less");
    }

    // Use internal API client to update project
    const result = await apiClient.put<{ project: typeof currentProject }>(
      `/projects/${id}`,
      {
        name,
        repositories,
        description,
        ...(instructions !== undefined && { instructions }),
      },
    );

    if (!result.success) {
      return renderError(
        result.error,
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

  // GET /projects/:id/features - List project features (JSON)
  projects.get("/:id/features", auth, async (c) => {
    const id = c.req.param("id");
    const apiClient = createApiClient(c);
    const projectResult = await apiClient.get<GetProjectResponse>(
      `/projects/${id}`,
    );
    if (!projectResult.success) {
      if (projectResult.status === 404) {
        return c.json({ error: "Project not found" }, 404);
      }
      return c.text(
        `Failed to load project: ${projectResult.error}`,
        projectResult.status,
      );
    }
    const result = await apiClient.get<ListFeaturesResponse>(
      `/projects/${id}/features`,
    );
    if (!result.success) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ features: result.data.features });
  });

  // POST /projects/:id/features - Create a feature (JSON)
  projects.post("/:id/features", auth, async (c) => {
    const id = c.req.param("id");
    const apiClient = createApiClient(c);
    const projectResult = await apiClient.get<GetProjectResponse>(
      `/projects/${id}`,
    );
    if (!projectResult.success) {
      if (projectResult.status === 404) {
        return c.json({ error: "Project not found" }, 404);
      }
      return c.text(
        `Failed to load project: ${projectResult.error}`,
        projectResult.status,
      );
    }
    const body = await c.req.json();
    const result = await apiClient.post<{ feature: FeatureResponse }>(
      `/projects/${id}/features`,
      {
        branchName: body.branchName,
        description: body.description,
      },
    );
    if (!result.success) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ feature: result.data.feature }, 201);
  });

  // PUT /projects/:id/features/:featureId - Update a feature (JSON)
  projects.put("/:id/features/:featureId", auth, async (c) => {
    const id = c.req.param("id");
    const featureId = c.req.param("featureId");
    const apiClient = createApiClient(c);
    const projectResult = await apiClient.get<GetProjectResponse>(
      `/projects/${id}`,
    );
    if (!projectResult.success) {
      if (projectResult.status === 404) {
        return c.json({ error: "Project not found" }, 404);
      }
      return c.text(
        `Failed to load project: ${projectResult.error}`,
        projectResult.status,
      );
    }
    const body = await c.req.json();
    const result = await apiClient.put<{ feature: FeatureResponse }>(
      `/projects/${id}/features/${featureId}`,
      body,
    );
    if (!result.success) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ feature: result.data.feature });
  });

  // DELETE /projects/:id/features/:featureId - Delete a feature (JSON)
  projects.delete("/:id/features/:featureId", auth, async (c) => {
    const id = c.req.param("id");
    const featureId = c.req.param("featureId");
    const apiClient = createApiClient(c);
    const projectResult = await apiClient.get<GetProjectResponse>(
      `/projects/${id}`,
    );
    if (!projectResult.success) {
      if (projectResult.status === 404) {
        return c.json({ error: "Project not found" }, 404);
      }
      return c.text(
        `Failed to load project: ${projectResult.error}`,
        projectResult.status,
      );
    }
    const result = await apiClient.delete<{ success: true }>(
      `/projects/${id}/features/${featureId}`,
    );
    if (!result.success) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ success: true });
  });

  // Nested session routes
  projects.route("/:projectId/sessions", sessions);

  return projects;
}
