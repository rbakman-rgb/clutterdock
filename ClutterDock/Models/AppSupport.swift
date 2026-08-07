import Foundation

/// Support / donation / product website links + local data roots.
enum AppSupport {
    /// Buy Me a Coffee page slug → buymeacoffee.com/<slug>
    static let buyMeACoffeeUsername = "chidichidovsky"

    /// Product domain (owned): clutterdock.com (clutterdock.app redirects there)
    static let pricingURL = URL(string: "https://clutterdock.com/pricing")!

    static var buyMeACoffeeURL: URL? {
        let slug = buyMeACoffeeUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !slug.isEmpty, slug != "YOUR_USERNAME" else { return nil }
        return URL(string: "https://www.buymeacoffee.com/\(slug)")
    }

    static let buyMeACoffeeSignupURL = URL(string: "https://www.buymeacoffee.com/signup")!

    // MARK: - Application Support (migrate SlaveDock / DockFolder)

    /// `~/Library/Application Support/ClutterDock`, migrating older product folders once.
    static var applicationSupportDirectory: URL {
        let fm = FileManager.default
        let root = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support", isDirectory: true)
        let dest = root.appendingPathComponent("ClutterDock", isDirectory: true)
        if !fm.fileExists(atPath: dest.path) {
            for legacy in ["SlaveDock", "DockFolder"] {
                let src = root.appendingPathComponent(legacy, isDirectory: true)
                guard fm.fileExists(atPath: src.path) else { continue }
                try? fm.copyItem(at: src, to: dest)
                break
            }
        }
        try? fm.createDirectory(at: dest, withIntermediateDirectories: true)
        return dest
    }
}
