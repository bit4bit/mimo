/** @jsx jsx */
import { jsx } from "hono/jsx";
import { Hono } from "hono";
import type { MimoContext } from "../context/mimo-context.js";
import { LoginPage } from "../components/LoginPage.js";
import { RegisterPage } from "../components/RegisterPage.js";

type AuthRoutesContext = Pick<MimoContext, "services" | "repos">;

export function createAuthRoutes(mimoContext: AuthRoutesContext) {
  const auth = new Hono();
  const authService = mimoContext.services.auth;
  const userRepository = mimoContext.repos.users;

  // GET /auth/register - Show registration page
  auth.get("/register", (c) => {
    return c.html(<RegisterPage />);
  });

  // POST /auth/register - Process registration
  auth.post("/register", async (c) => {
    const body = await c.req.parseBody();
    const username = body.username as string;
    const password = body.password as string;

    if (!username || !password) {
      return c.html(
        <RegisterPage error="Username and password required" />,
        400,
      );
    }

    const existingUser = await userRepository.getCredentials(username);
    if (existingUser) {
      return c.html(<RegisterPage error="Username already exists" />, 409);
    }

    const passwordHash = await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
    await userRepository.create(username, passwordHash);

    return c.redirect("/auth/login");
  });

  // GET /auth/login - Show login page
  auth.get("/login", (c) => {
    return c.html(<LoginPage />);
  });

  // POST /auth/login - Process login
  auth.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const username = body.username as string;
    const password = body.password as string;

    if (!username || !password) {
      return c.html(<LoginPage error="Username and password required" />, 400);
    }

    const credentials = await userRepository.getCredentials(username);
    if (!credentials) {
      return c.html(<LoginPage error="Invalid credentials" />, 401);
    }

    const isValidPassword = await Bun.password.verify(
      password,
      credentials.passwordHash,
    );
    if (!isValidPassword) {
      return c.html(<LoginPage error="Invalid credentials" />, 401);
    }

    const token = await authService.generateToken(username);

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
