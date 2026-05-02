import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";

describe("Debug Project Tests", () => {
  it("should debug the issue", async () => {
    const testHome = join(tmpdir(), `debug-test-${Date.now()}`);

    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    const { createMimoContext } =
      await import("../src/context/mimo-context.ts");
    const mimoContext = createMimoContext({
      env: {
        MIMO_HOME: testHome,
        JWT_SECRET: "test-secret-key-for-testing",
        PLATFORM_URL: "http://localhost:3000",
        PORT: 3000,
      },
    });

    const { createInternalApiRouter } =
      await import("../src/api/internal/index.ts");
    const { createProjectsRoutes } = await import("../src/projects/routes.tsx");

    const app = new Hono();
    const internalRouter = createInternalApiRouter(mimoContext);
    app.route("/api/internal", internalRouter);

    const projects = createProjectsRoutes(mimoContext, {
      fetchFn: (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = url.toString();
        console.log("[DEBUG] fetchFn called with URL:", urlStr);
        console.log("[DEBUG] fetchFn init:", JSON.stringify(init, null, 2));

        if (urlStr.includes("/api/internal/")) {
          const path = new URL(urlStr).pathname;
          console.log("[DEBUG] Routing to path:", path);
          return app.request(path, init);
        }
        return fetch(url, init);
      },
    });
    app.route("/projects", projects);

    // Create user and token
    await mimoContext.repos.users.create(
      "testuser",
      await Bun.password.hash("testpass", { algorithm: "bcrypt", cost: 10 }),
    );
    const token = await mimoContext.services.auth.generateToken("testuser");
    console.log("[DEBUG] Generated token:", token.substring(0, 20) + "...");

    // Make request
    const formData = new URLSearchParams();
    formData.append("name", "My Test Project");
    formData.append("repoUrl", "https://github.com/user/repo.git");
    formData.append("repoType", "git");

    const res = await app.request("/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `token=${token}`,
      },
      body: formData.toString(),
    });

    console.log("[DEBUG] Response status:", res.status);
    console.log("[DEBUG] Response headers:", res.headers);
    const body = await res.text();
    console.log("[DEBUG] Response body:", body.substring(0, 500));

    expect(res.status).toBe(302);
  });
});
