type ServerInstance = {
  port: number;
};

type ServerFactory = (config: {
  fetch: (req: Request, server: any) => Response | Promise<Response | undefined> | undefined;
  port: number;
  websocket: any;
}) => ServerInstance;

type ScheduleFn = (callback: () => void | Promise<void>, delayMs: number) => any;

type Logger = {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

export type MimoServerSetup = {
  fetch: (req: Request, server: any) => Response | Promise<Response | undefined> | undefined;
  port: number;
  websocket: any;
};

export type MimoServerDeps = {
  serve: ServerFactory;
  schedule: ScheduleFn;
  ensureSharedFossilRunning: () => Promise<boolean>;
  getSharedFossilPort: () => number;
  logger: Logger;
};

export class MimoServer {
  private setupConfig: MimoServerSetup | null = null;

  constructor(private deps: MimoServerDeps) {}

  setup(config: MimoServerSetup): void {
    this.setupConfig = config;
  }

  start(): ServerInstance {
    if (!this.setupConfig) {
      throw new Error("MimoServer must be setup before start");
    }

    const server = this.deps.serve({
      fetch: this.setupConfig.fetch,
      port: this.setupConfig.port,
      websocket: this.setupConfig.websocket,
    });

    this.deps.logger.log(`Server running at http://localhost:${server.port}`);

    this.deps.schedule(async () => {
      const success = await this.deps.ensureSharedFossilRunning();
      if (success) {
        this.deps.logger.log(
          `[SharedFossilServer] Fossil server running on port ${this.deps.getSharedFossilPort()}`
        );
      } else {
        this.deps.logger.error(
          "[SharedFossilServer] Failed to start fossil server. Agent synchronization may be unavailable."
        );
      }
    }, 100);

    return server;
  }
}
