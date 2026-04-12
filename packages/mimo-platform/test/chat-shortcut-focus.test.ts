import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";

type MockElement = {
  className?: string;
  style: Record<string, string>;
  dataset: Record<string, string>;
  textContent: string;
  contentEditable?: string;
  tagName: string;
  addEventListener: (type: string, handler: (event: any) => void) => void;
  focus: () => void;
};

function createMockElement(tagName: string): MockElement {
  return {
    tagName,
    style: {},
    dataset: {},
    textContent: "",
    addEventListener: () => {},
    focus: () => {},
  };
}

function createMockDocument() {
  const listeners: Record<string, (event?: any) => void> = {};
  const selectors = new Map<string, any>();

  return {
    listeners,
    activeElement: null as any,
    head: {
      appendChild: () => {},
    },
    getElementById: () => null,
    createElement: (tag: string) => createMockElement(tag.toUpperCase()),
    addEventListener: (type: string, handler: (event?: any) => void) => {
      listeners[type] = handler;
    },
    querySelector: (selector: string) => selectors.get(selector) ?? null,
    setQuerySelector: (selector: string, value: any) => {
      selectors.set(selector, value);
    },
  };
}

describe("Chat keyboard shortcut focus", () => {
  it("focuses the editable chat input when Ctrl+M is pressed", () => {
    const source = readFileSync(
      join(import.meta.dir, "../public/js/chat.js"),
      "utf8",
    );

    const document = createMockDocument();
    const window = {
      location: { protocol: "http:", host: "localhost" },
      MIMO_SESSION_ID: undefined,
    } as any;

    vm.runInNewContext(source, {
      window,
      document,
      WebSocket: class {},
      fetch: async () => ({ ok: true }),
      navigator: { clipboard: { writeText: () => {} } },
      setTimeout,
      clearTimeout,
      console,
    });

    expect(typeof document.listeners.DOMContentLoaded).toBe("function");
    document.listeners.DOMContentLoaded();

    expect(typeof document.listeners.keydown).toBe("function");

    let focused = false;
    let prevented = false;
    const editableInput = createMockElement("DIV");
    editableInput.contentEditable = "true";
    editableInput.focus = () => {
      focused = true;
      document.activeElement = editableInput;
    };

    document.setQuerySelector(".editable-bubble .message-content", editableInput);

    document.listeners.keydown({
      key: "m",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      target: null,
      preventDefault: () => {
        prevented = true;
      },
    });

    expect(focused).toBe(true);
    expect(prevented).toBe(true);
  });
});
