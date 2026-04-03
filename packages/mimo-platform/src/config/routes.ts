/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import { authMiddleware } from "../auth/middleware.js";
import { configService } from "../config/service.js";
import { configValidator } from "../config/validator.js";
import { ConfigEditorPage } from "../components/ConfigEditorPage.js";
import type { Context } from "hono";

const router = new Hono();

// Apply auth middleware to all routes
router.use("/*", authMiddleware);

// GET /config - Show config editor
router.get("/", async (c: Context) => {
  const config = configService.load();
  return c.html(<ConfigEditorPage config={config} />);
});

// POST /config - Update config
router.post("/", async (c: Context) => {
  const body = await c.req.parseBody();
  
  // Parse form data into config structure
  const newConfig = {
    theme: body.theme as "dark" | "light",
    fontSize: parseInt(body.fontSize as string, 10),
    fontFamily: body.fontFamily as string,
    keybindings: {
      cancel_request: body["keybindings.cancel_request"] as string,
      commit: body["keybindings.commit"] as string,
      find_file: body["keybindings.find_file"] as string,
      switch_project: body["keybindings.switch_project"] as string,
      switch_session: body["keybindings.switch_session"] as string,
      focus_left: body["keybindings.focus_left"] as string,
      focus_center: body["keybindings.focus_center"] as string,
      focus_right: body["keybindings.focus_right"] as string,
    },
  };

  // Validate the config
  const validation = configValidator.validate(newConfig);
  
  // Check for duplicate keybindings
  const duplicateErrors = configValidator.checkDuplicateKeybindings(validation.sanitized.keybindings);
  validation.errors.push(...duplicateErrors);

  if (validation.errors.length > 0) {
    return c.html(
      <ConfigEditorPage 
        config={validation.sanitized} 
        errors={validation.errors}
      />,
      400
    );
  }

  // Save the config
  configService.save(validation.sanitized);

  return c.html(
    <ConfigEditorPage 
      config={validation.sanitized}
      success={true}
    />
  );
});

// POST /config/reset - Reset to defaults
router.post("/reset", async (c: Context) => {
  const { defaultConfig } = await import("../config/service.js");
  configService.save(defaultConfig);
  
  return c.redirect("/config");
});

// GET /config/api - Get config as JSON (for frontend)
router.get("/api", async (c: Context) => {
  const config = configService.load();
  return c.json(config);
});

// POST /config/api - Update config via JSON API
router.post("/api", async (c: Context) => {
  const body = await c.req.json();
  
  const validation = configValidator.validate(body);
  const duplicateErrors = configValidator.checkDuplicateKeybindings(validation.sanitized.keybindings);
  validation.errors.push(...duplicateErrors);

  if (validation.errors.length > 0) {
    return c.json({
      success: false,
      errors: validation.errors,
    }, 400);
  }

  configService.save(validation.sanitized);

  return c.json({
    success: true,
    config: validation.sanitized,
  });
});

export default router;