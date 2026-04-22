// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { authMiddleware } from "../auth/middleware.js";
import { configValidator } from "../config/validator.js";
import { ConfigEditorPage } from "../components/ConfigEditorPage.js";
import type { Context } from "hono";
import type { MimoContext } from "../context/mimo-context.js";

export function createConfigRoutes(mimoContext: MimoContext): Hono {
  const service = mimoContext.services.config;

  const router = new Hono();

  // Apply auth middleware to all routes
  router.use("/*", authMiddleware);

  // GET /config - Show config editor
  router.get("/", async (c: Context) => {
    const config = service.load();
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

    // Save the config
    service.save(validation.sanitized);

    return c.html(
      <ConfigEditorPage config={validation.sanitized} success={true} />,
    );
  });

  // POST /config/reset - Reset to defaults
  router.post("/reset", async (c: Context) => {
    const { defaultConfig } = await import("../config/service.js");
    service.save(defaultConfig);

    return c.redirect("/config");
  });

  // GET /config/api - Get config as JSON (for frontend)
  router.get("/api", async (c: Context) => {
    const config = service.load();
    return c.json(config);
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

    service.save(validation.sanitized);

    return c.json({
      success: true,
      config: validation.sanitized,
    });
  });

  return router;
}
