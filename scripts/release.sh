#!/bin/bash
set -e

# release.sh - One-command release workflow
# Usage: ./scripts/release.sh <version>
#   version: patch | minor | major | x.y.z
#
# This script:
# 1. Bumps version in all package.json files
# 2. Commits the changes
# 3. Creates a git tag
# 4. Pushes to origin (triggers GitHub Actions release workflow)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

if [ -z "$1" ]; then
  echo "Usage: $0 <patch|minor|major|x.y.z>"
  echo ""
  echo "Examples:"
  echo "  $0 patch     # 0.0.0 → 0.0.1"
  echo "  $0 minor     # 0.0.0 → 0.1.0"
  echo "  $0 major     # 0.0.0 → 1.0.0"
  echo "  $0 1.2.3     # Set specific version"
  echo ""
  echo "Or use npm scripts:"
  echo "  bun run release:patch"
  echo "  bun run release:minor"
  echo "  bun run release:major"
  exit 1
fi

VERSION_ARG="$1"

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")

# Step 1: Bump version
echo "=== Step 1: Bumping version ($CURRENT_VERSION → ?) ==="
"$SCRIPT_DIR/bump-version.sh" "$VERSION_ARG"

# Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")

# Step 2: Commit changes
echo ""
echo "=== Step 2: Committing changes ==="
git add -A
git commit -m "chore: release v$NEW_VERSION"
echo "Committed with message: chore: release v$NEW_VERSION"

# Step 3: Create tag
echo ""
echo "=== Step 3: Creating git tag ==="
git tag "v$NEW_VERSION"
echo "Created tag: v$NEW_VERSION"

# Step 4: Push
echo ""
echo "=== Step 4: Pushing to origin ==="
echo "Pushing commit and tag to origin..."
git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo "========================================"
echo "Release v$NEW_VERSION initiated!"
echo "========================================"
echo ""
echo "GitHub Actions workflow triggered."
echo "Monitor progress at: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]//' | sed 's/\.git$//')/actions"
echo ""
echo "The release will be published automatically when CI completes."
echo "View releases at: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]//' | sed 's/\.git$//')/releases"
