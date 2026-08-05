import AppKit
import Foundation

/// Handles `slavedock://` URLs
///
/// Examples:
/// - slavedock://open
/// - slavedock://open?folder=Work
/// - slavedock://add?path=/Applications/Safari.app
/// - slavedock://add?url=https://example.com
/// - slavedock://workspace?name=Work
enum URLSchemeHandler {
    @MainActor
    static func handle(_ url: URL, store: FolderStore, panel: PanelController) {
        guard url.scheme?.lowercased() == "slavedock" else { return }

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

        case "add":
            if let path = q("path") {
                let added = store.addPaths([path])
                if added > 0 {
                    panel.show()
                }
            }
            if let urlString = q("url") {
                _ = store.addURL(urlString)
                panel.show()
            }

        case "workspace":
            if let name = q("name"),
               let ws = store.workspaces.first(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
                store.selectWorkspace(id: ws.id)
            }
            panel.show()

        default:
            panel.show()
        }
    }
}
