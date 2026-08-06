import Foundation

/// Support / donation / product website links + local data roots.
enum AppSupport {
    /// Buy Me a Coffee page slug → buymeacoffee.com/<slug>
    static let buyMeACoffeeUsername = "chidichidovsky"

    /// Product domains (owned): clutterdock.com · clutterdock.app
    /// Marketing site (GitHub Pages until custom domain DNS is wired).
    static let websiteURL = URL(string: "https://rbakman-rgb.github.io/clutterdock/")!
    static let pricingURL = URL(string: "https://rbakman-rgb.github.io/clutterdock/pricing.html")!
    /// GitHub repo is still `slavedock` until renamed; product name is ClutterDock.
    static let releasesURL = URL(string: "https://github.com/rbakman-rgb/clutterdock/releases/latest")!
    static let githubURL = URL(string: "https://github.com/rbakman-rgb/clutterdock")!
    static let productDomainURL = URL(string: "https://clutterdock.com")!
    static let productAppDomainURL = URL(string: "https://clutterdock.app")!

    static var buyMeACoffeeURL: URL? {
        let slug = buyMeACoffeeUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !slug.isEmpty, slug != "YOUR_USERNAME" else { return nil }
        return URL(string: "https://www.buymeacoffee.com/\(slug)")
    }

    static var isDonateConfigured: Bool {
        buyMeACoffeeURL != nil
    }

    static let buyMeACoffeeSignupURL = URL(string: "https://www.buymeacoffee.com/signup")!

    // MARK: - Application Support (migrate SlaveDock / DockFolder)

    /// `~/Library/Application Support/ClutterDock`, migrating older product folders once.
    static var applicationSupportDirectory: URL {
        let fm = FileManager.default
        let root = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
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
