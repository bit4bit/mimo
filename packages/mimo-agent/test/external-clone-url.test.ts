// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Behavior: an agent started with --external clones session repos from a
 * reachable URL instead of the internal Docker hostname.
 *
 * Priority:
 *   1. publicCloneUrl with a different hostname → MIMO_PUBLIC_VCS_URL configured
 *   2. publicCloneUrl same hostname as internal → not configured; derive from --platform
 *   3. no publicCloneUrl → derive from --platform
 *
 * A normal (internal) agent always uses the internal cloneUrl.
 */
import { describe, it, expect } from "bun:test";

import { MimoAgent, type AgentConfig } from "../src/index.js";
import { createMockOS, type MockOS } from "../src/os/mock-adapter.js";
import type { CommandResult } from "../src/os/types.js";

const INTERNAL_URL = "http://platform:8001/sid-1.git/";
// publicCloneUrl when MIMO_PUBLIC_VCS_URL is set on the platform (different hostname)
const PUBLIC_URL = "https://mimo.example.com/git/sid-1.git/";
// publicCloneUrl when MIMO_PUBLIC_VCS_URL is NOT set — platform hostname-swapped
// using PLATFORM_URL which is also internal
const SAME_HOST_PUBLIC_URL = "http://platform:8001/sid-1.git/";

function makeAgent(
  external: boolean,
  platformUrl = "ws://localhost:3000/ws",
): { agent: MimoAgent; cloneUrls: string[] } {
  const os = createMockOS() as MockOS;
  const cloneUrls: string[] = [];

  const ok: CommandResult = {
    success: true,
    output: "",
    error: "",
    exitCode: 0,
  };
  os.command.setDefaultHandler((command) => {
    if (command[0] === "git" && command[1] === "clone") {
      cloneUrls.push(command[2]);
    }
    return ok;
  });

  const sessionManager: any = {
    createSession: async () => ({}),
    setSessionState: () => {},
    setSessionMcpServers: () => {},
    setSessionAgentSubpath: () => {},
  };

  const config: AgentConfig = {
    token: "t",
    platform: platformUrl,
    workDir: "/work",
    provider: "claude",
    external,
  };

  const agent = new MimoAgent({
    os,
    config,
    sessionManager,
    lifecycleManager: {} as any,
    provider: {} as any,
  });

  return { agent, cloneUrls };
}

async function sendSessionReady(
  agent: MimoAgent,
  publicCloneUrl?: string,
): Promise<void> {
  await (agent as any).handleSessionReady({
    type: "session_ready",
    platformUrl: "http://platform:3000",
    sessions: [
      {
        sessionId: "sid-1",
        cloneUrl: INTERNAL_URL,
        ...(publicCloneUrl !== undefined ? { publicCloneUrl } : {}),
      },
    ],
  });
}

describe("external agent clone URL selection", () => {
  it("uses publicCloneUrl when MIMO_PUBLIC_VCS_URL was configured (different hostname)", async () => {
    const { agent, cloneUrls } = makeAgent(true);
    await sendSessionReady(agent, PUBLIC_URL);
    expect(cloneUrls).toEqual([PUBLIC_URL]);
  });

  it("derives from --platform host when publicCloneUrl has the same internal hostname (MIMO_PUBLIC_VCS_URL not set)", async () => {
    const { agent, cloneUrls } = makeAgent(true, "ws://localhost:3000/ws");
    await sendSessionReady(agent, SAME_HOST_PUBLIC_URL);
    // hostname swapped from 'platform' → 'localhost'; port kept
    expect(cloneUrls).toEqual(["http://localhost:8001/sid-1.git/"]);
  });

  it("derives from --platform host when no publicCloneUrl at all", async () => {
    const { agent, cloneUrls } = makeAgent(true, "ws://localhost:3000/ws");
    await sendSessionReady(agent, undefined);
    expect(cloneUrls).toEqual(["http://localhost:8001/sid-1.git/"]);
  });

  it("uses internal URL when not --external", async () => {
    const { agent, cloneUrls } = makeAgent(false);
    await sendSessionReady(agent, PUBLIC_URL);
    expect(cloneUrls).toEqual([INTERNAL_URL]);
  });
});
