import Foundation
import CryptoKit
import Combine
import AppKit

/// Offline Pro license validation (HMAC). Same scheme as Windows `license.js`.
@MainActor
final class LicenseManager: ObservableObject {
    static let shared = LicenseManager()

    @Published private(set) var isPro: Bool = false
    @Published private(set) var licenseKeyDisplay: String = ""
    @Published private(set) var lastError: String?

    private let defaults = UserDefaults.standard
    private let keyStorageKey = "slaveDock.proLicenseKey"

    /// Must match windows/src/license.js PRODUCT_SECRET
    private static let productSecret = "sd-pro-v1-k9m2x7q4-rbakman-slavedock"

    /// Always-valid test key for development and demos (document in PRICING.md).
    static let testUnlockKey = "SDPRO-TEST-UNLOCK-2026"

    private init() {
        reload()
    }

    func reload() {
        let stored = defaults.string(forKey: keyStorageKey) ?? ""
        if Self.validate(stored) {
            isPro = true
            licenseKeyDisplay = Self.mask(stored)
            lastError = nil
        } else {
            isPro = false
            licenseKeyDisplay = ""
        }
    }

    @discardableResult
    func activate(key: String) -> Bool {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard Self.validate(trimmed) else {
            lastError = "That license key isn’t valid."
            return false
        }
        defaults.set(trimmed.uppercased(), forKey: keyStorageKey)
        isPro = true
        licenseKeyDisplay = Self.mask(trimmed)
        lastError = nil
        NotificationCenter.default.post(name: .slaveDockLicenseChanged, object: nil)
        return true
    }

    func deactivate() {
        defaults.removeObject(forKey: keyStorageKey)
        isPro = false
        licenseKeyDisplay = ""
        lastError = nil
        NotificationCenter.default.post(name: .slaveDockLicenseChanged, object: nil)
    }

    // MARK: - Validation

    /// Format: SDPRO-XXXX-YYYY-ZZZZ where XXXX is serial (4 chars) and YYYYZZZZ is HMAC hex prefix.
    /// Test key: SDPRO-TEST-UNLOCK-2026
    static func validate(_ key: String) -> Bool {
        let normalized = key.uppercased().filter { $0.isLetter || $0.isNumber || $0 == "-" }
        let compact = normalized.replacingOccurrences(of: "-", with: "")

        if compact == "SDPROTESTUNLOCK2026" { return true }

        // SDPRO + 4 serial + 8 hex signature
        guard compact.hasPrefix("SDPRO"), compact.count == 16 else { return false }
        let serial = String(compact.dropFirst(5).prefix(4))
        let sig = String(compact.suffix(8))
        let expected = hmacHex(message: serial).prefix(8).uppercased()
        return sig == expected
    }

    /// Generate a license for a 4-character serial (A-Z0-9).
    static func generateKey(serial: String) -> String? {
        let s = serial.uppercased().filter { $0.isLetter || $0.isNumber }
        guard s.count == 4 else { return nil }
        let sig = String(hmacHex(message: s).prefix(8)).uppercased()
        let a = sig.prefix(4)
        let b = sig.suffix(4)
        return "SDPRO-\(s)-\(a)-\(b)"
    }

    private static func hmacHex(message: String) -> String {
        let key = SymmetricKey(data: Data(productSecret.utf8))
        let data = Data(message.utf8)
        let mac = HMAC<SHA256>.authenticationCode(for: data, using: key)
        return mac.map { String(format: "%02x", $0) }.joined()
    }

    private static func mask(_ key: String) -> String {
        let u = key.uppercased()
        guard u.count > 10 else { return "••••" }
        return String(u.prefix(10)) + "••••"
    }
}

extension Notification.Name {
    static let slaveDockLicenseChanged = Notification.Name("slaveDockLicenseChanged")
}

// MARK: - UI helper

enum UpgradePresenter {
    @MainActor
    static func showLimitAlert(message: String, onUpgrade: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "SlaveDock Pro"
        alert.informativeText = message + "\n\n" + FeatureGate.proUpgradeSummary
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Upgrade…")
        alert.addButton(withTitle: "Not Now")
        if alert.runModal() == .alertFirstButtonReturn {
            onUpgrade()
        }
    }
}
