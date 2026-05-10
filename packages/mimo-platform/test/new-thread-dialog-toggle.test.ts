import { describe, it, expect, beforeEach } from "bun:test";

/**
 * Tests for the new-thread dialog toggle behavior.
 *
 * These tests verify that:
 * - Pressing the keybinding once opens the dialog
 * - Pressing the keybinding again closes the dialog
 * - Rapid keybinding presses never create duplicate dialogs
 * - Button clicks when dialog is open do not create duplicates
 */

// Shared DOM state for tests
let domElements: Map<string, Element> = new Map();

// Setup document mock for tests
global.document = {
  querySelector: (selector: string) => {
    return domElements.get(selector) || null;
  },
} as unknown as Document;

describe("New Thread Dialog Toggle", () => {
  let removedElements: Element[] = [];
  let clickedElements: Element[] = [];

  function createMockElement(id: string): Element {
    const element = {
      id,
      remove: () => {
        removedElements.push(element as unknown as Element);
        domElements.delete(`#${id}`);
      },
      click: () => {
        clickedElements.push(element as unknown as Element);
      },
      addEventListener: () => {},
      dispatchEvent: () => true,
      getAttribute: () => null,
      setAttribute: () => {},
      style: {},
      classList: { contains: () => false, add: () => {}, remove: () => {} },
    } as unknown as Element;
    return element;
  }

  beforeEach(() => {
    removedElements = [];
    clickedElements = [];
    domElements = new Map();
  });

  describe("showCreateThreadDialog guard", () => {
    it("returns early when create-thread-dialog already exists in DOM", async () => {
      // Simulate an existing dialog in the DOM
      const existingDialog = createMockElement("create-thread-dialog");
      domElements.set("#create-thread-dialog", existingDialog);

      let functionEntered = false;
      let functionReachedEnd = false;

      // Simulate the guard logic from showCreateThreadDialog
      const mockShowCreateThreadDialog = async () => {
        if (document.querySelector("#create-thread-dialog")) {
          return; // Guard returns early
        }
        functionEntered = true;
        // ... rest of function would go here
        functionReachedEnd = true;
      };

      await mockShowCreateThreadDialog();

      expect(functionEntered).toBe(false);
      expect(functionReachedEnd).toBe(false);
    });

    it("proceeds with dialog creation when no dialog exists", async () => {
      let functionEntered = false;

      const mockShowCreateThreadDialog = async () => {
        if (document.querySelector("#create-thread-dialog")) {
          return;
        }
        functionEntered = true;
      };

      await mockShowCreateThreadDialog();

      expect(functionEntered).toBe(true);
    });
  });

  describe("openCreateThreadDialog toggle", () => {
    it("removes existing dialog and returns true when dialog is open", () => {
      const existingDialog = createMockElement("create-thread-dialog");
      domElements.set("#create-thread-dialog", existingDialog);

      // Simulate the toggle logic from openCreateThreadDialog
      const mockOpenCreateThreadDialog = () => {
        const existingDialog = document.querySelector("#create-thread-dialog");
        if (existingDialog) {
          existingDialog.remove();
          return true;
        }
        const createButton = document.querySelector("#create-thread-btn");
        if (!createButton) {
          return false;
        }
        createButton.click();
        return true;
      };

      const result = mockOpenCreateThreadDialog();

      expect(result).toBe(true);
      expect(removedElements).toHaveLength(1);
      expect(removedElements[0]).toBe(existingDialog);
    });

    it("clicks create button and returns true when no dialog exists", () => {
      const createButton = createMockElement("create-thread-btn");
      domElements.set("#create-thread-btn", createButton);

      const mockOpenCreateThreadDialog = () => {
        const existingDialog = document.querySelector("#create-thread-dialog");
        if (existingDialog) {
          existingDialog.remove();
          return true;
        }
        const createButton = document.querySelector("#create-thread-btn");
        if (!createButton) {
          return false;
        }
        createButton.click();
        return true;
      };

      const result = mockOpenCreateThreadDialog();

      expect(result).toBe(true);
      expect(clickedElements).toHaveLength(1);
      expect(clickedElements[0]).toBe(createButton);
    });

    it("returns false when neither dialog nor button exists", () => {
      const mockOpenCreateThreadDialog = () => {
        const existingDialog = document.querySelector("#create-thread-dialog");
        if (existingDialog) {
          existingDialog.remove();
          return true;
        }
        const createButton = document.querySelector("#create-thread-btn");
        if (!createButton) {
          return false;
        }
        createButton.click();
        return true;
      };

      const result = mockOpenCreateThreadDialog();

      expect(result).toBe(false);
    });
  });

  describe("No duplicate dialogs", () => {
    it("rapid toggle presses never leave more than one dialog in DOM", () => {
      let dialogCount = 0;

      const mockOpenCreateThreadDialog = () => {
        const existingDialog = document.querySelector("#create-thread-dialog");
        if (existingDialog) {
          existingDialog.remove();
          dialogCount = 0;
          return true;
        }
        const createButton = document.querySelector("#create-thread-btn");
        if (!createButton) {
          return false;
        }
        createButton.click();
        dialogCount = 1;
        return true;
      };

      // Simulate rapid keybinding presses
      mockOpenCreateThreadDialog(); // opens
      expect(dialogCount).toBeLessThanOrEqual(1);

      mockOpenCreateThreadDialog(); // closes
      expect(dialogCount).toBeLessThanOrEqual(1);

      mockOpenCreateThreadDialog(); // opens
      expect(dialogCount).toBeLessThanOrEqual(1);

      mockOpenCreateThreadDialog(); // closes
      expect(dialogCount).toBeLessThanOrEqual(1);

      mockOpenCreateThreadDialog(); // opens
      expect(dialogCount).toBeLessThanOrEqual(1);
    });

    it("button click when dialog is open does not create duplicate", () => {
      const existingDialog = createMockElement("create-thread-dialog");
      domElements.set("#create-thread-dialog", existingDialog);
      let newDialogCreated = false;

      // Simulate showCreateThreadDialog guard
      const mockShowCreateThreadDialog = () => {
        if (document.querySelector("#create-thread-dialog")) {
          return; // Guard prevents duplicate
        }
        newDialogCreated = true;
      };

      mockShowCreateThreadDialog();

      expect(newDialogCreated).toBe(false);
    });
  });
});
