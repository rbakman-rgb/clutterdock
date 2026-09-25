import Foundation

/// Uses the unfiltered stack size so typing does not make the window jump.
struct LauncherLayout: Equatable {
    static let width: CGFloat = 480
    static let spacing: CGFloat = 12
    let iconSize: CGFloat
    let itemCount: Int
    var list = false
    var showsHints = false
    var showsWorkspaces = false
    var onboarding = false
    var locked = false

    var tileWidth: CGFloat { iconSize + 40 }
    var columns: Int { max(1, Int((Self.width - 32 + Self.spacing) / (tileWidth + Self.spacing))) }
    var height: CGFloat {
        let chrome: CGFloat = 144 + (showsHints ? 22 : 0) + (showsWorkspaces ? 30 : 0)
        let content: CGFloat
        if itemCount == 0 || locked {
            content = 218
        } else if list {
            content = CGFloat(min(7, max(3, itemCount))) * 48 + 16
        } else {
            let rows = min(3, max(1, Int(ceil(Double(itemCount) / Double(columns)))))
            content = CGFloat(rows) * (iconSize + 60) + 20
        }
        return max(onboarding ? 460 : 0, chrome + content)
    }
}
