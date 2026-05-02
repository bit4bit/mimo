import { createServer } from "net";

/**
 * Test utilities for reliable async testing.
 *
 * Prefer these over fixed setTimeout durations to avoid flaky tests.
 */

export interface WaitForOptions {
  timeout?: number;
  interval?: number;
}

export class WaitForTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaitForTimeoutError";
  }
}

/**
 * Wait for a condition to become true, polling at regular intervals.
 *
 * @example
 *   // Instead of: await new Promise(r => setTimeout(r, 500));
 *   // Use: await waitFor(() => server.isRunning());
 */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  options: WaitForOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 50;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new WaitForTimeoutError(
    `Timeout waiting for condition after ${timeout}ms`,
  );
}

/**
 * Wait for an event to be received, with explicit timeout handling.
 *
 * @example
 *   const eventPromise = new Promise<void>(resolve => {
 *     watcher.on('change', resolve);
 *   });
 *   await waitForEvent(eventPromise, { timeout: 3000 });
 */
/**
 * Reset all global state to ensure test isolation.
 * Call this in afterEach to prevent state leakage between tests.
 */
export async function resetGlobalState(): Promise<void> {
  const { sessionStateService } = await import("../src/domain/sessions/state.js");
  sessionStateService.reset();
}

/**
 * Safely clean up a test directory.
 * Logs warnings in CI if cleanup fails.
 */
export function cleanupTestDir(testHome: string): void {
  try {
    rmSync(testHome, { recursive: true, force: true });
  } catch (error) {
    if (process.env.CI) {
      console.warn(`[test cleanup] Failed to remove ${testHome}:`, error);
    }
  }
}

/**
 * Find an available TCP port by asking the OS to assign an ephemeral port.
 * This avoids port collisions in tests.
 */
export async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object" && address.port) {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not get port from server")));
      }
    });
    server.on("error", (err) => reject(err));
  });
}

export async function waitForEvent<T>(
  eventPromise: Promise<T>,
  options: WaitForOptions = {},
): Promise<T> {
  const timeout = options.timeout ?? 5000;

  return Promise.race([
    eventPromise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new WaitForTimeoutError(
              `Timeout waiting for event after ${timeout}ms`,
            ),
          ),
        timeout,
      ),
    ),
  ]);
}

/**
 * Wait for a file system change to be detected.
 * Useful in file watcher tests.
 */
export async function waitForFileEvent(
  events: Array<{ type: string; path: string }>,
  predicate: (events: Array<{ type: string; path: string }>) => boolean,
  options: WaitForOptions = {},
): Promise<void> {
  return waitFor(() => predicate(events), options);
}
