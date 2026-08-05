#!/usr/bin/env swift
import Foundation
import CryptoKit

// Must match LicenseManager.productSecret and windows/src/license.js
let productSecret = "sd-pro-v1-k9m2x7q4-rbakman-slavedock"

func hmacHex(message: String) -> String {
    let key = SymmetricKey(data: Data(productSecret.utf8))
    let mac = HMAC<SHA256>.authenticationCode(for: Data(message.utf8), using: key)
    return mac.map { String(format: "%02x", $0) }.joined()
}

func generateKey(serial: String) -> String? {
    let s = serial.uppercased().filter { $0.isLetter || $0.isNumber }
    guard s.count == 4 else { return nil }
    let sig = String(hmacHex(message: s).prefix(8)).uppercased()
    return "SDPRO-\(s)-\(sig.prefix(4))-\(sig.suffix(4))"
}

let args = CommandLine.arguments.dropFirst()
if args.isEmpty {
    print("Usage: swift scripts/generate-license.swift <4-char-serial> [more...]")
    print("Example: swift scripts/generate-license.swift A1B2 CUST")
    print("Test unlock (built-in): SDPRO-TEST-UNLOCK-2026")
    // Sample batch
    for s in ["A1B2", "DEMO", "RON1"] {
        if let k = generateKey(serial: s) { print(k) }
    }
} else {
    for serial in args {
        if let k = generateKey(serial: String(serial)) {
            print(k)
        } else {
            fputs("Invalid serial (need 4 A-Z/0-9): \(serial)\n", stderr)
        }
    }
}
