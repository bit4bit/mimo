# Bug Fix: Initial Instructions Response

## Overview

This change is a **bug fix** that requires no new specifications. The existing behavior (showing agent responses to initial instructions) was intended but broken due to a missing `promptId` in the message flow.

## Current Spec Coverage

The existing chat streaming pipeline specification already covers:
- `message_chunk` events require a `promptId` for tracking
- Agent responses are streamed via `message_chunk`, `thought_chunk`, `usage_update`, and `prompt_completed` events
- The `promptId` links the outgoing prompt to incoming response chunks

## What Changed (Implementation Only)

- **Before**: `initial_prompt` messages were sent without a `promptId`, causing their responses to be dropped
- **After**: `initial_prompt` messages generate and track a `promptId`, allowing responses to flow through the existing pipeline

No new behaviors, APIs, or user-facing contracts are introduced.

## Tests

See `tasks.md` for test updates needed to verify the fix.
