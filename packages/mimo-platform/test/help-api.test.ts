import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { registerHelpRoutes } from "../src/help/routes.js";

describe("GET /api/help", () => {
  it("returns default help content", async () => {
    const app = new Hono();
    registerHelpRoutes(app);

    const res = await app.request("/api/help");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("summary-buffer-summary-refresh-btn");
    expect(body).toHaveProperty("dashboard-stats-projects");
  });

  it("contains summary buffer help entry", async () => {
    const app = new Hono();
    registerHelpRoutes(app);

    const res = await app.request("/api/help");
    const body = await res.json();

    const summaryEntry = body["summary-buffer-summary-refresh-btn"];
    expect(summaryEntry.title).toBe("Refresh Summary");
    expect(summaryEntry.content).toContain("summary");
  });
});