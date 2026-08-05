import AppKit
import Foundation

enum LaunchService {
    @discardableResult
    static func open(_ item: DockItem) -> Bool {
        switch item.kind {
        case .app:
            return launchApp(at: item.path)
        case .file, .folder:
            return openPath(item.path)
        case .url:
            return openURLString(item.path)
        }
    }

    /// Legacy
    @discardableResult
    static func launch(appAt path: String) -> Bool {
        launchApp(at: path)
    }

    @discardableResult
    static func launchApp(at path: String) -> Bool {
        let normalized = DockItem.normalizePath(path)
        guard FileManager.default.fileExists(atPath: normalized) else {
            presentError(title: "App not found", message: "Missing:\n\(normalized)")
            return false
        }
        let url = URL(fileURLWithPath: normalized)
        let config = NSWorkspace.OpenConfiguration()
        config.activates = true
        NSWorkspace.shared.openApplication(at: url, configuration: config) { _, error in
            if let error {
                DispatchQueue.main.async {
                    presentError(title: "Couldn’t open app", message: error.localizedDescription)
                }
            }
        }
        return true
    }

    @discardableResult
    static func openPath(_ path: String) -> Bool {
        let normalized = DockItem.normalizePath(path)
        guard FileManager.default.fileExists(atPath: normalized) else {
            presentError(title: "Not found", message: normalized)
            return false
        }
        return NSWorkspace.shared.open(URL(fileURLWithPath: normalized))
    }

    @discardableResult
    static func openURLString(_ string: String) -> Bool {
        guard let url = URL(string: string) else {
            presentError(title: "Invalid URL", message: string)
            return false
        }
        return NSWorkspace.shared.open(url)
    }

    static func revealInFinder(path: String) {
        let normalized = DockItem.normalizePath(path)
        let url = URL(fileURLWithPath: normalized)
        if FileManager.default.fileExists(atPath: normalized) {
            NSWorkspace.shared.activateFileViewerSelecting([url])
        } else {
            NSWorkspace.shared.open(url.deletingLastPathComponent())
        }
    }

    static func reveal(_ item: DockItem) {
        switch item.kind {
        case .url:
            if let url = item.webURL { NSWorkspace.shared.open(url) }
        default:
            revealInFinder(path: item.path)
        }
    }

    private static func presentError(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.runModal()
    }
}
