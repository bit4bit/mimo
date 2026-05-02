/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import type { MimoContext } from "../../../../infrastructure/context/mimo-context.js";
import { LoginPage } from "../components/LoginPage.js";
import { RegisterPage } from "../components/RegisterPage.js";
import type { StatusCode } from "hono/utils/http-status";

type AuthRoutesContext = Pick<MimoContext, "services" | "repos" | "env">;

export function createAuthRoutes(mimoContext: AuthRoutesContext) {
  const auth = new Hono();

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

    // Check if username already exists
    const existingUser = await mimoContext.repos.users.getCredentials(username);
    if (existingUser) {
      return c.html(<RegisterPage error="Username already exists" />, 409);
    }

    // Hash password and create user
    const passwordHash = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: 10,
    });

    await mimoContext.repos.users.create(username, passwordHash);

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

    // Get user credentials
    const credentials = await mimoContext.repos.users.getCredentials(username);
    if (!credentials) {
      return c.html(<LoginPage error="Invalid credentials" />, 401);
    }

    // Verify password
    const isValidPassword = await Bun.password.verify(
      password,
      credentials.passwordHash,
    );
    if (!isValidPassword) {
      return c.html(<LoginPage error="Invalid credentials" />, 401);
    }

    // Generate token
    const token = await mimoContext.services.auth.generateToken(username);

    // Set cookie with token and username
    c.header(
      "Set-Cookie",
      `token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Strict`,
    );
    c.header(
      "Set-Cookie",
      `username=${encodeURIComponent(username)}; Path=/; Max-Age=604800; SameSite=Strict`,
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
