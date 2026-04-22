// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

import type { Session } from "./repository.js";

export const DEFAULT_SESSION_TTL_DAYS = 180;
export const SESSION_INACTIVITY_WINDOW_MS = 10 * 60 * 1000;

export function isSessionInactive(
  lastActivityAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastActivityAt) {
    return true;
  }

  const lastActivity = new Date(lastActivityAt);
  if (Number.isNaN(lastActivity.getTime())) {
    return true;
  }

  return now.getTime() - lastActivity.getTime() >= SESSION_INACTIVITY_WINDOW_MS;
}

export function isSessionExpired(
  session: Pick<Session, "createdAt" | "sessionTtlDays">,
  now: Date = new Date(),
): boolean {
  const ttlDays = session.sessionTtlDays ?? DEFAULT_SESSION_TTL_DAYS;
  const expiresAtMs =
    session.createdAt.getTime() + ttlDays * 24 * 60 * 60 * 1000;
  return now.getTime() >= expiresAtMs;
}

export function canDeleteSessionNow(
  session: Pick<Session, "lastActivityAt">,
  now: Date = new Date(),
): boolean {
  return isSessionInactive(session.lastActivityAt, now);
}
