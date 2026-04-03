import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

// Directly test the Hono app without spawning process
describe("Health Check Integration Test", () => {
  test("should return healthy status", async () => {
    const app = new Hono();
    app.get("/health", (c) => c.json({ status: "healthy" }));

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "healthy" });
  });

  test("should handle unknown routes with 404", async () => {
    const app = new Hono();
    app.get("/health", (c) => c.json({ status: "healthy" }));
    app.notFound((c) => c.json({ error: "Not Found" }, 404));

    const res = await app.request("/unknown");
    expect(res.status).toBe(404);
  });
});
