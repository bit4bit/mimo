import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";
import bcrypt from "bcrypt";

// Re-import modules after setting up environment
let authRoutes: any;
let authMiddleware: any;
let userRepository: any;
let generateToken: any;
let verifyToken: any;

describe("Authentication Integration Tests", () => {
  const testHome = join(tmpdir(), `mimo-auth-test-${Date.now()}`);

  beforeEach(async () => {
    // Set up fresh environment
    process.env.MIMO_HOME = testHome;
    process.env.JWT_SECRET = "test-secret-key-for-testing";

    // Clean up from previous run
    try {
      rmSync(testHome, { recursive: true, force: true });
    } catch {}

    // Re-import to get fresh modules
    const pathsModule = await import("../src/config/paths.ts");
    pathsModule.ensureMimoHome();

    const userModule = await import("../src/auth/user.ts");
    userRepository = userModule.userRepository;

    const jwtModule = await import("../src/auth/jwt.ts");
    generateToken = jwtModule.generateToken;
    verifyToken = jwtModule.verifyToken;

    const authModule = await import("../src/auth/routes.tsx");
    authRoutes = authModule.default;

    const middlewareModule = await import("../src/auth/middleware.ts");
    authMiddleware = middlewareModule.authMiddleware;
  });

  describe("Registration", () => {
    it("should register a new user", async () => {
      const app = new Hono();
      app.route("/auth", authRoutes);

      const formData = new URLSearchParams();
      formData.append("username", "testuser");
      formData.append("password", "testpassword");

      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/auth/login");

      // Verify user was created
      const user = await userRepository.getCredentials("testuser");
      expect(user).not.toBeNull();
      expect(user?.username).toBe("testuser");
    });

    it("should reject duplicate usernames", async () => {
      const app = new Hono();
      app.route("/auth", authRoutes);

      // Create first user
      await userRepository.create("dupeuser", await bcrypt.hash("password1", 10));

      // Try to create duplicate
      const formData = new URLSearchParams();
      formData.append("username", "dupeuser");
      formData.append("password", "password2");

      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      expect(res.status).toBe(409);
    });

    it("should reject missing fields", async () => {
      const app = new Hono();
      app.route("/auth", authRoutes);

      const formData = new URLSearchParams();
      formData.append("username", "testuser");
      // No password

      const res = await app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("Login", () => {
    it("should login with valid credentials", async () => {
      const app = new Hono();
      app.route("/auth", authRoutes);

      // Create user first
      await userRepository.create("logintest", await bcrypt.hash("testpass123", 10));

      const formData = new URLSearchParams();
      formData.append("username", "logintest");
      formData.append("password", "testpass123");

      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/dashboard");

      // Check cookie was set
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toContain("token=");
      expect(setCookie).toContain("HttpOnly");
    });

    it("should reject invalid credentials", async () => {
      const app = new Hono();
      app.route("/auth", authRoutes);

      // Create user
      await userRepository.create("validuser", await bcrypt.hash("correctpass", 10));

      // Try wrong password
      const formData = new URLSearchParams();
      formData.append("username", "validuser");
      formData.append("password", "wrongpass");

      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      expect(res.status).toBe(401);
    });

    it("should reject non-existent user", async () => {
      const app = new Hono();
      app.route("/auth", authRoutes);

      const formData = new URLSearchParams();
      formData.append("username", "nonexistent");
      formData.append("password", "password");

      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      expect(res.status).toBe(401);
    });

    it("should reject missing fields", async () => {
      const app = new Hono();
      app.route("/auth", authRoutes);

      const formData = new URLSearchParams();
      formData.append("username", "test");
      // No password

      const res = await app.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("Logout", () => {
    it("should clear token cookie", async () => {
      const app = new Hono();
      app.route("/auth", authRoutes);

      const res = await app.request("/auth/logout", {
        method: "GET",
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/auth/login");

      // Check cookie was cleared
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toContain("token=");
      expect(setCookie).toContain("Max-Age=0");
    });
  });

  describe("Protected Routes", () => {
    it("should redirect to login without token", async () => {
      const app = new Hono();
      const { authMiddleware } = await import("../src/auth/middleware.ts");
      
      app.get("/projects", authMiddleware, (c) => {
        return c.text("Projects");
      });

      const res = await app.request("/projects");

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/auth/login");
    });

    it("should access protected route with valid token", async () => {
      const app = new Hono();
      const { authMiddleware } = await import("../src/auth/middleware.ts");
      
      app.get("/projects", authMiddleware, (c) => {
        return c.text("Projects");
      });

      // Generate valid token
      const token = await generateToken("testuser");

      const res = await app.request("/projects", {
        headers: { Cookie: `token=${token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("Projects");
    });

    it("should redirect with invalid token", async () => {
      const app = new Hono();
      const { authMiddleware } = await import("../src/auth/middleware.ts");
      
      app.get("/projects", authMiddleware, (c) => {
        return c.text("Projects");
      });

      const res = await app.request("/projects", {
        headers: { Cookie: "token=invalid.token.here" },
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/auth/login");
    });
  });

  describe("JWT Token Validation", () => {
    it("should verify valid token", async () => {
      const token = await generateToken("testuser");
      const payload = await verifyToken(token);

      expect(payload).not.toBeNull();
      expect(payload?.username).toBe("testuser");
    });

    it("should reject expired token", async () => {
      const token = await generateToken("testuser", "-1s");
      const payload = await verifyToken(token);

      expect(payload).toBeNull();
    });

    it("should reject invalid token", async () => {
      const payload = await verifyToken("invalid.token.here");
      expect(payload).toBeNull();
    });
  });
});
