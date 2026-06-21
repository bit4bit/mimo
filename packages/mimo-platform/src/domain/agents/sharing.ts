// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Agent sharing domain logic.
 *
 * An agent owner can grant other users permission to use the agent. A grant is
 * recorded as `{ username, permission }`. Only the "use" permission exists
 * today; the object shape leaves room for additional per-grant properties.
 *
 * `authorizeUse` is the single source of truth for "may this user use this
 * agent" and is reused by agent listing, chat-thread assignment, and runtime
 * prompt routing.
 */

export type SharePermission = "use";

export interface SharedGrant {
  username: string;
  permission: SharePermission;
}

/** Minimal shape needed to decide use-authorization. */
interface ShareableAgent {
  owner: string;
  sharedWith?: SharedGrant[];
}

/**
 * A user may use an agent if they own it, or if they appear in the agent's
 * `sharedWith` list with the "use" permission.
 */
export function authorizeUse(agent: ShareableAgent, username: string): boolean {
  if (agent.owner === username) return true;
  return (agent.sharedWith ?? []).some(
    (grant) => grant.username === username && grant.permission === "use",
  );
}

export interface ValidateShareArgs {
  agent: ShareableAgent;
  targetUsername: string;
  targetExists: boolean;
}

export type ValidateShareResult = { ok: true } | { ok: false; error: string };

/**
 * Validates a request to share an agent with `targetUsername`. The owner check
 * (only the owner may share) is enforced by the caller, which holds the
 * authenticated user; this validates the target of the grant.
 */
export function validateShareInput(
  args: ValidateShareArgs,
): ValidateShareResult {
  const { agent, targetUsername, targetExists } = args;

  if (!targetUsername || targetUsername.trim().length === 0) {
    return { ok: false, error: "Username is required" };
  }

  if (targetUsername === agent.owner) {
    return { ok: false, error: "Cannot share an agent with its owner" };
  }

  if (!targetExists) {
    return { ok: false, error: "User not found" };
  }

  const alreadyShared = (agent.sharedWith ?? []).some(
    (grant) => grant.username === targetUsername,
  );
  if (alreadyShared) {
    return { ok: false, error: "Agent is already shared with this user" };
  }

  return { ok: true };
}
