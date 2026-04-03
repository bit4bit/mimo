import type { MiddlewareHandler } from "hono";
import { verifyToken } from "./jwt.js";

export interface AuthContext {
  username: string;
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const cookie = c.req.header("Cookie");
  const tokenMatch = cookie?.match(/token=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : null;

  if (!token) {
    return c.redirect("/auth/login", 302);
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return c.redirect("/auth/login", 302);
  }

  c.set("user", payload);
  await next();
};
