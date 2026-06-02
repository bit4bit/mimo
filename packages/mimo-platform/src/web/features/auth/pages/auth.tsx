// SPDX-License-Identifier: AGPL-3.0-only
/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import type { Context } from "hono";
import type { MimoContext } from "../../../../infrastructure/context/mimo-context.js";
import { LoginPage } from "../components/LoginPage.js";
import { RegisterPage } from "../components/RegisterPage.js";
import type { StatusCode } from "hono/utils/http-status";
import { createInternalApiClient } from "../../../../api/rest/index.js";
import type {
  LoginResponse,
  RegisterResponse,
} from "../../../../api/rest/auth/types.js";

type AuthRoutesContext = Pick<MimoContext, "services" | "repos" | "env">;

interface AuthRoutesDeps {
  /** Optional custom fetch function for testing (routes to internal API). */
  fetchFn?: typeof fetch;
}

export function createAuthRoutes(
  mimoContext: AuthRoutesContext,
  deps: AuthRoutesDeps = {},
) {
  const auth = new Hono();

  function createPublicApiClient(c: Context) {
    return createInternalApiClient(c, mimoContext as MimoContext, {
      fetchFn: deps.fetchFn,
      auth: "none",
    });
  }

  // GET /auth/register - Show registration page
  auth.get("/register", (c) => {
    return c.html(<RegisterPage />);
  });

  // POST /auth/register - Process registration directly
  auth.post("/register", async (c) => {
    const body = await c.req.parseBody();
    const username = body.username as string;
    const password = body.password as string;

    // Validate required fields
    if (!username || !password) {
      return c.html(
        <RegisterPage error="Username and password required" />,
        400,
      );
    }

    const result = await createPublicApiClient(c).post<RegisterResponse>(
      "/auth/register",
      { username, password },
    );

    if (!result.success) {
      return c.html(
        <RegisterPage error={result.error ?? "Registration failed"} />,
        result.status as StatusCode,
      );
    }

    return c.redirect("/auth/login");
  });

  // GET /auth/login - Show login page
  auth.get("/login", (c) => {
    return c.html(<LoginPage />);
  });

  // POST /auth/login - Process login directly
  auth.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const username = body.username as string;
    const password = body.password as string;

    // Validate required fields
    if (!username || !password) {
      return c.html(<LoginPage error="Username and password required" />, 400);
    }

    const result = await createPublicApiClient(c).post<LoginResponse>(
      "/auth/login",
      { username, password },
    );

    if (!result.success) {
      return c.html(
        <LoginPage error={result.error ?? "Invalid credentials"} />,
        result.status as StatusCode,
      );
    }

    const token = result.data.token as string;
    const authenticatedUsername =
      (result.data.username as string | undefined) ??
      (result.data.user?.username as string | undefined) ??
      username;

    // Set cookie with token and username
    c.header(
      "Set-Cookie",
      `token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Strict`,
    );
    c.header(
      "Set-Cookie",
      `username=${encodeURIComponent(authenticatedUsername)}; Path=/; Max-Age=604800; SameSite=Strict`,
      { append: true },
    );

    // Redirect to dashboard
    return c.redirect("/dashboard");
  });

  // GET /auth/logout - Clear session
  auth.get("/logout", (c) => {
    c.header(
      "Set-Cookie",
      `token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`,
    );
    c.header("Set-Cookie", `username=; Path=/; Max-Age=0; SameSite=Strict`, {
      append: true,
    });
    return c.redirect("/auth/login");
  });

  return auth;
}
