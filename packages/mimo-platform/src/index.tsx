// SPDX-License-Identifier: AGPL-3.0-only
import { join } from "path";
import { homedir } from "os";
import { createOS } from "./infrastructure/os/node-adapter.js";
import type { OS } from "./infrastructure/os/types.js";
import {
  createMimoContext,
  createGitHttpServer,
  DEFAULT_MIMO_HOST,
} from "./infrastructure/context/mimo-context.js";
import { bootstrapMimoServer } from "./infrastructure/server/bootstrap.js";

if (!process.env.JWT_SECRET) {
  console.error("ERROR: JWT_SECRET environment variable is required");
  console.error("Please set JWT_SECRET before starting the server");
  process.exit(1);
}

const _port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const mimoHome = process.env.MIMO_HOME ?? join(homedir(), ".mimo");
const fossilReposDir =
  process.env.FOSSIL_REPOS_DIR ?? join(mimoHome, "session-fossils");
const listenHost = process.env.MIMO_LISTEN_HOST;

const os: OS = createOS({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  ...process.env,
});

const _host = process.env.MIMO_HOST ?? DEFAULT_MIMO_HOST;
const sharedFossilHost = process.env.MIMO_SHARED_FOSSIL_SERVER_HOST;

const env = {
  PORT: _port,
  PLATFORM_URL: process.env.PLATFORM_URL ?? `http://${_host}:${_port}`,
  JWT_SECRET: process.env.JWT_SECRET,
  MIMO_HOME: mimoHome,
  FOSSIL_REPOS_DIR: fossilReposDir,
  MIMO_SHARED_FOSSIL_SERVER_PORT: process.env.MIMO_SHARED_FOSSIL_SERVER_PORT
    ? parseInt(process.env.MIMO_SHARED_FOSSIL_SERVER_PORT, 10)
    : 8000,
  MIMO_HOST: _host,
  MIMO_SHARED_FOSSIL_SERVER_HOST: sharedFossilHost,
};

// Context is created first so the git server's credential verifier can look up
// session-stored credentials.
const mimoContext = createMimoContext({ env, os });

// Basic-auth verifier: a request for <sid> is authorized when its credentials
// match the session's stored agent-workspace user/password.
const sharedFossilServer = createGitHttpServer(env, os, async (sid, user, pass) => {
  const session = await mimoContext.repos.sessions.findById(sid);
  return (
    !!session &&
    session.agentWorkspaceUser === user &&
    session.agentWorkspacePassword === pass
  );
});
mimoContext.services.sharedFossil = sharedFossilServer;

mimoContext.services.scc.configure({ mimoHome });

await bootstrapMimoServer({
  mimoContext,
  os,
  sharedFossilServer,
  host: listenHost ?? _host,
  port: _port,
});
