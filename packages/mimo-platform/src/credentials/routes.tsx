import { Hono } from "hono";
import type { Credential } from "../credentials/repository";
import { authMiddleware } from "../auth/middleware";
import { CredentialsListPage } from "../components/CredentialsListPage";
import { CredentialCreatePage } from "../components/CredentialCreatePage";
import { CredentialEditPage } from "../components/CredentialEditPage";
import type { MimoContext } from "../context/mimo-context.js";
import type {
  ListCredentialsResponse,
  GetCredentialResponse,
} from "../api/internal/credentials/types.js";
import { createInternalApiClient } from "../api/internal/index.js";

export function createCredentialsRoutes(mimoContext: MimoContext): Hono {
  const credentials = new Hono();

  // List all credentials (GET /credentials)
  credentials.get("/", authMiddleware, async (c) => {
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.get<ListCredentialsResponse>("/credentials");

    if (!result.success) {
      return c.text(`Failed to load credentials: ${result.error}`, result.status);
    }

    return c.html(
      <CredentialsListPage credentials={result.data.credentials as Credential[]} />,
    );
  });

  // Show create form (GET /credentials/new)
  credentials.get("/new", authMiddleware, (c) => {
    return c.html(<CredentialCreatePage />);
  });

  // Create credential (POST /credentials)
  credentials.post("/", authMiddleware, async (c) => {
    const body = await c.req.parseBody();
    const name = body.name as string;
    const type = (body.type as string) || "https";

    if (!name) {
      return c.html(
        <CredentialCreatePage error="Credential name is required" />,
        400,
      );
    }

    if (type !== "https" && type !== "ssh") {
      return c.html(
        <CredentialCreatePage error="Invalid credential type" />,
        400,
      );
    }

    // Build request body for internal API
    let requestBody: {
      name: string;
      type: "https" | "ssh";
      username?: string;
      password?: string;
      privateKey?: string;
    } = {
      name,
      type: type as "https" | "ssh",
    };

    if (type === "https") {
      const username = body.username as string;
      const password = body.password as string;

      if (!username || !password) {
        return c.html(
          <CredentialCreatePage error="Username and password are required for HTTPS credentials" />,
          400,
        );
      }

      requestBody.username = username;
      requestBody.password = password;
    } else {
      // SSH credential
      const privateKey = body.privateKey as string;

      if (!privateKey) {
        return c.html(
          <CredentialCreatePage error="Private key is required for SSH credentials" />,
          400,
        );
      }

      requestBody.privateKey = privateKey;
    }

    // Use internal API client to create credential
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.post<{ credential: Credential }>("/credentials", requestBody);

    if (!result.success) {
      return c.html(
        <CredentialCreatePage error={result.error} />,
        result.status >= 400 && result.status < 500 ? result.status : 400,
      );
    }

    return c.redirect("/credentials", 302);
  });

  // Edit form (GET /credentials/:id/edit)
  credentials.get("/:id/edit", authMiddleware, async (c) => {
    const id = c.req.param("id");
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.get<GetCredentialResponse>(`/credentials/${id}`);

    if (!result.success) {
      if (result.status === 404) {
        return c.notFound();
      }
      return c.text(`Failed to load credential: ${result.error}`, result.status);
    }

    return c.html(<CredentialEditPage credential={result.data.credential as Credential} />);
  });

  // Update credential (POST /credentials/:id/edit)
  credentials.post("/:id/edit", authMiddleware, async (c) => {
    const id = c.req.param("id");
    const apiClient = createInternalApiClient(c, mimoContext);

    // First get the current credential to populate error page if needed
    const getResult = await apiClient.get<GetCredentialResponse>(`/credentials/${id}`);

    if (!getResult.success) {
      if (getResult.status === 404) {
        return c.notFound();
      }
      return c.text(`Failed to load credential: ${getResult.error}`, getResult.status);
    }

    const credential = getResult.data.credential;
    const body = await c.req.parseBody();
    const name = body.name as string;

    if (!name) {
      return c.html(
        <CredentialEditPage
          credential={credential as Credential}
          error="Credential name is required"
        />,
        400,
      );
    }

    // Build request body for internal API
    let requestBody: { name?: string; username?: string; password?: string; privateKey?: string } =
      {
        name,
      };

    if (credential.type === "https") {
      const username = body.username as string;
      const password = body.password as string;

      if (username) requestBody.username = username;
      if (password) requestBody.password = password;
    } else {
      // SSH credential
      const privateKey = body.privateKey as string;

      if (privateKey) requestBody.privateKey = privateKey;
    }

    // Use internal API client to update credential
    const result = await apiClient.put<{ credential: Credential }>(
      `/credentials/${id}`,
      requestBody,
    );

    if (!result.success) {
      return c.html(
        <CredentialEditPage credential={credential as Credential} error={result.error} />,
        result.status >= 400 && result.status < 500 ? result.status : 400,
      );
    }

    return c.redirect("/credentials", 302);
  });

  // Delete credential (POST /credentials/:id/delete)
  credentials.post("/:id/delete", authMiddleware, async (c) => {
    const id = c.req.param("id");
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.delete<{ deleted: true }>(`/credentials/${id}`);

    if (!result.success) {
      if (result.status === 404) {
        return c.notFound();
      }
      return c.text(`Failed to delete credential: ${result.error}`, result.status);
    }

    return c.redirect("/credentials", 302);
  });

  return credentials;
}
