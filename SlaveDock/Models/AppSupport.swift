import Foundation

/// Support / donation links for the free app.
///
/// 1. Create a page at https://www.buymeacoffee.com
/// 2. Put your username (the part after buymeacoffee.com/) below.
enum AppSupport {
    /// Your Buy Me a Coffee username (page slug). Example: `"ronald"` → buymeacoffee.com/ronald
    static let buyMeACoffeeUsername = "chidichidovsky"

    static var buyMeACoffeeURL: URL? {
        let slug = buyMeACoffeeUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !slug.isEmpty, slug != "YOUR_USERNAME" else { return nil }
        return URL(string: "https://www.buymeacoffee.com/\(slug)")
    }

    /// True once you've set a real username above.
    static var isDonateConfigured: Bool {
        buyMeACoffeeURL != nil
    }

    static let buyMeACoffeeSignupURL = URL(string: "https://www.buymeacoffee.com/signup")!
}
