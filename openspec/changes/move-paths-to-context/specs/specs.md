# Move Paths to Context - Specifications

## Overview

This change is a **pure refactoring** with no behavioral changes. No new capabilities are added, and no existing capability requirements are modified.

The purpose of this document is to explicitly state that the refactoring maintains all existing behavior while changing the internal implementation to use dependency injection.

## ADDED Requirements

*None - this is a pure refactoring*

## MODIFIED Requirements

*None - no spec-level requirements are changing*

## REMOVED Requirements

*None - no capabilities are being removed*

## Implementation Constraints

### Constraint: Path Access via Context
All code that accesses file system paths SHALL obtain them from `mimoContext.paths` rather than importing from `config/paths.ts`.

### Constraint: Service Initialization
All services that depend on paths SHALL be initialized with paths provided via `createMimoContext()`.

### Constraint: No Behavioral Changes
The refactoring SHALL NOT change any external behavior, API responses, or file system structure.

## Verification Strategy

Since this is a refactoring with no behavioral changes, verification is through:
1. All existing tests SHALL pass without modification
2. No changes to spec requirements
3. Code review confirms path dependencies are injected
4. `config/paths.ts` SHALL be deletable after migration
