// SPDX-License-Identifier: AGPL-3.0-only
import { isExcluded } from "./path-policy.js";

const NORMALIZE_SEP = /\\/g;

export function normalizeImpactPath(path: string): string {
  return path.replace(NORMALIZE_SEP, "/");
}

export function shouldIncludeImpactPath(path: string): boolean {
  return !isExcluded(normalizeImpactPath(path));
}
