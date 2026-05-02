/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { createAuthMiddleware } from "../../../../auth/middleware.js";
import { configValidator } from "../../../../domain/config/validator.js";
import { ConfigEditorPage } from "../components/ConfigEditorPage.js";
import type { Context } from "hono";
import type { MimoContext } from "../../../../infrastructure/context/mimo-context.js";
import type { Config } from "../../../../domain/config/service.js";
import { createInternalApiClient } from "../../../../api/rest/index.js";
import type {
  GetConfigResponse,
  UpdateConfigResponse,
} from "../../../../api/rest/config/types.js";

export function createConfigRoutes(mimoContext: MimoContext): Hono {
  const service = mimoContext.services.config;

  const router = new Hono();
  const auth = createAuthMiddleware(mimoContext.services.auth);

  // Apply auth middleware to all routes
  router.use("/*", auth);

  // GET /config - Show config editor
  router.get("/", async (c: Context) => {
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.get<GetConfigResponse>("/config");

    if (!result.success) {
      return c.text(`Failed to load config: ${result.error}`, result.status);
    }

    const config = result.data.config as Config;
    return c.html(<ConfigEditorPage config={config} />);
  });

  // POST /config - Update config
  router.post("/", async (c: Context) => {
    const body = await c.req.parseBody();
    const existingConfig = service.load();

    // Parse form data into config structure
    const newConfig = {
      theme: body.theme as "dark" | "light",
      fontSize: parseInt(body.fontSize as string, 10),
      fontFamily: body.fontFamily as string,
      sessionKeybindings: existingConfig.sessionKeybindings,
    };

    // Validate the config
    const validation = configValidator.validate(newConfig);

    if (validation.errors.length > 0) {
      return c.html(
        <ConfigEditorPage
          config={validation.sanitized}
          errors={validation.errors}
        />,
        400,
      );
    }

    // Save via internal API client
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.put<UpdateConfigResponse>(
      "/config",
      validation.sanitized,
    );

    if (!result.success) {
      return c.html(
        <ConfigEditorPage
          config={validation.sanitized}
          errors={[{ field: "general", message: result.error }]}
        />,
        result.status >= 400 && result.status < 500 ? result.status : 400,
      );
    }

    return c.html(
      <ConfigEditorPage config={result.data.config as Config} success={true} />,
    );
  });

  // POST /config/reset - Reset to defaults
  router.post("/reset", async (c: Context) => {
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.post<void>("/config/reset", {});

    if (!result.success) {
      return c.text(`Failed to reset config: ${result.error}`, result.status);
    }

    return c.redirect("/config");
  });

  // GET /config/api - Get config as JSON (for frontend)
  router.get("/api", async (c: Context) => {
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.get<GetConfigResponse>("/config");

    if (!result.success) {
      return c.json(
        { error: `Failed to load config: ${result.error}` },
        result.status,
      );
    }

    return c.json(result.data.config);
  });

  // POST /config/api - Update config via JSON API
  router.post("/api", async (c: Context) => {
    const body = await c.req.json();

    const validation = configValidator.validate(body);

    if (validation.errors.length > 0) {
      return c.json(
        {
          success: false,
          errors: validation.errors,
        },
        400,
      );
    }

    // Save via internal API client
    const apiClient = createInternalApiClient(c, mimoContext);
    const result = await apiClient.put<UpdateConfigResponse>(
      "/config",
      validation.sanitized,
    );

    if (!result.success) {
      return c.json(
        {
          success: false,
          errors: [{ field: "general", message: result.error }],
        },
        result.status >= 400 && result.status < 500 ? result.status : 400,
      );
    }

    return c.json({
      success: true,
      config: result.data.config,
    });
  });

  return router;
}
