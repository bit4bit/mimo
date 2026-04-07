# AGENTS.md

## Development Philosophy

### Behavior-Driven Development (BDD)

**Write tests first — always. No implementation code exists before a failing test.**

Tests describe **behavior from the outside**, not internal implementation details.
Focus on what the system does, not how it does it.

#### Rules
- Write the integration test **before** any implementation
- Tests must be **high-coverage integration tests** — they cross real boundaries (API, DB, file system)
- Test must **fail first**, then implement the minimum code to make it pass
- **Test behaviors, never internals** — do not test variables, state, or implementation details; test what the system does, not how it does it
- No low-value or trivial tests — if it doesn't describe meaningful behavior, don't write it

#### What is a behavior test
- ✅ "when a user submits an invalid form, it returns a validation error"
- ✅ "when payment succeeds, the order status becomes confirmed"
- ❌ testing the value of a variable
- ❌ ❌ testing that a specific function or method was called
- ❌ ❌ testing internal state that is not observable from outside

#### Bug Fixing Workflow
1. **Write a failing test** that reproduces the bug exactly
2. **Confirm the test fails** — this proves the bug is real and the test is valid
3. **Fix the bug** with the minimum code change necessary
4. **Confirm the test passes** — this proves the fix works
5. Do not fix the bug before the test exists

---

### Simple Design (Kent Beck's 4 Rules)

In priority order:

1. **Tests pass** — the code does what it's supposed to do
2. **Reveals intention** — anyone can read it and understand what it does
3. **No duplication** — every piece of knowledge exists in one place (DRY)
4. **Fewest elements** — no unnecessary classes, functions, abstractions, or indirection

When in doubt, delete code, not add it. Prefer the simpler solution.

---

### Functional Thinking First

- **Prefer pure functions** — same input, same output, no side effects
- **Immutable data** — don't mutate, transform
- **Compose, don't inherit** — build behavior by combining small functions
- **Explicit over implicit** — data flows visibly through function arguments and return values
- **Side effects at the boundary** — isolate I/O, DB, and network calls to the edges of the system; keep the core pure

---

## Commits

Use the following message description
,
```
<type>(<scope>): <short description>

Agent: <agent or user name>
Task: <task name>
Description: <one sentence of what was done>
```

### Example

```
feat(parser): add discriminator support

Agent: opencode
Task: discriminator support
Description: Extended the parser to handle OpenAPI 3.1 discriminator mappings.
```

---

## Workflow: OpenSpec

This project uses OpenSpec for structured change management. Always follow this workflow:

### Starting a New Feature/Fix

1. **Explore mode** - Think through the problem, investigate, clarify requirements
   - `/opsx:explore <topic>` - Enter explore mode to think through requirements
   
2. **Create Change** - Create structured artifacts before implementing
   - `/opsx:new <change-name>` or `/opsx:ff <change-name>` - Create change with artifacts
   - Artifacts: proposal.md → design.md → specs/**/*.md → tasks.md

3. **Implement** - Execute tasks from the change
   - `/opsx:apply <change-name>` - Start implementing tasks
   - Mark tasks complete as you go: `- [ ]` → `- [x]`

4. **Verify** - Validate implementation against specs
   - `/opsx:verify <change-name>` - Check completeness, correctness, coherence

5. **Archive** - Complete the change
   - `/opsx:archive <change-name>` - Archive change, sync specs to main

---

## UI Page Requirements

Every new page MUST follow these standards:

**Component Structure:**
- MUST extend `Layout` component with appropriate `title` prop
- MUST render inside container with consistent max-width (800px for lists, 400px for forms)
- MUST use project standard CSS classes (`.btn`, `.btn-secondary`, `.form-group`, etc.)

**Form Requirements:**
- MUST use `method="post"` (lowercase)
- MUST provide Cancel button alongside Submit
- MUST display validation errors in `.error-message` div
- MUST include help text with `.form-help` class

**Page Standards:**
- List pages: max-width 800px, title bar with action button
- Form pages: max-width 400px, consistent field styling
- Detail pages: max-width 800px, clearly organized sections

### Key Spec Locations

- `openspec/specs/vcs-credentials/spec.md` - VCS credential requirements
- `openspec/specs/projects/spec.md` - Project requirements
- `openspec/specs/<capability>/spec.md` - Other capability specs

### Never Skip

- ✅ Write tests first (BDD)
- ✅ Create OpenSpec artifacts before implementing
- ✅ Use Layout component for all pages
- ✅ Follow UI standards from specs
- ✅ Verify before archiving
