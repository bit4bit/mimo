import type { FC } from "hono/jsx";

export type FrameId = "left" | "right";

export interface BufferProps {
  sessionId: string;
  isActive: boolean;
  [key: string]: unknown;
}

export interface BufferConfig {
  id: string;
  name: string;
  frame: FrameId;
  component: FC<BufferProps>;
}
