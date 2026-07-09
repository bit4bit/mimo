import { describe, it, expect, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const code = readFileSync(
  join(import.meta.dir, "../../../public/js/session-keybindings.js"),
  "utf-8",
);

interface HarnessOptions {
  activeLeftBuffer?: string | null;
  sessionKeybindings?: Record<string, string>;
  toggleExpertMode?: () => void;
}

function boot(options: HarnessOptions) {
  let handler: ((event: any) => void) | null = null;

  const activeLeftTab =
    options.activeLeftBuffer == null
      ? null
      : {
          getAttribute(attr: string) {
            return attr === "data-buffer-id" ? options.activeLeftBuffer : null;
          },
        };

  const fakeDocument = {
    readyState: "complete",
    addEventListener(type: string, fn: any) {
      if (type === "keydown") handler = fn;
    },
    querySelector(selector: string) {
      if (
        selector.includes('data-frame-id="left"') &&
        selector.includes(".active")
      ) {
        return activeLeftTab;
      }
      return null;
    },
  };

  const fakeWindow: any = {
    MIMO_SESSION_ID: "session-1",
    MIMO_SESSION_KEYBINDINGS: options.sessionKeybindings || {},
    MIMO_GLOBAL_KEYBINDINGS: {},
    EditBuffer: {
      toggleExpertMode: options.toggleExpertMode || (() => {}),
    },
  };

  (globalThis as any).window = fakeWindow;
  (globalThis as any).document = fakeDocument;

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  eval(code);

  if (!handler) throw new Error("keydown handler was not registered");

  return function dispatch(event: Partial<any>) {
    let prevented = false;
    handler!({
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      target: { tagName: "BODY", isContentEditable: false },
      preventDefault() {
        prevented = true;
      },
      ...event,
    });
    return prevented;
  };
}

afterEach(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
});

describe("expert-mode toggle keybinding (macOS Alt+Shift+E)", () => {
  it("fires on macOS where Option+Shift+E produces key='É' and code='KeyE'", () => {
    let toggled = false;
    const dispatch = boot({
      activeLeftBuffer: "edit",
      toggleExpertMode: () => {
        toggled = true;
      },
    });

    // macOS Option+Shift+E: event.key is the composed char "É",
    // event.code is the layout-independent "KeyE".
    dispatch({
      key: "É",
      code: "KeyE",
      altKey: true,
      shiftKey: true,
    });

    expect(toggled).toBe(true);
  });

  it("still fires on non-macOS where key='E' and code='KeyE'", () => {
    let toggled = false;
    const dispatch = boot({
      activeLeftBuffer: "edit",
      toggleExpertMode: () => {
        toggled = true;
      },
    });

    dispatch({
      key: "E",
      code: "KeyE",
      altKey: true,
      shiftKey: true,
    });

    expect(toggled).toBe(true);
  });

  it("does not fire on Alt+Shift without the E key", () => {
    let toggled = false;
    const dispatch = boot({
      activeLeftBuffer: "edit",
      toggleExpertMode: () => {
        toggled = true;
      },
    });

    dispatch({
      key: "É",
      code: "KeyA",
      altKey: true,
      shiftKey: true,
    });

    expect(toggled).toBe(false);
  });

  it("also fires on Ctrl+Shift+E (external keyboards without Alt/Option)", () => {
    let toggled = false;
    const dispatch = boot({
      activeLeftBuffer: "edit",
      toggleExpertMode: () => {
        toggled = true;
      },
    });

    dispatch({
      key: "E",
      code: "KeyE",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(toggled).toBe(true);
  });
});
