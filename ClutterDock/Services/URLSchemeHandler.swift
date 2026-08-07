import AppKit
import Foundation

/// Handles `clutterdock://` URLs (also accepts legacy `slavedock://`).
///
/// Examples:
/// - clutterdock://open
/// - clutterdock://open?folder=Work
/// - clutterdock://add?path=/Applications/Safari.app
/// - clutterdock://add?url=https://example.com
/// - clutterdock://workspace?name=Work
/// - clutterdock://settings
enum URLSchemeHandler {
    @MainActor
    static func handle(_ url: URL, store: FolderStore, panel: PanelController) {
        let scheme = url.scheme?.lowercased() ?? ""
        guard scheme == "clutterdock" || scheme == "slavedock" else { return }

        let host = (url.host ?? url.path).lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let items = comps?.queryItems ?? []
        func q(_ name: String) -> String? {
            items.first { $0.name == name }?.value?.removingPercentEncoding
        }

        switch host {
        case "open", "":
            if let folder = q("folder") {
                if let match = store.folders.first(where: { $0.name.caseInsensitiveCompare(folder) == .orderedSame }) {
                    store.selectFolder(id: match.id)
                }
            }
            panel.show()

        case "settings":
            panel.showSettings()

        case "add":
            if let path = q("path") {
                let result = store.addPaths([path])
                if result.added > 0 || result.hitLimit {
                    panel.show()
                }
            }
            if let urlString = q("url") {
                _ = store.addURL(urlString)
                panel.show()
            }

        case "workspace":
            if FeatureGate.canUseWorkspaces,
               let name = q("name"),
               let ws = store.workspaces.first(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
                store.selectWorkspace(id: ws.id)
            }
            panel.show()

        default:
            panel.show()
        }
    }
}
