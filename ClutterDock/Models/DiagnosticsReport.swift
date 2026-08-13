import Foundation
import AppKit

/// In-memory ring of recent non-fatal errors for the Copy diagnostics paste.
enum DiagnosticLog {
    private static let lock = NSLock()
    private static var ring: [String] = []
    private static let cap = 8

    static func record(_ message: String) {
        lock.lock()
        defer { lock.unlock() }
        let ts = ISO8601DateFormatter().string(from: Date())
        ring.append("\(ts) \(message)")
        if ring.count > cap {
            ring.removeFirst(ring.count - cap)
        }
    }

    static func recent() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return ring
    }

    /// Tests only.
    static func resetForTests() {
        lock.lock()
        defer { lock.unlock() }
        ring.removeAll()
    }
}

/// Snapshot of support-relevant state. Never includes a full license key.
struct DiagnosticsSnapshot: Equatable {
    var appVersion: String
    var appBuild: String
    var osVersion: String
    var architecture: String
    var tier: String
    var maskedKey: String
    var stackCount: Int
    var itemCount: Int
    var workspaceCount: Int
    var historyCount: Int
    var dataDirectory: String
    var corruptBackupExists: Bool
    var preImportBackupExists: Bool
    var lastUpdateCheck: String
    var hotkeyStatus: String
    var recentErrors: [String]
}

enum DiagnosticsReport {
    static func render(_ s: DiagnosticsSnapshot) -> String {
        var lines = [
            "ClutterDock diagnostics",
            "version: \(s.appVersion) (\(s.appBuild))",
            "os: \(s.osVersion)",
            "arch: \(s.architecture)",
            "tier: \(s.tier)",
            "key: \(s.maskedKey.isEmpty ? "none" : s.maskedKey)",
            "stacks: \(s.stackCount)",
            "items: \(s.itemCount)",
            "workspaces: \(s.workspaceCount)",
            "history: \(s.historyCount)",
            "dataDir: \(s.dataDirectory)",
            "corrupt.bak: \(s.corruptBackupExists ? "yes" : "no")",
            "pre-import.bak: \(s.preImportBackupExists ? "yes" : "no")",
            "updateCheck: \(s.lastUpdateCheck)",
            "hotkey: \(s.hotkeyStatus)",
        ]
        if s.recentErrors.isEmpty {
            lines.append("errors: none")
        } else {
            lines.append("errors:")
            lines.append(contentsOf: s.recentErrors.map { "- \($0)" })
        }
        return lines.joined(separator: "\n")
    }

    @MainActor
    static func capture(store: FolderStore, history: LaunchHistory) -> DiagnosticsSnapshot {
        let dir = AppSupport.applicationSupportDirectory
        let fm = FileManager.default
        let itemCount = store.folders.reduce(0) { $0 + $1.items.count }
        return DiagnosticsSnapshot(
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown",
            appBuild: Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "unknown",
            osVersion: ProcessInfo.processInfo.operatingSystemVersionString,
            architecture: currentArchitecture(),
            tier: FeatureGate.tierDisplayName,
            maskedKey: LicenseManager.shared.licenseKeyDisplay,
            stackCount: store.folders.count,
            itemCount: itemCount,
            workspaceCount: store.workspaces.count,
            historyCount: history.entries.count,
            dataDirectory: dir.path,
            corruptBackupExists: fm.fileExists(atPath: dir.appendingPathComponent("folders.json.corrupt.bak").path),
            preImportBackupExists: fm.fileExists(atPath: dir.appendingPathComponent("folders.json.pre-import.bak").path),
            lastUpdateCheck: UpdateService.lastCheckSummary,
            hotkeyStatus: HotKeyService.lastRegistrationSummary,
            recentErrors: DiagnosticLog.recent()
        )
    }

    private static func currentArchitecture() -> String {
        #if arch(arm64)
        return "arm64"
        #elseif arch(x86_64)
        return "x86_64"
        #else
        return "unknown"
        #endif
    }
}
