#!/bin/sh
set -eu

exec tini -- bun run src/index.tsx
