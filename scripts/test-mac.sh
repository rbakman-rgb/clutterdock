#!/bin/zsh
# Compiles the Mac model layer plus scripts/tests/MacModelTests.swift into a CLI
# binary and runs it. Views are excluded: they need a running app, and the value
# here is in the model/service logic.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/ClutterDock"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

SDK="$(xcrun --show-sdk-path --sdk macosx)"
MIN_OS="14.0"

# Tests don't ship, so a fixed dev secret keeps license round-trips deterministic.
cat > "$OUT/LicenseSecret.swift" <<'EOF'
enum LicenseSecret {
    static let productSecret = "test-secret-not-shipped"
}
EOF

SOURCES=("$OUT/LicenseSecret.swift" "$ROOT/scripts/tests/MacModelTests.swift")
while IFS= read -r f; do
  SOURCES+=("$f")
# PanelController/URLSchemeHandler pull in the SwiftUI view layer, which needs a
# running app — the logic worth testing lives in Models/Services/DropImport.
done < <(find "$SRC/Models" "$SRC/Services" "$SRC/Helpers" -name '*.swift' \
           ! -name 'URLSchemeHandler.swift' \
           ! -name 'PanelController.swift' | sort)

echo "→ Building Mac model tests"
swiftc \
  -sdk "$SDK" \
  -target "$(uname -m)-apple-macosx${MIN_OS}" \
  -parse-as-library \
  -Xfrontend -strict-concurrency=minimal \
  -framework AppKit \
  -framework SwiftUI \
  -framework Carbon \
  -framework ServiceManagement \
  -framework UniformTypeIdentifiers \
  -framework CryptoKit \
  "${SOURCES[@]}" \
  -o "$OUT/MacModelTests"

echo "→ Running"
"$OUT/MacModelTests"
