// SPDX-License-Identifier: AGPL-3.0-only
import type { Credential } from "../credentials/repository.js";

export function isSshRepoUrl(url: string): boolean {
  return url.startsWith("git@") || url.startsWith("ssh://");
}

export function injectHttpsCredentials(
  repoUrl: string,
  credential: Extract<Credential, { type: "https" }>,
): string {
  try {
    const url = new URL(repoUrl);
    url.username = encodeURIComponent(credential.username);
    url.password = encodeURIComponent(credential.password);
    return url.toString();
  } catch {
    return repoUrl;
  }
}

export function normalizeSshPrivateKey(privateKey: string): string {
  let normalized = privateKey.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }
  normalized = normalized
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\n/g, "\n");
  if (!normalized.endsWith("\n")) {
    normalized += "\n";
  }
  return normalized;
}

export function buildGitSshCommand(
  keyPath?: string,
  clonePort?: number,
): string {
  const parts = ["ssh"];
  if (keyPath) {
    parts.push(`-i "${keyPath}"`, "-o IdentitiesOnly=yes");
  }
  parts.push(
    "-o StrictHostKeyChecking=no",
    "-o UserKnownHostsFile=/dev/null",
    "-o BatchMode=yes",
  );
  if (clonePort != null) {
    parts.push(`-p ${clonePort}`);
  }
  return parts.join(" ");
}
