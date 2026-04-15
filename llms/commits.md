# Commit Rules

## Before Committing

Run formatter:

```bash
cd packages/mimo-platform && bun prettier . --write
```

## Commit Message Format (Strict)

```text
<type>(<scope>): <short description>

Agent: <agent or user name>
Task: <task name>
Description: <one sentence of what was done>
```

Do not add extra lines, trailers, or co-author metadata.

## Example

```text
feat(parser): add discriminator support

Agent: opencode
Task: discriminator support
Description: Extended the parser to handle OpenAPI 3.1 discriminator mappings.
```
