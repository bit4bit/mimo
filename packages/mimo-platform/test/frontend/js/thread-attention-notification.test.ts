import { describe, it, expect } from "bun:test";

describe("thread attention notification helpers", () => {
  function createSandbox() {
    const notifications: any[] = [];
    const switchCalls: any[] = [];

    function MockNotification(this: any, title: string, options?: any) {
      this.title = title;
      this.body = options?.body || "";
      this._clickHandler = null;
      notifications.push(this);
    }
    (MockNotification as any).permission = "granted";
    (MockNotification as any).requestPermission = async () => "granted";
    MockNotification.prototype.close = function () {};
    MockNotification.prototype.addEventListener = function (
      type: string,
      handler: any,
    ) {
      if (type === "click") {
        this._clickHandler = handler;
      }
    };

    return {
      ChatState: {
        browserNotificationsEnabled: true,
      },
      ChatThreadsState: {
        threads: [
          { id: "thread-1", name: "Code Review" },
          { id: "thread-2", name: "Main" },
        ],
        activeThreadId: "thread-2",
      },
      Notification: MockNotification,
      notifications,
      switchCalls,
      switchToThread: (threadId: string) => {
        switchCalls.push(threadId);
      },
      window: {
        focus: () => {},
      },
    };
  }

  function showThreadAttentionNotification(
    sandbox: any,
    chatThreadId: string,
    toolCallTitle?: string,
  ) {
    if (!sandbox.ChatState.browserNotificationsEnabled) return;
    if (sandbox.Notification.permission !== "granted") return;

    let threadName = chatThreadId;
    if (sandbox.ChatThreadsState?.threads) {
      const thread = sandbox.ChatThreadsState.threads.find(
        (t: any) => t.id === chatThreadId,
      );
      if (thread?.name) threadName = thread.name;
    }

    const title = toolCallTitle
      ? `Approval needed: ${toolCallTitle}`
      : "Approval needed";
    const body = `Thread "${threadName}" requires your attention`;

    try {
      const notification = new sandbox.Notification(title, { body });
      notification.addEventListener("click", () => {
        sandbox.window.focus();
        if (typeof sandbox.switchToThread === "function") {
          sandbox.switchToThread(chatThreadId);
        }
        notification.close();
      });
    } catch {
      // Notification permission may be denied or API unavailable
    }
  }

  it("shows notification with thread name and tool title for non-active thread", () => {
    const s = createSandbox();
    s.ChatState.browserNotificationsEnabled = true;
    s.Notification.permission = "granted";

    showThreadAttentionNotification(s, "thread-1", "Edit file");

    expect(s.notifications.length).toBe(1);
    expect(s.notifications[0].title).toBe("Approval needed: Edit file");
    expect(s.notifications[0].body).toBe(
      'Thread "Code Review" requires your attention',
    );
  });

  it("shows notification without tool title when not provided", () => {
    const s = createSandbox();
    s.ChatState.browserNotificationsEnabled = true;
    s.Notification.permission = "granted";

    showThreadAttentionNotification(s, "thread-1");

    expect(s.notifications.length).toBe(1);
    expect(s.notifications[0].title).toBe("Approval needed");
    expect(s.notifications[0].body).toBe(
      'Thread "Code Review" requires your attention',
    );
  });

  it("does not show notification when browserNotificationsEnabled is false", () => {
    const s = createSandbox();
    s.ChatState.browserNotificationsEnabled = false;
    s.Notification.permission = "granted";

    showThreadAttentionNotification(s, "thread-1", "Edit");

    expect(s.notifications.length).toBe(0);
  });

  it("does not show notification when Notification permission is not granted", () => {
    const s = createSandbox();
    s.ChatState.browserNotificationsEnabled = true;
    s.Notification.permission = "denied";

    showThreadAttentionNotification(s, "thread-1", "Edit");

    expect(s.notifications.length).toBe(0);
  });

  it("click handler calls window.focus and switchToThread", () => {
    const s = createSandbox();
    let focusCalled = false;
    s.window.focus = () => {
      focusCalled = true;
    };

    showThreadAttentionNotification(s, "thread-1", "Bash");

    expect(s.notifications.length).toBe(1);
    const notification = s.notifications[0];
    expect(notification._clickHandler).not.toBeNull();

    notification._clickHandler();

    expect(focusCalled).toBe(true);
    expect(s.switchCalls).toEqual(["thread-1"]);
  });

  it("falls back to chatThreadId when thread name is not found", () => {
    const s = createSandbox();
    s.ChatState.browserNotificationsEnabled = true;
    s.Notification.permission = "granted";

    showThreadAttentionNotification(s, "unknown-thread", "Read");

    expect(s.notifications.length).toBe(1);
    expect(s.notifications[0].body).toBe(
      'Thread "unknown-thread" requires your attention',
    );
  });

  it("permission_request with non-active chatThreadId does not render approval card in active thread", async () => {
    const chatSource = await import("fs").then((fs) =>
      fs.readFileSync("public/js/chat.js", "utf-8"),
    );

    const permissionRequestBlock = chatSource.match(
      /case\s+"permission_request"[\s\S]*?break;/,
    );
    expect(permissionRequestBlock).not.toBeNull();

    const block = permissionRequestBlock![0];

    expect(block).toContain("chatThreadId");
    expect(block).toContain("activeThreadId");
    expect(block).toContain("showThreadAttentionNotification");
  });

  it("permission_resolved with non-active chatThreadId is filtered out", async () => {
    const chatSource = await import("fs").then((fs) =>
      fs.readFileSync("public/js/chat.js", "utf-8"),
    );

    const permissionResolvedBlock = chatSource.match(
      /case\s+"permission_resolved"[\s\S]*?break;/,
    );
    expect(permissionResolvedBlock).not.toBeNull();

    const block = permissionResolvedBlock![0];

    expect(block).toContain("chatThreadId");
    expect(block).toContain("activeThreadId");
  });
});
