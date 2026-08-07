#!/usr/bin/env swift
import Foundation
import CryptoKit

// Reads the product secret from CLUTTERDOCK_LICENSE_SECRET or scripts/private/license-secret.txt
// (gitignored). The secret itself must never be committed. Same scheme as
// ClutterDock/Models/LicenseManager.swift and windows/src/license.js.

func loadSecret() -> String? {
    if let env = ProcessInfo.processInfo.environment["CLUTTERDOCK_LICENSE_SECRET"], !env.isEmpty {
        return env
    }
    let scriptDir = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
    let file = scriptDir.appendingPathComponent("private/license-secret.txt")
    if let raw = try? String(contentsOf: file, encoding: .utf8) {
        let secret = raw.split(separator: "\n").first.map(String.init)?
            .trimmingCharacters(in: .whitespaces) ?? ""
        if !secret.isEmpty { return secret }
    }
    return nil
}

guard let productSecret = loadSecret() else {
    FileHandle.standardError.write(Data("""
    ERROR: no license secret found.
    Set CLUTTERDOCK_LICENSE_SECRET or create scripts/private/license-secret.txt
    """.utf8))
    exit(1)
}

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
} else {
    for serial in args {
        if let k = generateKey(serial: String(serial)) {
            print(k)
        } else {
            fputs("Invalid serial (need 4 A-Z/0-9): \(serial)\n", stderr)
        }
    }
}
