// SPDX-License-Identifier: AGPL-3.0-only
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "http";
import { createConnection } from "net";
import type { OS } from "../../infrastructure/os/types.js";
import { logger } from "../../logger.js";
import { DEFAULT_MIMO_HOST } from "../../infrastructure/context/mimo-context.js";

/**
 * Verifies session credentials for a Git smart-HTTP request.
 * Returns true when (user, password) are authorized for the given session id.
 */
export type CredentialVerifier = (
  sessionId: string,
  user: string,
  password: string,
) => Promise<boolean> | boolean;

export interface GitHttpServerConfig {
  /** Port number must be between 1024 and 65535. Required. */
  port: number;
  /** Directory holding the bare session repositories (`<sid>.git`). Required. */
  reposDir: string;
  /** Hostname used in generated URLs. Defaults to localhost. */
  host?: string;
  /** Basic-auth verifier. Required: every request must be authorized. */
  verifyCredentials: CredentialVerifier;
}

/**
 * GitHttpServer serves the bare session repositories over Git smart-HTTP by
 * spawning the native `git http-backend` CGI per request. It is the shared VCS
 * server agents and users clone session repositories from:
 * - Bare repos stored as `<reposDir>/<sessionId>.git`
 * - Accessed via `http://<host>:<port>/<sessionId>.git/`
 * - Basic-auth gate in front of the CGI (same per-session credential model)
 *
 * The served repos' working trees are never read; the platform reads its own
 * separate checkout (`agentWorkspacePath`).
 */
export class GitHttpServer {
  private server: Server | null = null;
  private readonly _port: number;
  private readonly _host: string;
  private readonly _reposDir: string;
  private readonly verify: CredentialVerifier;
  private os: OS;

  constructor(config: GitHttpServerConfig, os: OS) {
    if (typeof config.port !== "number") {
      throw new Error("GitHttpServer: port is required");
    }
    if (config.port < 1024 || config.port > 65535) {
      throw new Error(
        `GitHttpServer: port must be between 1024 and 65535, got ${config.port}`,
      );
    }
    if (typeof config.reposDir !== "string" || config.reposDir.length === 0) {
      throw new Error(
        "GitHttpServer: reposDir is required and must be a non-empty string",
      );
    }
    if (typeof config.verifyCredentials !== "function") {
      throw new Error("GitHttpServer: verifyCredentials is required");
    }
    this._port = config.port;
    this._host = config.host ?? DEFAULT_MIMO_HOST;
    this._reposDir = config.reposDir;
    this.verify = config.verifyCredentials;
    this.os = os;
    this.ensureReposDir();
  }

  private get port(): number {
    return this._port;
  }

  private get reposDir(): string {
    return this._reposDir;
  }

  private ensureReposDir(): void {
    if (this._reposDir && !this.os.fs.exists(this._reposDir)) {
      this.os.fs.mkdir(this._reposDir, { recursive: true });
      logger.debug(
        `[GitHttpServer] Created repos directory: ${this._reposDir}`,
      );
    }
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection(port, "localhost");
      socket.setTimeout(1000);
      socket.on("connect", () => {
        socket.destroy();
        resolve(false);
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", (err: any) => {
        socket.destroy();
        resolve(err.code === "ECONNREFUSED" || err.code === "ECONNRESET");
      });
    });
  }

  /**
   * Extract the session id from a request path like `/<sid>.git/info/refs`.
   * Returns null if the path does not target a `<sid>.git` repository.
   */
  private sessionIdFromPath(pathname: string): string | null {
    const match = pathname.match(/^\/([^/]+)\.git(?:\/|$)/);
    return match ? match[1] : null;
  }

  private parseBasicAuth(
    header: string | undefined,
  ): { user: string; password: string } | null {
    if (!header || !header.startsWith("Basic ")) return null;
    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      if (idx < 0) return null;
      return { user: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
    } catch {
      return null;
    }
  }

  private sendUnauthorized(res: ServerResponse): void {
    res.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="mimo-git"',
      "Content-Type": "text/plain",
    });
    res.end("Authentication required");
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${this._host}`);
    const sessionId = this.sessionIdFromPath(url.pathname);

    if (!sessionId) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const creds = this.parseBasicAuth(req.headers["authorization"]);
    if (!creds) {
      this.sendUnauthorized(res);
      return;
    }

    let authorized = false;
    try {
      authorized = await this.verify(sessionId, creds.user, creds.password);
    } catch (err) {
      logger.error("[GitHttpServer] Credential verifier threw:", err);
      authorized = false;
    }
    if (!authorized) {
      this.sendUnauthorized(res);
      return;
    }

    const body = await this.readBody(req);
    await this.runCgi(req, res, url, creds.user, body);
  }

  private readBody(req: IncomingMessage): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
      req.on("error", reject);
    });
  }

  private async runCgi(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    remoteUser: string,
    body: Uint8Array,
  ): Promise<void> {
    const env: Record<string, string> = {
      ...this.os.env.getAll(),
      GIT_PROJECT_ROOT: this.reposDir,
      GIT_HTTP_EXPORT_ALL: "1",
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search.replace(/^\?/, ""),
      REQUEST_METHOD: req.method ?? "GET",
      CONTENT_TYPE: (req.headers["content-type"] as string) ?? "",
      CONTENT_LENGTH: String(body.length),
      REMOTE_USER: remoteUser,
    };

    // Forward every request header as a CGI `HTTP_*` variable so git
    // http-backend sees Content-Encoding (gzip), Git-Protocol (v2), Accept,
    // etc. Without these the request body is mis-read and the client fails
    // with "fatal: expected 'packfile'".
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      const key = "HTTP_" + name.toUpperCase().replace(/-/g, "_");
      env[key] = Array.isArray(value) ? value.join(", ") : String(value);
    }
    // GIT_PROTOCOL is read directly (not via HTTP_) by http-backend.
    const gitProtocol = req.headers["git-protocol"];
    if (typeof gitProtocol === "string") env.GIT_PROTOCOL = gitProtocol;

    const proc = this.os.command.spawn(["git", "http-backend"], { env });

    // Start draining stdout/stderr BEFORE writing stdin so a large packfile
    // response can't fill the pipe buffer and deadlock the CGI while it is
    // still reading the request body.
    const outPromise = this.readStream(proc.stdout);
    this.drainStderr(proc.stderr);

    // Write request body to the CGI stdin.
    const writer = proc.stdin.getWriter();
    if (body.length > 0) await writer.write(body);
    await writer.close();

    const out = await outPromise;
    await proc.exited;

    this.writeCgiResponse(res, out);
  }

  private async readStream(
    stream: ReadableStream<Uint8Array>,
  ): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  private drainStderr(stream: ReadableStream<Uint8Array>): void {
    (async () => {
      try {
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length > 0) {
            logger.debug(
              `[GitHttpServer] cgi stderr: ${new TextDecoder().decode(value)}`,
            );
          }
        }
      } catch {}
    })();
  }

  /**
   * Parse the CGI output (headers, blank line, body) and write the HTTP response.
   */
  private writeCgiResponse(res: ServerResponse, out: Uint8Array): void {
    const sep = this.findHeaderSeparator(out);
    const headerText = new TextDecoder().decode(out.subarray(0, sep.index));
    const payload = out.subarray(sep.index + sep.length);

    let status = 200;
    for (const line of headerText.split(/\r?\n/)) {
      if (!line) continue;
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (key.toLowerCase() === "status") {
        status = parseInt(value, 10) || 200;
      } else {
        res.setHeader(key, value);
      }
    }
    res.writeHead(status);
    res.end(Buffer.from(payload));
  }

  private findHeaderSeparator(out: Uint8Array): {
    index: number;
    length: number;
  } {
    // Look for \r\n\r\n first, then \n\n.
    for (let i = 0; i + 3 < out.length; i++) {
      if (
        out[i] === 13 &&
        out[i + 1] === 10 &&
        out[i + 2] === 13 &&
        out[i + 3] === 10
      ) {
        return { index: i, length: 4 };
      }
    }
    for (let i = 0; i + 1 < out.length; i++) {
      if (out[i] === 10 && out[i + 1] === 10) {
        return { index: i, length: 2 };
      }
    }
    return { index: 0, length: 0 };
  }

  async start(): Promise<boolean> {
    if (this.server !== null) {
      logger.debug("[GitHttpServer] Server already running");
      return true;
    }
    this.ensureReposDir();

    const available = await this.isPortAvailable(this.port);
    if (!available) {
      logger.warn(`[GitHttpServer] Port ${this.port} is already in use`);
      return false;
    }

    return new Promise<boolean>((resolve) => {
      const server = createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          logger.error("[GitHttpServer] Request handler error:", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "text/plain" });
          }
          res.end("Internal server error");
        });
      });
      server.on("error", (err) => {
        logger.error("[GitHttpServer] Server error:", err);
        this.server = null;
        resolve(false);
      });
      server.listen(this.port, () => {
        this.server = server;
        logger.debug(`[GitHttpServer] Server started on port ${this.port}`);
        resolve(true);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server === null) return;
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve());
    });
    this.server = null;
    logger.debug("[GitHttpServer] Server stopped");
  }

  async isRunning(): Promise<boolean> {
    if (this.server !== null) return true;
    try {
      const response = await fetch(`http://localhost:${this.port}/`, {
        signal: AbortSignal.timeout(1000),
      });
      return response.ok || response.status === 404 || response.status === 401;
    } catch {
      return false;
    }
  }

  async ensureRunning(): Promise<boolean> {
    if (await this.isRunning()) return true;
    return this.start();
  }

  /**
   * URL for a session's repository, e.g. `http://localhost:8000/<sid>.git/`.
   */
  getUrl(sessionId: string): string {
    return `http://${this._host}:${this.port}/${sessionId}.git/`;
  }

  /**
   * Filesystem path of a session's bare repository.
   */
  getSessionRepoPath(sessionId: string): string {
    return this.os.path.join(this.reposDir, `${sessionId}.git`);
  }

  getReposDir(): string {
    return this.reposDir;
  }

  getPort(): number {
    return this.port;
  }
}

/**
 * Dummy GitHttpServer for tests: same interface, no real listener.
 */
export class DummyGitHttpServer {
  private readonly _port: number;
  private readonly _reposDir: string;
  private readonly _host: string;

  constructor(
    port: number = 8000,
    reposDir: string = "/tmp/dummy-git-repos",
    host: string = DEFAULT_MIMO_HOST,
  ) {
    this._port = port;
    this._reposDir = reposDir;
    this._host = host;
  }

  async start(): Promise<boolean> {
    return true;
  }
  async stop(): Promise<void> {}
  async isRunning(): Promise<boolean> {
    return true;
  }
  async ensureRunning(): Promise<boolean> {
    return true;
  }
  getUrl(sessionId: string): string {
    return `http://${this._host}:${this._port}/${sessionId}.git/`;
  }
  getSessionRepoPath(sessionId: string): string {
    return `${this._reposDir}/${sessionId}.git`;
  }
  getReposDir(): string {
    return this._reposDir;
  }
  getPort(): number {
    return this._port;
  }
}
