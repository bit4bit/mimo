// SPDX-License-Identifier: AGPL-3.0-only

export interface TokenUsage {
  input: number;
  output: number;
  thought: number;
  cachedRead: number;
  cachedWrite: number;
  total: number;
}

/** Per-turn usage as reported by an ACP PromptResponse. */
export interface AcpTurnUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  thoughtTokens?: number | null;
  cachedReadTokens?: number | null;
  cachedWriteTokens?: number | null;
  totalTokens?: number | null;
}

const EMPTY: TokenUsage = {
  input: 0,
  output: 0,
  thought: 0,
  cachedRead: 0,
  cachedWrite: 0,
  total: 0,
};

export function addTokenUsage(
  acc: TokenUsage | undefined,
  turn: AcpTurnUsage,
): TokenUsage {
  const base = acc ?? EMPTY;
  return {
    input: base.input + (turn.inputTokens ?? 0),
    output: base.output + (turn.outputTokens ?? 0),
    thought: base.thought + (turn.thoughtTokens ?? 0),
    cachedRead: base.cachedRead + (turn.cachedReadTokens ?? 0),
    cachedWrite: base.cachedWrite + (turn.cachedWriteTokens ?? 0),
    total: base.total + (turn.totalTokens ?? 0),
  };
}
