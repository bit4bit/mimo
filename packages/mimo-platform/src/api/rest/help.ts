// SPDX-License-Identifier: AGPL-3.0-only
import type { Context } from "hono";
import { defaultHelpContent } from "../../domain/help/defaults.js";

export function registerHelpRoutes(app: {
  get: (path: string, handler: (c: Context) => Promise<Response>) => void;
}) {
  app.get("/api/help", async (c: Context) => {
    return c.json(defaultHelpContent);
  });
}
