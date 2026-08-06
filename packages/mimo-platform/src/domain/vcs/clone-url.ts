// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Build the **external** clone URL for a session repository.
 *
 * The internal clone URL (`http://<MIMO_INTERNAL_VCS_HOST>:<port>/<sid>.git/`) is
 * only reachable from inside the deployment (e.g. the Docker service name
 * `platform`). Browser users and agents running outside the container need a
 * public-facing address instead.
 *
 * - When `publicVcsUrl` is configured (e.g. behind a reverse proxy on a custom
 *   domain), build the clone URL from that public base.
 * - Otherwise fall back to the internal URL with its hostname swapped to the
 *   platform's.
 * - On any parse error, return the internal URL unchanged.
 */
export function buildPublicCloneUrl(opts: {
  /** The internal clone URL, e.g. `sharedVcsServer.getUrl(sessionId)`. */
  internalUrl: string;
  /** The public platform URL (`PLATFORM_URL`). */
  platformUrl: string;
  /** Public-facing VCS base URL (`MIMO_PUBLIC_VCS_URL`), if configured. */
  publicVcsUrl?: string;
  sessionId: string;
  repoId?: string;
}): string {
  const { internalUrl, platformUrl, publicVcsUrl, sessionId, repoId } = opts;

  if (publicVcsUrl) {
    const base = publicVcsUrl.replace(/\/+$/, "");
    return repoId
      ? `${base}/${sessionId}/${repoId}.git/`
      : `${base}/${sessionId}.git/`;
  }

  try {
    const url = new URL(internalUrl);
    const platform = new URL(platformUrl);
    url.hostname = platform.hostname;
    return url.toString();
  } catch {
    return internalUrl;
  }
}
