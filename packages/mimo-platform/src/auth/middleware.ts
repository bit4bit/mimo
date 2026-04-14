import type { MiddlewareHandler } from "hono";
import { jwtService, type JwtService } from "./jwt.js";

export interface AuthContext {
  username: string;
}

export function createAuthMiddleware(auth: Pick<JwtService, "verifyToken"> = jwtService): MiddlewareHandler {
  return async (c, next) => {
    const cookie = c.req.header("Cookie");
    const tokenMatch = cookie?.match(/token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) {
      return c.redirect("/auth/login", 302);
    }

    const payload = await auth.verifyToken(token);
    if (!payload) {
      return c.redirect("/auth/login", 302);
    }

    c.set("user", payload);
    await next();
  };
}

export const authMiddleware: MiddlewareHandler = createAuthMiddleware();
