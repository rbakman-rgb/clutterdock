import Foundation

/// Central Free vs Pro rules. Keep in sync with docs/PRICING.md and Windows license.js.
@MainActor
enum FeatureGate {
    static let freeMaxNormalFolders = 5
    static let freeMaxItemsPerFolder = 20
    static let freeHistoryLimit = 15
    static let proHistoryLimit = 40

    static var isPro: Bool {
        LicenseManager.shared.isPro
    }

    static var tierDisplayName: String {
        isPro ? "Pro" : "Free"
    }

    static var maxNormalFolders: Int {
        isPro ? Int.max : freeMaxNormalFolders
    }

    static var maxItemsPerFolder: Int {
        isPro ? Int.max : freeMaxItemsPerFolder
    }

    static var historyLimit: Int {
        isPro ? proHistoryLimit : freeHistoryLimit
    }

    static var canUseGlobalSearch: Bool { isPro }
    static var canUseWorkspaces: Bool { isPro }
    static var canUseFolderHotkeys: Bool { isPro }
    static var canUseCustomFolderImages: Bool { isPro }
    static var canExportPack: Bool { isPro }

    static func canAddNormalFolder(currentNormalCount: Int) -> Bool {
        isPro || currentNormalCount < freeMaxNormalFolders
    }

    static func canAddItem(currentCount: Int) -> Bool {
        isPro || currentCount < freeMaxItemsPerFolder
    }

    static func folderLimitMessage(current: Int) -> String {
        "Free includes \(freeMaxNormalFolders) stacks (\(current)/\(freeMaxNormalFolders)). Upgrade to Pro for unlimited."
    }

    static func itemLimitMessage(current: Int) -> String {
        "Free includes \(freeMaxItemsPerFolder) items per stack (\(current)/\(freeMaxItemsPerFolder)). Upgrade to Pro for unlimited."
    }

    static let proUpgradeSummary = """
    ClutterDock Pro unlocks:
    • Unlimited stacks & items
    • Workspaces
    • Search all stacks
    • Per-stack hotkeys
    • Custom stack images
    • .clutterdock pack export

    One-time purchase · Mac + Windows · Free core stays free forever.
    """
}
