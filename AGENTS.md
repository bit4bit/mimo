# AGENTS.md

This file is the instruction router for LLM agents working in this repository.

## How To Use This Guide

1. Always read `llms/core-engineering.md` first.
2. Then load only the task-relevant files from the routing table below.
3. If multiple areas apply, load multiple files.
4. When rules conflict, prefer stricter behavior (tests first, explicit dependencies, minimal safe changes).

## Routing Table

- Code design, architecture, DI, purity, env usage rules:
  - `llms/core-engineering.md`
- Commit formatting and pre-commit formatting command:
  - `llms/commits.md`
- OpenSpec lifecycle and required change-management flow:
  - `llms/workflow-openspec.md`
- ACP provider behavior, clear-session, parking, resumption, auto-commit and duplication policy:
  - `llms/acp-architecture.md`
- UI page requirements and spec references:
  - `llms/ui-standards.md`
- Test organization, test commands, and suite-health policy:
  - `llms/testing-standards.md`

## Always-On Requirements

- BDD/TDD behavior-first workflow applies to every change.
- Do not use hidden globals or singletons.
- Keep dependencies explicit via injection.
- Keep changes minimal, clear, and behavior-driven.
