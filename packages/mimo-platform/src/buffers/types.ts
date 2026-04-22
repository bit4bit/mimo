// Copyright (C) 2026 Jovany Leandro G.C <bit4bit@riseup.net>
// SPDX-License-Identifier: AGPL-3.0-only

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
