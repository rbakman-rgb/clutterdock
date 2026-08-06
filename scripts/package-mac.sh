#!/bin/zsh
# Build a universal Mac .app and zip it for GitHub Releases.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
APP="$BUILD/ClutterDock.app"
DIST="$ROOT/dist"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$ROOT/ClutterDock/Info.plist" 2>/dev/null || echo "0.0.0")"
ZIP_NAME="ClutterDock-${VERSION}-mac.zip"

echo "→ Packaging Mac release v${VERSION}"

"$ROOT/scripts/build.sh" universal

mkdir -p "$DIST"
rm -f "$DIST/$ZIP_NAME"

# ditto preserves code signature and resource forks better than zip alone.
(
  cd "$BUILD"
  ditto -c -k --keepParent "ClutterDock.app" "$DIST/$ZIP_NAME"
)

# Quick sanity checks
unzip -l "$DIST/$ZIP_NAME" | head -20
shasum -a 256 "$DIST/$ZIP_NAME" | tee "$DIST/${ZIP_NAME}.sha256"

echo ""
echo "✓ Package ready: $DIST/$ZIP_NAME"
echo "  Upload to GitHub Release or run: gh release upload <tag> \"$DIST/$ZIP_NAME\""
