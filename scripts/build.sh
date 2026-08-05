#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/SlaveDock"
BUILD="$ROOT/build"
APP="$BUILD/SlaveDock.app"
MACOS="$APP/Contents/MacOS"
RES="$APP/Contents/Resources"
BIN="$MACOS/SlaveDock"

SDK="$(xcrun --show-sdk-path --sdk macosx)"
MIN_OS="14.0"
ARCH="$(uname -m)"
TARGET="${ARCH}-apple-macosx${MIN_OS}"

echo "→ Building SlaveDock v1.3.0 (Free/Pro) for $TARGET"

rm -rf "$APP"
mkdir -p "$MACOS" "$RES"

SOURCES=(
  "$SRC/SlaveDockApp.swift"
  "$SRC/AppDelegate.swift"
  "$SRC/Models/DockItem.swift"
  "$SRC/Models/AppFolder.swift"
  "$SRC/Models/FolderStore.swift"
  "$SRC/Models/AppPreferences.swift"
  "$SRC/Models/AppSupport.swift"
  "$SRC/Models/LaunchHistory.swift"
  "$SRC/Models/FeatureGate.swift"
  "$SRC/Models/LicenseManager.swift"
  "$SRC/Services/AppIconService.swift"
  "$SRC/Services/LaunchService.swift"
  "$SRC/Services/RunningAppsService.swift"
  "$SRC/Services/HotKeyService.swift"
  "$SRC/Services/LoginItemService.swift"
  "$SRC/Services/URLSchemeHandler.swift"
  "$SRC/Helpers/PanelController.swift"
  "$SRC/Views/LauncherView.swift"
  "$SRC/Views/SettingsView.swift"
  "$SRC/Views/OnboardingView.swift"
)

swiftc \
  -sdk "$SDK" \
  -target "$TARGET" \
  -parse-as-library \
  -O \
  -whole-module-optimization \
  -framework SwiftUI \
  -framework AppKit \
  -framework Carbon \
  -framework ServiceManagement \
  -framework UniformTypeIdentifiers \
  -framework CryptoKit \
  "${SOURCES[@]}" \
  -o "$BIN"

cp "$SRC/Info.plist" "$APP/Contents/Info.plist"

if [[ -f "$SRC/Resources/AppIcon.icns" ]]; then
  cp "$SRC/Resources/AppIcon.icns" "$RES/AppIcon.icns"
fi

echo -n "APPL????" > "$APP/Contents/PkgInfo"

codesign --force --deep --sign - "$APP" 2>/dev/null || true

# Refresh Services menu registration
/System/Library/CoreServices/pbs -flush 2>/dev/null || true

echo "✓ Built: $APP"
echo ""
echo "Run:   open \"$APP\""
echo "Install: cp -R \"$APP\" /Applications/"
