import { describe, it, expect } from "bun:test";
import { MimoServer } from "../src/server/mimo-server.js";

describe("MimoServer", () => {
  it("starts with configured handlers and schedules shared fossil bootstrap", async () => {
    let servedConfig: any;
    let ensureRunningCalls = 0;
    let scheduledTask: (() => Promise<void>) | null = null;
    let scheduledDelay = -1;

    const mimoServer = new MimoServer({
      serve: ((config: any) => {
        servedConfig = config;
        return { port: config.port };
      }) as any,
      schedule: ((callback: () => Promise<void>, delayMs: number) => {
        scheduledTask = callback;
        scheduledDelay = delayMs;
        return 1;
      }) as any,
      ensureSharedFossilRunning: async () => {
        ensureRunningCalls += 1;
        return true;
      },
      getSharedFossilPort: () => 19000,
      logger: {
        log: () => {},
        error: () => {},
      },
    });

    const fetch = async () => new Response("ok");
    const websocket = {
      message: () => {},
      open: () => {},
      close: () => {},
    };

    mimoServer.setup({
      port: 4242,
      fetch,
      websocket,
    });

    const server = mimoServer.start();

    expect(server.port).toBe(4242);
    expect(servedConfig.port).toBe(4242);
    expect(servedConfig.fetch).toBe(fetch);
    expect(servedConfig.websocket).toBe(websocket);
    expect(scheduledDelay).toBe(100);

    await scheduledTask?.();
    expect(ensureRunningCalls).toBe(1);
  });

  it("throws when started before setup", () => {
    const mimoServer = new MimoServer({
      serve: (() => ({ port: 3000 })) as any,
      schedule: (() => 1) as any,
      ensureSharedFossilRunning: async () => true,
      getSharedFossilPort: () => 19000,
      logger: {
        log: () => {},
        error: () => {},
      },
    });

    expect(() => mimoServer.start()).toThrow("MimoServer must be setup before start");
  });
});
