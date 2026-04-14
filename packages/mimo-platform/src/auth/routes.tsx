import { Hono } from "hono";
import bcrypt from "bcrypt";
import type { MimoContext } from "../context/mimo-context.js";

type AuthRoutesContext = Pick<MimoContext, "services" | "repos">;

export function createAuthRoutes(mimoContext: AuthRoutesContext) {
  const auth = new Hono();
  const authService = mimoContext.services.auth;
  const userRepository = mimoContext.repos.users;

  // GET /auth/register - Show registration page (returns JSON in test mode)
  auth.get("/register", (c) => {
    return c.json({ message: "Registration page" });
  });

  // POST /auth/register - Process registration
  auth.post("/register", async (c) => {
    const body = await c.req.parseBody();
    const username = body.username as string;
    const password = body.password as string;

    if (!username || !password) {
      return c.json({ error: "Username and password required" }, 400);
    }

    const existingUser = await userRepository.getCredentials(username);
    if (existingUser) {
      return c.json({ error: "Username already exists" }, 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await userRepository.create(username, passwordHash);

    return c.redirect("/auth/login");
  });

  // GET /auth/login - Show login page (returns JSON in test mode)
  auth.get("/login", (c) => {
    return c.json({ message: "Login page" });
  });

  // POST /auth/login - Process login
  auth.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const username = body.username as string;
    const password = body.password as string;

    if (!username || !password) {
      return c.json({ error: "Username and password required" }, 400);
    }

    const credentials = await userRepository.getCredentials(username);
    if (!credentials) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const isValidPassword = await bcrypt.compare(
      password,
      credentials.passwordHash,
    );
    if (!isValidPassword) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const token = await authService.generateToken(username);

    // Set cookie with token
    c.header(
      "Set-Cookie",
      `token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Strict`,
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
    return c.redirect("/auth/login");
  });

  return auth;
}
