// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Buffers terminal stdout bytes per session:terminal key so that a browser
 * WebSocket which connects after output has already been produced can receive
 * the most recent history (in particular the shell prompt emitted right after
 * spawn).
 */
export class TerminalOutputBuffer {
  private buffers = new Map<string, Buffer>();

  constructor(private readonly maxSizeBytes: number = 64 * 1024) {}

  append(sessionId: string, terminalId: string, data: Buffer): void {
    const key = this.key(sessionId, terminalId);
    const existing = this.buffers.get(key);
    const combined = existing ? Buffer.concat([existing, data]) : data;
    if (combined.length > this.maxSizeBytes) {
      this.buffers.set(key, combined.slice(-this.maxSizeBytes));
    } else {
      this.buffers.set(key, combined);
    }
  }

  get(sessionId: string, terminalId: string): Buffer | undefined {
    return this.buffers.get(this.key(sessionId, terminalId));
  }

  clear(sessionId: string, terminalId: string): void {
    this.buffers.delete(this.key(sessionId, terminalId));
  }

  private key(sessionId: string, terminalId: string): string {
    return `${sessionId}:${terminalId}`;
  }
}
