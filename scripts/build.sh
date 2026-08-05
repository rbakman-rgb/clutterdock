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

# universal | arm64 | x86_64 | native (default: native host arch)
ARCH_MODE="${1:-native}"

VERSION="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$SRC/Info.plist" 2>/dev/null || echo "0.0.0")"

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
  "$SRC/Services/UpdateService.swift"
  "$SRC/Helpers/PanelController.swift"
  "$SRC/Views/LauncherView.swift"
  "$SRC/Views/SettingsView.swift"
  "$SRC/Views/OnboardingView.swift"
)

compile_arch() {
  local arch="$1"
  local out="$2"
  local target="${arch}-apple-macosx${MIN_OS}"
  echo "  · swiftc ($target)"
  swiftc \
    -sdk "$SDK" \
    -target "$target" \
    -parse-as-library \
    -O \
    -whole-module-optimization \
    -Xfrontend -strict-concurrency=minimal \
    -framework SwiftUI \
    -framework AppKit \
    -framework Carbon \
    -framework ServiceManagement \
    -framework UniformTypeIdentifiers \
    -framework CryptoKit \
    "${SOURCES[@]}" \
    -o "$out"
}

echo "→ Building SlaveDock v${VERSION} (${ARCH_MODE})"

rm -rf "$APP"
mkdir -p "$MACOS" "$RES"

case "$ARCH_MODE" in
  native)
    HOST="$(uname -m)"
    compile_arch "$HOST" "$BIN"
    ;;
  arm64|x86_64)
    compile_arch "$ARCH_MODE" "$BIN"
    ;;
  universal)
    TMP="$(mktemp -d)"
    compile_arch arm64 "$TMP/SlaveDock-arm64"
    compile_arch x86_64 "$TMP/SlaveDock-x86_64"
    lipo -create -output "$BIN" "$TMP/SlaveDock-arm64" "$TMP/SlaveDock-x86_64"
    rm -rf "$TMP"
    lipo -info "$BIN"
    ;;
  *)
    echo "Usage: $0 [native|universal|arm64|x86_64]" >&2
    exit 1
    ;;
esac

cp "$SRC/Info.plist" "$APP/Contents/Info.plist"

if [[ -f "$SRC/Resources/AppIcon.icns" ]]; then
  cp "$SRC/Resources/AppIcon.icns" "$RES/AppIcon.icns"
fi

echo -n "APPL????" > "$APP/Contents/PkgInfo"

# Ad-hoc sign so the app is runnable (Developer ID notarization is a separate step).
codesign --force --deep --sign - "$APP" 2>/dev/null || true

/System/Library/CoreServices/pbs -flush 2>/dev/null || true

echo "✓ Built: $APP"
echo ""
echo "Run:     open \"$APP\""
echo "Install: cp -R \"$APP\" /Applications/"
echo "Package: ./scripts/package-mac.sh"
