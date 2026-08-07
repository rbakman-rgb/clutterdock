#!/bin/zsh
# Proves the Mac and Windows stack-lock implementations are byte-compatible:
# a stack locked on one platform must open on the other, or `.clutterdock` packs
# would silently become unreadable across machines.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/ClutterDock"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

PASSWORD="interop-test-password"
EXPECTED='[{"kind":"url","name":"One","path":"https://example.com/one"},{"kind":"url","name":"Two","path":"https://example.com/two"}]'

cat > "$OUT/LicenseSecret.swift" <<'EOF'
enum LicenseSecret { static let productSecret = "interop-test" }
EOF

echo "→ Building Swift interop helper"
swiftc \
  -sdk "$(xcrun --show-sdk-path --sdk macosx)" \
  -target "$(uname -m)-apple-macosx14.0" \
  -parse-as-library \
  -Xfrontend -strict-concurrency=minimal \
  -framework AppKit -framework SwiftUI -framework Carbon \
  -framework ServiceManagement -framework UniformTypeIdentifiers -framework CryptoKit \
  "$OUT/LicenseSecret.swift" \
  "$ROOT/scripts/tests/InteropLock.swift" \
  "$SRC/Models/StackLock.swift" \
  "$SRC/Models/DockItem.swift" \
  -o "$OUT/InteropLock"

fail() { echo "✗ $1"; exit 1; }

echo "→ Mac encrypts → Windows decrypts"
MAC_PAYLOAD="$("$OUT/InteropLock" encrypt "$PASSWORD")"
NODE_OUT="$(node "$ROOT/windows/scripts/interop-lock.js" decrypt "$PASSWORD" "$MAC_PAYLOAD")"
[[ "$NODE_OUT" == "$EXPECTED" ]] || fail "Node decrypt mismatch: $NODE_OUT"
echo "  ok"

echo "→ Windows encrypts → Mac decrypts"
NODE_PAYLOAD="$(node "$ROOT/windows/scripts/interop-lock.js" encrypt "$PASSWORD")"
SWIFT_OUT="$("$OUT/InteropLock" decrypt "$PASSWORD" "$NODE_PAYLOAD")"
[[ "$SWIFT_OUT" == "$EXPECTED" ]] || fail "Swift decrypt mismatch: $SWIFT_OUT"
echo "  ok"

echo "→ Wrong password fails on both"
"$OUT/InteropLock" decrypt "nope" "$NODE_PAYLOAD" 2>/dev/null && fail "Swift accepted a wrong password"
node "$ROOT/windows/scripts/interop-lock.js" decrypt "nope" "$MAC_PAYLOAD" 2>/dev/null && fail "Node accepted a wrong password"
echo "  ok"

echo ""
echo "Stack lock is interoperable between macOS and Windows"
