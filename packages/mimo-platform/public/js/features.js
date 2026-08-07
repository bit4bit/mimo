// ═════════════════════════════════════════════════════════════════════════════
// MIMO FEATURES - Project feature list add/edit/delete/done interactions
// ═════════════════════════════════════════════════════════════════════════════

"use strict";

const FeaturesState = {
  projectId: null,
};

// ═════════════════════════════════════════════════════════════════════════════
// API helpers
// ═════════════════════════════════════════════════════════════════════════════

async function featuresFetch(path, options) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    // ignore parse errors
  }
  return { ok: response.ok, status: response.status, data };
}

// ═════════════════════════════════════════════════════════════════════════════
// Actions
// ═════════════════════════════════════════════════════════════════════════════

async function addFeature(branchName, description) {
  if (!FeaturesState.projectId) return;
  if (!branchName || !description) return;
  const { ok, data } = await featuresFetch(
    `/projects/${FeaturesState.projectId}/features`,
    {
      method: "POST",
      body: JSON.stringify({ branchName, description }),
    },
  );
  if (!ok) {
    alert(data?.error || "Failed to add feature");
    return;
  }
  reloadFeatures();
}

async function editFeature(featureId, branchName, description) {
  if (!FeaturesState.projectId || !featureId) return;
  const { ok, data } = await featuresFetch(
    `/projects/${FeaturesState.projectId}/features/${featureId}`,
    {
      method: "PUT",
      body: JSON.stringify({ branchName, description }),
    },
  );
  if (!ok) {
    alert(data?.error || "Failed to save feature");
    return;
  }
  reloadFeatures();
}

async function toggleFeatureDone(featureId, done) {
  if (!FeaturesState.projectId || !featureId) return;
  const { ok, data } = await featuresFetch(
    `/projects/${FeaturesState.projectId}/features/${featureId}`,
    {
      method: "PUT",
      body: JSON.stringify({ done }),
    },
  );
  if (!ok) {
    alert(data?.error || "Failed to toggle feature");
    return;
  }
  reloadFeatures();
}

async function deleteFeature(featureId) {
  if (!FeaturesState.projectId || !featureId) return;
  if (!confirm("Delete this feature? This cannot be undone.")) return;
  const { ok, data } = await featuresFetch(
    `/projects/${FeaturesState.projectId}/features/${featureId}`,
    { method: "DELETE" },
  );
  if (!ok) {
    alert(data?.error || "Failed to delete feature");
    return;
  }
  reloadFeatures();
}

// Server-rendered page reflects the persisted state, so reload after each
// mutation. This keeps the UI simple and avoids client-side re-rendering.
function reloadFeatures() {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", "features");
  window.location.href = url.toString();
}

// ═════════════════════════════════════════════════════════════════════════════
// Event wiring
// ═════════════════════════════════════════════════════════════════════════════

function initAddForm() {
  const form = document.querySelector("#feature-add-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const branchInput = form.querySelector('[name="branchName"]');
    const descInput = form.querySelector('[name="description"]');
    const branchName = (branchInput?.value || "").trim();
    const description = (descInput?.value || "").trim();
    if (!branchName || !description) return;
    addFeature(branchName, description);
  });
}

function initEditButtons() {
  const buttons = document.querySelectorAll(".feature-edit-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const row = btn.closest("[data-feature-id]");
      const featureId = row?.getAttribute("data-feature-id");
      if (!featureId) return;
      const branchInput = row?.querySelector(".feature-edit-branch");
      const descInput = row?.querySelector(".feature-edit-desc");
      const branchName = (branchInput?.value || "").trim();
      const description = (descInput?.value || "").trim();
      if (!branchName || !description) return;
      editFeature(featureId, branchName, description);
    });
  });
}

function initDoneCheckboxes() {
  const checkboxes = document.querySelectorAll(".feature-done-checkbox");
  checkboxes.forEach((cb) => {
    cb.addEventListener("change", () => {
      const row = cb.closest("[data-feature-id]");
      const featureId = row?.getAttribute("data-feature-id");
      if (!featureId) return;
      toggleFeatureDone(featureId, cb.checked);
    });
  });
}

function initDeleteButtons() {
  const buttons = document.querySelectorAll(".feature-delete-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const row = btn.closest("[data-feature-id]");
      const featureId = row?.getAttribute("data-feature-id");
      if (!featureId) return;
      deleteFeature(featureId);
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Initialization
// ═════════════════════════════════════════════════════════════════════════════

function initFeatures() {
  const container = document.querySelector("#features-tab");
  if (!container) return;
  FeaturesState.projectId = container.getAttribute("data-project-id");
  if (!FeaturesState.projectId) return;
  initAddForm();
  initEditButtons();
  initDoneCheckboxes();
  initDeleteButtons();
}

// ═════════════════════════════════════════════════════════════════════════════
// Bootstrap
// ═════════════════════════════════════════════════════════════════════════════

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFeatures);
} else {
  initFeatures();
}
