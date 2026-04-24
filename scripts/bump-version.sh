#!/bin/bash
set -e

# bump-version.sh - Bump version across all package.json files
# Usage: ./scripts/bump-version.sh <version>
#   version: patch | minor | major | x.y.z

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

# Get current version from root package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")

# Calculate new version
if [ -z "$1" ]; then
  echo "Error: Version argument required"
  echo "Usage: $0 <patch|minor|major|x.y.z>"
  exit 1
fi

VERSION_ARG="$1"

if [[ "$VERSION_ARG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  # Specific version provided
  NEW_VERSION="$VERSION_ARG"
elif [ "$VERSION_ARG" = "patch" ] || [ "$VERSION_ARG" = "minor" ] || [ "$VERSION_ARG" = "major" ]; then
  # Parse current version
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
  
  case "$VERSION_ARG" in
    patch)
      NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
      ;;
    minor)
      NEW_VERSION="$MAJOR.$((MINOR + 1)).0"
      ;;
    major)
      NEW_VERSION="$((MAJOR + 1)).0.0"
      ;;
  esac
else
  echo "Error: Invalid version argument '$VERSION_ARG'"
  echo "Usage: $0 <patch|minor|major|x.y.z>"
  exit 1
fi

echo "Bumping version: $CURRENT_VERSION → $NEW_VERSION"

# Update root package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\\n');
console.log('Updated: package.json');
"

# Update mimo-platform package.json
if [ -f "packages/mimo-platform/package.json" ]; then
  node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('packages/mimo-platform/package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('packages/mimo-platform/package.json', JSON.stringify(pkg, null, 2) + '\\n');
console.log('Updated: packages/mimo-platform/package.json');
"
fi

# Update mimo-agent package.json
if [ -f "packages/mimo-agent/package.json" ]; then
  node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('packages/mimo-agent/package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('packages/mimo-agent/package.json', JSON.stringify(pkg, null, 2) + '\\n');
console.log('Updated: packages/mimo-agent/package.json');
"
fi

echo ""
echo "Version bumped to $NEW_VERSION"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git diff"
echo "  2. Commit: git commit -am 'chore: bump version to $NEW_VERSION'"
echo "  3. Tag: git tag v$NEW_VERSION"
echo "  4. Push: git push origin main && git push origin v$NEW_VERSION"
