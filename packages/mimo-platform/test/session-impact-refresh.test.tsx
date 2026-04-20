import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { SessionDetailPage } from "../src/components/SessionDetailPage";

describe("Session impact refresh UI", () => {
  it("renders refresh controls and removes 5s impact polling", async () => {
    const app = new Hono();

    app.get("/", (c) => {
      return c.html(
        <SessionDetailPage
          project={{ id: "p1", name: "Project" }}
          session={{
            id: "s1",
            name: "Session",
            branch: "feature/top-nav",
            status: "active",
            upstreamPath: "/tmp/upstream",
            agentWorkspacePath: "/tmp/workspace",
            createdAt: new Date(),
          }}
          chatHistory={[]}
          frameState={{
            leftFrame: { activeBufferId: "chat" },
            rightFrame: { activeBufferId: "impact" },
          }}
        />,
      );
    });

    const response = await app.request("/");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("impact-refresh-btn");
    expect(html).toContain("impact-stale-badge");
    expect(html).toContain("impact-calculating-badge");
    expect(html).toContain("Click Refresh to calculate impact metrics");
    expect(html).toContain("| Session");
    expect(html).toContain("| feature/top-nav");
    expect(html).not.toContain("setInterval(fetchImpact, 5000)");
  });
});
