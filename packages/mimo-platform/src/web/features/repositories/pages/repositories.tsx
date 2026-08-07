// SPDX-License-Identifier: AGPL-3.0-only
import { Hono } from "hono";
import { createAuthMiddleware } from "../../../../auth/middleware";
import { RepositoriesListPage } from "../components/RepositoriesListPage";
import { RepositoryCreatePage } from "../components/RepositoryCreatePage";
import { RepositoryEditPage } from "../components/RepositoryEditPage";
import type { MimoContext } from "../../../../infrastructure/context/mimo-context.js";
import type {
  RepositoryResponse,
  ReferencingProject,
} from "../../../../api/rest/repositories/types.js";
import type { ListCredentialsResponse } from "../../../../api/rest/credentials/types.js";
import { createInternalApiClient } from "../../../../api/rest/index.js";

export function createRepositoriesRoutes(mimoContext: MimoContext): Hono {
  const auth = createAuthMiddleware(mimoContext.services.auth);
  const repositories = new Hono();

  // List all repositories (GET /repositories)
  repositories.get("/", auth, async (c) => {
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.get<{ repositories: RepositoryResponse[] }>(
      "/repositories",
    );

    if (!result.success) {
      return c.text(
        `Failed to load repositories: ${result.error}`,
        result.status,
      );
    }

    const credentialsResult =
      await apiClient.get<ListCredentialsResponse>("/credentials");
    const credentials = credentialsResult.success
      ? credentialsResult.data.credentials
      : [];

    return c.html(
      <RepositoriesListPage
        repositories={result.data.repositories}
        credentials={credentials}
      />,
    );
  });

  // Show create form (GET /repositories/new)
  repositories.get("/new", auth, async (c) => {
    const apiClient = createInternalApiClient(c, mimoContext);
    const credentialsResult =
      await apiClient.get<ListCredentialsResponse>("/credentials");
    const credentials = credentialsResult.success
      ? credentialsResult.data.credentials
      : [];

    return c.html(<RepositoryCreatePage credentials={credentials} />);
  });

  // Create repository (POST /repositories)
  repositories.post("/", auth, async (c) => {
    const apiClient = createInternalApiClient(c, mimoContext);
    const credentialsResult =
      await apiClient.get<ListCredentialsResponse>("/credentials");
    const credentials = credentialsResult.success
      ? credentialsResult.data.credentials
      : [];

    const body = await c.req.parseBody();
    const name = body.name as string;
    const repoUrl = body.repoUrl as string;
    const repoType = body.repoType as string;
    const credentialId = (body.credentialId as string) || undefined;
    const clonePortRaw = (body.clonePort as string)?.trim();
    const clonePort = clonePortRaw ? Number(clonePortRaw) : undefined;

    if (!name || !repoUrl) {
      return c.html(
        <RepositoryCreatePage
          credentials={credentials}
          error="Repository name and URL are required"
        />,
        400,
      );
    }
    if (repoType !== "git" && repoType !== "fossil") {
      return c.html(
        <RepositoryCreatePage
          credentials={credentials}
          error="Invalid repository type"
        />,
        400,
      );
    }
    if (
      clonePort !== undefined &&
      (!Number.isInteger(clonePort) || clonePort < 1 || clonePort > 65535)
    ) {
      return c.html(
        <RepositoryCreatePage
          credentials={credentials}
          error="Clone port must be a number between 1 and 65535"
        />,
        400,
      );
    }

    const result = await apiClient.post<{ repository: RepositoryResponse }>(
      "/repositories",
      {
        name,
        repoUrl,
        repoType,
        ...(credentialId ? { credentialId } : {}),
        ...(clonePort !== undefined ? { clonePort } : {}),
      },
    );

    if (!result.success) {
      return c.html(
        <RepositoryCreatePage credentials={credentials} error={result.error} />,
        result.status >= 400 && result.status < 500 ? result.status : 400,
      );
    }

    return c.redirect("/repositories", 302);
  });

  // Edit form (GET /repositories/:id/edit)
  repositories.get("/:id/edit", auth, async (c) => {
    const id = c.req.param("id");
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.get<{ repository: RepositoryResponse }>(
      `/repositories/${id}`,
    );

    if (!result.success) {
      if (result.status === 404) {
        return c.notFound();
      }
      return c.text(
        `Failed to load repository: ${result.error}`,
        result.status,
      );
    }

    const credentialsResult =
      await apiClient.get<ListCredentialsResponse>("/credentials");
    const credentials = credentialsResult.success
      ? credentialsResult.data.credentials
      : [];

    const referencingResult = await apiClient.get<{
      projects: ReferencingProject[];
    }>(`/repositories/${id}/referencing-projects`);
    const referencingProjects = referencingResult.success
      ? referencingResult.data.projects
      : [];

    return c.html(
      <RepositoryEditPage
        repository={result.data.repository}
        credentials={credentials}
        referencingProjects={referencingProjects}
      />,
    );
  });

  // Update repository (POST /repositories/:id/edit)
  repositories.post("/:id/edit", auth, async (c) => {
    const id = c.req.param("id");
    const apiClient = createInternalApiClient(c, mimoContext);

    const getResult = await apiClient.get<{ repository: RepositoryResponse }>(
      `/repositories/${id}`,
    );
    if (!getResult.success) {
      if (getResult.status === 404) {
        return c.notFound();
      }
      return c.text(
        `Failed to load repository: ${getResult.error}`,
        getResult.status,
      );
    }
    const repository = getResult.data.repository;

    const credentialsResult =
      await apiClient.get<ListCredentialsResponse>("/credentials");
    const credentials = credentialsResult.success
      ? credentialsResult.data.credentials
      : [];

    const renderError = (error: string, status = 400) =>
      c.html(
        <RepositoryEditPage
          repository={repository}
          credentials={credentials}
          referencingProjects={[]}
          error={error}
        />,
        status,
      );

    const body = await c.req.parseBody();
    const name = body.name as string;
    const repoUrl = body.repoUrl as string;
    const repoType = body.repoType as string;
    const credentialId = body.credentialId as string;
    const clonePortRaw = (body.clonePort as string)?.trim();

    if (!name || !repoUrl) {
      return renderError("Repository name and URL are required");
    }
    if (repoType !== "git" && repoType !== "fossil") {
      return renderError("Invalid repository type");
    }

    let clonePort: number | null = null;
    if (clonePortRaw) {
      const parsed = Number(clonePortRaw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        return renderError("Clone port must be a number between 1 and 65535");
      }
      clonePort = parsed;
    }

    const result = await apiClient.put<{ repository: RepositoryResponse }>(
      `/repositories/${id}`,
      {
        name,
        repoUrl,
        repoType,
        credentialId: credentialId || null,
        clonePort,
      },
    );

    if (!result.success) {
      return renderError(
        result.error,
        result.status >= 400 && result.status < 500 ? result.status : 400,
      );
    }

    return c.redirect("/repositories", 302);
  });

  // Delete repository (POST /repositories/:id/delete)
  repositories.post("/:id/delete", auth, async (c) => {
    const id = c.req.param("id");
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.delete<{ success: true }>(
      `/repositories/${id}`,
    );

    if (!result.success) {
      if (result.status === 404) {
        return c.notFound();
      }
      if (result.status === 409) {
        const listResult = await apiClient.get<{
          repositories: RepositoryResponse[];
        }>("/repositories");
        const credentialsResult =
          await apiClient.get<ListCredentialsResponse>("/credentials");
        return c.html(
          <RepositoriesListPage
            repositories={
              listResult.success ? listResult.data.repositories : []
            }
            credentials={
              credentialsResult.success
                ? credentialsResult.data.credentials
                : []
            }
            error={result.error}
          />,
          409,
        );
      }
      return c.text(
        `Failed to delete repository: ${result.error}`,
        result.status,
      );
    }

    return c.redirect("/repositories", 302);
  });

  return repositories;
}
