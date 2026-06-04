import { describe, it, expect } from "bun:test";

describe("browser notification helpers", () => {
  function createSandbox() {
    const notifications: any[] = [];

    function MockNotification(this: any, title: string) {
      this.title = title;
      notifications.push(this);
    }
    (MockNotification as any).permission = "default";
    (MockNotification as any).requestPermission = async () => "default";
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
      document: { hidden: false },
      window: {
        MIMO_BROWSER_NOTIFICATIONS_ENABLED: false,
        focus: () => {},
      },
      Notification: MockNotification,
      notifications,
      ChatState: {
        browserNotificationsEnabled: false,
      },
    };
  }

  // Inline the notification helpers (same logic as chat.js)
  function shouldShowNotification(sandbox: any) {
    if (!sandbox.ChatState.browserNotificationsEnabled) return false;
    if (!sandbox.document.hidden) return false;
    if (sandbox.Notification.permission !== "granted") return false;
    return true;
  }

  function showBrowserNotification(sandbox: any) {
    if (!shouldShowNotification(sandbox)) return;
    const notification = new sandbox.Notification("Response ready");
    notification.addEventListener("click", () => {
      if (typeof window !== "undefined") {
        window.focus();
      }
      notification.close();
    });
  }

  it("shouldShowNotification returns false when browserNotificationsEnabled is false", () => {
    const s = createSandbox();
    s.ChatState.browserNotificationsEnabled = false;
    s.document.hidden = true;
    s.Notification.permission = "granted";
    expect(shouldShowNotification(s)).toBe(false);
  });

  it("shouldShowNotification returns false when tab is visible", () => {
    const s = createSandbox();
    s.ChatState.browserNotificationsEnabled = true;
    s.document.hidden = false;
    s.Notification.permission = "granted";
    expect(shouldShowNotification(s)).toBe(false);
  });

  it("shouldShowNotification returns false when permission is not granted", () => {
    const s = createSandbox();
    s.ChatState.browserNotificationsEnabled = true;
    s.document.hidden = true;
    s.Notification.permission = "denied";
    expect(shouldShowNotification(s)).toBe(false);
  });

  it("shouldShowNotification returns true when all conditions are met", () => {
    const s = createSandbox();
    s.ChatState.browserNotificationsEnabled = true;
    s.document.hidden = true;
    s.Notification.permission = "granted";
    expect(shouldShowNotification(s)).toBe(true);
  });

  it("showBrowserNotification creates a Notification with title 'Response ready'", () => {
    const s = createSandbox();
    s.ChatState.browserNotificationsEnabled = true;
    s.document.hidden = true;
    s.Notification.permission = "granted";

    showBrowserNotification(s);

    expect(s.notifications.length).toBe(1);
    expect(s.notifications[0].title).toBe("Response ready");
  });

  it("showBrowserNotification does nothing when shouldShowNotification is false", () => {
    const s = createSandbox();
    s.ChatState.browserNotificationsEnabled = false;
    s.document.hidden = true;
    s.Notification.permission = "granted";

    showBrowserNotification(s);

    expect(s.notifications.length).toBe(0);
  });
});
