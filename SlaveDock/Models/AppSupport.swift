import Foundation

/// Support / donation / product website links.
enum AppSupport {
    /// Buy Me a Coffee page slug → buymeacoffee.com/<slug>
    static let buyMeACoffeeUsername = "chidichidovsky"

    /// Public marketing site (GitHub Pages).
    static let websiteURL = URL(string: "https://rbakman-rgb.github.io/slavedock/")!
    static let pricingURL = URL(string: "https://rbakman-rgb.github.io/slavedock/pricing.html")!
    static let releasesURL = URL(string: "https://github.com/rbakman-rgb/slavedock/releases/latest")!
    static let githubURL = URL(string: "https://github.com/rbakman-rgb/slavedock")!

    static var buyMeACoffeeURL: URL? {
        let slug = buyMeACoffeeUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !slug.isEmpty, slug != "YOUR_USERNAME" else { return nil }
        return URL(string: "https://www.buymeacoffee.com/\(slug)")
    }

    static var isDonateConfigured: Bool {
        buyMeACoffeeURL != nil
    }

    static let buyMeACoffeeSignupURL = URL(string: "https://www.buymeacoffee.com/signup")!
}
