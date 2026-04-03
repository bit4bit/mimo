import { Hono } from "hono";
import { authMiddleware } from "../auth/middleware";
import { Layout } from "../components/Layout";

const protectedRouter = new Hono();

protectedRouter.get("/projects", authMiddleware, (c) => {
  return c.html(<Layout title="Projects"><div>Projects</div></Layout>);
});

export default protectedRouter;
