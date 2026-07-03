import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { registerHelpRoutes } from "../src/api/rest/help.js";

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

  it("contains FileTree buffer help entries", async () => {
    const app = new Hono();
    registerHelpRoutes(app);

    const res = await app.request("/api/help");
    const body = await res.json();

    expect(body["file-tree-tab-button"].title).toBe("Files Tab");
    expect(body["file-tree-tab-button"].content).toContain("FileTree");

    expect(body["file-tree-buffer-refresh-btn-button"].title).toBe(
      "Refresh File Tree",
    );

    expect(body["file-tree-root"]).toBeDefined();
    expect(body["file-tree-dir"]).toBeDefined();
    expect(body["file-tree-leaf"]).toBeDefined();
    expect(body["file-tree-leaf"].content).toContain("Edit");
  });
});
