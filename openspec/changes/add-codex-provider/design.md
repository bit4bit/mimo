## Context

`mimo-agent` hosts a provider abstraction (`IAcpProvider`) that wraps an ACP-compatible subprocess and exposes a common API for spawning, mapping session state, and handling model/mode switches. The agent currently ships `OpencodeProvider` (default) and `ClaudeAgentProvider`; both live under `packages/mimo-agent/src/acp/providers/`. Provider choice is selected once per agent process via the `--provider` CLI flag.

The Codex ACP adapter (`codex-acp`) is distributed by Zed as an ACP-compliant binary and npm package. It streams rich update types (thought, message, usage, plan/tool updates) and exposes model/mode configuration through `configOptions`. Today, mimo-agent users who want Codex must run a separate client; we need first-class provider parity inside mimo-agent.

## Goals / Non-Goals

**Goals:**
- Allow mimo-agent to spawn Codex via the existing provider abstraction.
- Surface Codex model and mode configuration to the platform without custom wiring.
- Forward key streaming updates (thought, message, usage, plan/tool metadata) using the existing callback pathways.
- Document setup requirements so operators can install `codex-acp` and supply credentials.

**Non-Goals:**
- Build Codex-specific UI in mimo-platform or change ACP transport semantics.
- Introduce runtime detection or auto-installation of the `codex-acp` binary.
- Support per-session provider switching beyond the current agent-level flag.
- Alter Codex credential flows (e.g., handling ChatGPT login). Those remain the user’s responsibility.

## Decisions

### Provider implementation mirrors existing pattern
Create `CodexProvider` under `src/acp/providers` implementing `IAcpProvider`. `spawn()` executes `codex-acp` (no args) with stdio pipes. This keeps provider logic encapsulated alongside Opencode/Claude and lets the session manager treat Codex identically to other adapters.

### Prefer configOptions for state extraction, fall back to legacy fields
Codex returns `config_options` for model and mode selections; we will parse these first to populate `ModelState` / `ModeState`. If absent (older builds), we fall back to `models`/`modes` fields. This mirrors Claude’s approach and keeps behaviour consistent across providers.

### Use setSessionConfigOption for model/mode updates
Unlike Opencode, Codex implements the standard ACP `set_session_config_option`. `CodexProvider.setModel`/`setMode` will call `connection.setSessionConfigOption` using the option IDs captured during initialization. This avoids Codex-specific RPCs in the core client.

### Map streaming updates conservatively
`mapUpdateType` will translate:
- `agent_thought_chunk` → `thought_chunk`
- `agent_message_chunk` → `message_chunk`
- `usage_update` → `usage_update`
- `plan_update`, `tool_call_update`, `config_option_update`, `available_commands_update` → return strings so they flow through `onGenericUpdate` (allowing the platform to log them) rather than discarding. Unrecognized updates are dropped (return `null`).

### Add dependency on npm package
Add `@zed-industries/codex-acp` (pin latest stable, currently `0.11.1`) to `packages/mimo-agent/package.json`. While the agent ultimately shells out to the binary, bundling the package simplifies local installs (`bun install` provides `node_modules/.bin/codex-acp`). We document that operators may also install a system binary as long as `codex-acp` is on PATH.

### Extend provider selection CLI validation
Update `AgentConfig.provider` type union, CLI parsing, and error messaging so `--provider codex` is accepted and unknown values print the expanded list. Provider mapping table stays in `index.ts`.

### Test coverage mirrors existing providers
Add Bun tests that:
- Assert the agent starts (logs “Starting…”) when `--provider codex` is passed.
- Validate `CodexProvider.mapUpdateType` / `extractState` / `setModel` contract stubs similar to the existing provider test suites (mocking the connection).
- Ensure provider name constant and CLI validation reflect the new option.

## Risks / Trade-offs

- **Binary unavailable on PATH** → Spawn will fail at runtime. Mitigation: surface the spawn error (already logged) and document installation steps.
- **Codex API evolution** → Update types or config schema could change. Mitigation: rely on the generic mapping fallback; keep tests focused on stable fields.
- **Credential misconfiguration** → Users must set `CODEX_API_KEY`, `OPENAI_API_KEY`, or ChatGPT login. Out of scope technically; documentation reminders help reduce confusion.
- **Additional dependency weight** → Adding `@zed-industries/codex-acp` increases install size. Mitigation: the benefit of shipping the binary wrapper outweighs the size cost; it’s optional but improves UX.

## Migration Plan

1. Add dependency and provider implementation behind feature branch.
2. Run existing Bun test suite; add new provider tests and ensure they pass.
3. Validate manually by running mimo-agent with `--provider codex` against a local Codex install (smoke prompt).
4. Update README and any operator docs with Codex instructions.
5. Release as part of the next agent build; no data migration required.

## Open Questions

- Should we expose Codex-specific config options (e.g., reasoning effort) in the platform UI immediately, or treat them as generic updates for now?
- Do we want a pre-flight check for binary availability (`which codex-acp`) during startup to fail fast with a clearer message?
