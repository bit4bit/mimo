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
  patchNavigate?: (direction: number) => boolean;
  commitOpen?: boolean;
  commitNavigate?: (direction: number) => boolean;
}

// Boot session-keybindings.js against a minimal fake DOM and return a function
// that dispatches synthetic keydown events through the registered handler.
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
    MIMO_PATCH_BUFFER: {
      navigateChange: options.patchNavigate || (() => false),
    },
    MIMO_COMMIT: {
      isOpen: () => options.commitOpen === true,
      navigateChange: options.commitNavigate || (() => false),
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

const altShiftArrowDown = {
  key: "ArrowDown",
  code: "ArrowDown",
  altKey: true,
  shiftKey: true,
};
const altShiftArrowUp = {
  key: "ArrowUp",
  code: "ArrowUp",
  altKey: true,
  shiftKey: true,
};

describe("change-navigation keybindings", () => {
  it("defaults nextChange to Alt+Shift+ArrowDown and previousChange to Alt+Shift+ArrowUp", () => {
    const calls: number[] = [];
    const dispatch = boot({
      activeLeftBuffer: "patches",
      patchNavigate: (d) => {
        calls.push(d);
        return true;
      },
    });

    dispatch(altShiftArrowDown);
    dispatch(altShiftArrowUp);

    expect(calls).toEqual([1, -1]);
  });

  it("honors overrides via window.MIMO_SESSION_KEYBINDINGS", () => {
    const calls: number[] = [];
    const dispatch = boot({
      activeLeftBuffer: "patches",
      sessionKeybindings: { nextChange: "Alt+Shift+J" },
      patchNavigate: (d) => {
        calls.push(d);
        return true;
      },
    });

    // Default chord no longer triggers nextChange after override.
    dispatch(altShiftArrowDown);
    expect(calls).toEqual([]);

    // The configured chord does.
    dispatch({ key: "j", code: "KeyJ", altKey: true, shiftKey: true });
    expect(calls).toEqual([1]);
  });

  it("does not fire while typing in an input when no diff surface is active", () => {
    const calls: number[] = [];
    const dispatch = boot({
      activeLeftBuffer: "chat",
      patchNavigate: (d) => {
        calls.push(d);
        return true;
      },
    });

    // Plain typing in a text input must not be intercepted.
    const prevented = dispatch({
      key: "a",
      code: "KeyA",
      target: { tagName: "INPUT", isContentEditable: false },
    });
    expect(prevented).toBe(false);

    // Even the chord does nothing when no diff surface is active.
    dispatch(altShiftArrowDown);
    expect(calls).toEqual([]);
  });

  it("routes to the commit dialog controller when the commit dialog is open", () => {
    const calls: number[] = [];
    const dispatch = boot({
      activeLeftBuffer: "chat",
      commitOpen: true,
      commitNavigate: (d) => {
        calls.push(d);
        return true;
      },
    });

    dispatch(altShiftArrowDown);
    dispatch(altShiftArrowUp);

    expect(calls).toEqual([1, -1]);
  });
});
