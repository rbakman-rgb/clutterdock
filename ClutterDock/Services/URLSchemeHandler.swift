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
            // Anything (a web page, another app) can invoke this scheme, so never
            // mutate the user's stacks without showing them exactly what's being added.
            confirmExternalAdd(path: q("path"), urlString: q("url"), store: store, panel: panel)

        case "workspace":
            if FeatureGate.canUseWorkspaces,
               let name = q("name"),
               let ws = store.workspaces.first(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
                store.selectWorkspace(id: ws.id)
            }
            panel.show()

        default:
            break // unknown host: ignore rather than popping the panel
        }
    }

    @MainActor
    private static func confirmExternalAdd(
        path: String?,
        urlString: String?,
        store: FolderStore,
        panel: PanelController
    ) {
        var lines: [String] = []
        if let path { lines.append("File: \(path)") }
        if let urlString { lines.append("URL: \(urlString)") }
        guard !lines.isEmpty else { return }

        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Add to ClutterDock?"
        alert.informativeText = "Another app or link asked ClutterDock to add:\n\n"
            + lines.joined(separator: "\n")
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Add")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }

        var changed = false
        if let path {
            let result = store.addPaths([path])
            changed = result.added > 0 || result.hitLimit
        }
        if let urlString {
            let result = store.addURL(urlString)
            changed = result.added > 0 || result.hitLimit || changed
        }
        if changed { panel.show() }
    }
}
