# Testing Standards

## Test Organization

### Unit Tests (`test/`)

Location: `packages/*/test/`

Characteristics:
- Fast (milliseconds)
- No external process spawning
- Mocked external dependencies
- Isolated business logic

Examples:
- Repository/database tests with temp directories
- Hono route handler tests
- Pure function tests
- Type validation tests
- VCS module tests (including git/fossil command usage for VCS behavior)

### Integration Tests (`integration-test/`)

Location: `packages/*/integration-test/`

Characteristics:
- Slower (seconds+)
- Spawn external processes via `Bun.spawn`
- Cross-system/provider interactions
- May include external network dependencies

Belongs here:
- Agent process spawning and CLI argument parsing
- Provider selection and auth flows
- Cross-system workflows that spawn external tools

Does not belong here:
- VCS module tests for module functionality
- External command usage tied to module internals
- Module-internal execSync tests

## Run Commands

```bash
# Fast unit tests
cd packages/mimo-platform && bun test
cd packages/mimo-agent && bun test

# Full suite with integration tests
cd packages/mimo-platform && bun run test.full
cd packages/mimo-agent && bun run test.full
```

## Suite Health Policy

### Before Any Change

```bash
cd packages/mimo-platform && bun test
cd packages/mimo-agent && bun test
```

- If failing, fix first or document known failures
- Do not build on a broken suite

### After Changes

```bash
cd packages/mimo-platform && bun test
cd packages/mimo-agent && bun test
```

- All tests must pass before completion
- Fix regressions before pushing

### Test Philosophy

- Tests are the safety net and must stay green
- Failing suite is a blocker
- Keep tests fast, reliable, meaningful
- Investigate failures immediately
- Do not test HTML/component internals; verify HTTP endpoints/behavior instead
