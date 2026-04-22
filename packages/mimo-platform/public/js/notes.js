// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

// ═════════════════════════════════════════════════════════════════════════════
// MIMO NOTES SYSTEM - Project + Session Notes Auto-Save
// ═════════════════════════════════════════════════════════════════════════════

"use strict";

const NotesState = {
  sessionId: null,
  projectId: null,
  saveTimeouts: {
    project: null,
    session: null,
  },
};

// ═════════════════════════════════════════════════════════════════════════════
// Save Notes
// ═════════════════════════════════════════════════════════════════════════════

async function saveProjectNotes() {
  const projectNotesInput = document.querySelector("#project-notes-input");
  const status = document.querySelector("#project-notes-save-status");
  if (!projectNotesInput || !NotesState.projectId) {
    return;
  }

  try {
    if (status) status.textContent = "Saving...";
    const response = await fetch(`/projects/${NotesState.projectId}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: projectNotesInput.value }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (status) status.textContent = "Saved";
  } catch (error) {
    if (status) status.textContent = "Error";
    console.error("[notes] Failed to save project notes:", error);
  }
}

async function saveSessionNotes() {
  const notesInput = document.querySelector("#notes-input");
  const status = document.querySelector("#notes-save-status");
  if (!notesInput || !NotesState.sessionId) {
    return;
  }

  try {
    if (status) status.textContent = "Saving...";
    const response = await fetch(`/sessions/${NotesState.sessionId}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: notesInput.value }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (status) status.textContent = "Saved";
  } catch (error) {
    if (status) status.textContent = "Error";
    console.error("[notes] Failed to save session notes:", error);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Event Listeners for Auto-Save
// ═════════════════════════════════════════════════════════════════════════════

function initProjectNotesAutoSave() {
  const projectNotesInput = document.querySelector("#project-notes-input");
  if (projectNotesInput) {
    projectNotesInput.addEventListener("input", () => {
      const status = document.querySelector("#project-notes-save-status");
      if (status) {
        status.textContent = "Unsaved";
      }

      if (NotesState.saveTimeouts.project) {
        clearTimeout(NotesState.saveTimeouts.project);
      }

      NotesState.saveTimeouts.project = setTimeout(() => {
        saveProjectNotes();
      }, 2000);
    });
  }
}

function initSessionNotesAutoSave() {
  const notesInput = document.querySelector("#notes-input");
  if (notesInput) {
    notesInput.addEventListener("input", () => {
      const status = document.querySelector("#notes-save-status");
      if (status) {
        status.textContent = "Unsaved";
      }

      if (NotesState.saveTimeouts.session) {
        clearTimeout(NotesState.saveTimeouts.session);
      }

      NotesState.saveTimeouts.session = setTimeout(() => {
        saveSessionNotes();
      }, 2000);
    });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Initialization
// ═════════════════════════════════════════════════════════════════════════════

function initNotes() {
  const buffer = document.querySelector(".notes-buffer");
  if (!buffer) {
    return;
  }

  NotesState.sessionId = buffer.getAttribute("data-session-id");
  NotesState.projectId = buffer.getAttribute("data-project-id");

  initProjectNotesAutoSave();
  initSessionNotesAutoSave();
}

// ═════════════════════════════════════════════════════════════════════════════
// Bootstrap
// ═════════════════════════════════════════════════════════════════════════════

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initNotes);
} else {
  initNotes();
}
