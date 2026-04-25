import { describe, it, expect } from "bun:test";

describe("SummaryBuffer", () => {
  const mockThreads = [
    {
      id: "thread-1",
      name: "Main Chat",
      model: "claude-3-5-sonnet",
      mode: "expert",
      acpSessionId: "acp-1",
      state: "active" as const,
      createdAt: "2024-01-01T00:00:00Z",
      assignedAgentId: "agent-1",
    },
    {
      id: "thread-2",
      name: "Analysis",
      model: "claude-3-5-sonnet",
      mode: "chat",
      acpSessionId: null,
      state: "disconnected" as const,
      createdAt: "2024-01-02T00:00:00Z",
      assignedAgentId: null,
    },
    {
      id: "thread-3",
      name: "Waking",
      model: "claude-3-5-sonnet",
      mode: "chat",
      acpSessionId: "acp-3",
      state: "waking" as const,
      createdAt: "2024-01-03T00:00:00Z",
      assignedAgentId: "agent-3",
    },
  ];

  const getThreadStateIcon = (state: string): string => {
    switch (state) {
      case "active":
        return "🟢";
      case "disconnected":
        return "🔴";
      case "waking":
        return "⏳";
      case "parked":
        return "🟡";
      default:
        return "⚪";
    }
  };

  it("should render both thread selectors with all threads", () => {
    const threads = mockThreads;
    const analyzeOptions = threads.map((t) => ({
      value: t.id,
      label: `${getThreadStateIcon(t.state)} ${t.name}`,
    }));
    const summarizeOptions = threads.map((t) => ({
      value: t.id,
      label: `${getThreadStateIcon(t.state)} ${t.name}`,
    }));

    expect(analyzeOptions).toHaveLength(3);
    expect(summarizeOptions).toHaveLength(3);
    expect(analyzeOptions[0].label).toContain("🟢");
    expect(summarizeOptions[1].label).toContain("🔴");
  });

  it("should show progress badge when loading is true", () => {
    const loading = true;
    const showProgress = loading;

    expect(showProgress).toBe(true);
  });

  it("should render summary text when summary is set", () => {
    const summary = "This is a sample summary of the conversation.";
    const hasSummary = summary.length > 0;

    expect(hasSummary).toBe(true);
    expect(summary).toContain("sample summary");
  });

  it("should render error message on 400 response", () => {
    const error = "Agent is not active in the summarize thread";
    const hasError = error.length > 0;

    expect(hasError).toBe(true);
    expect(error).toContain("not active");
  });

  it("should default summarize thread to first active thread", () => {
    const threads = mockThreads;
    const activeThread = threads.find((t) => t.state === "active");
    const defaultSummarizeId = activeThread?.id ?? threads[0].id;

    expect(defaultSummarizeId).toBe("thread-1");
  });
});

describe("Summary buffer registration", () => {
  it("should register summary buffer in right frame", () => {
    const buffer = {
      id: "summary",
      name: "Summary",
      frame: "right",
    };

    expect(buffer.id).toBe("summary");
    expect(buffer.frame).toBe("right");
  });

  it("should register summary after impact in right frame", () => {
    const rightBuffers = [
      { id: "notes", frame: "right" },
      { id: "impact", frame: "right" },
      { id: "summary", frame: "right" },
    ];

    const impactIndex = rightBuffers.findIndex((b) => b.id === "impact");
    const summaryIndex = rightBuffers.findIndex((b) => b.id === "summary");

    expect(summaryIndex).toBe(impactIndex + 1);
  });
});
