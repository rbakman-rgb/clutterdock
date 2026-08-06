import Foundation
import AppKit
import UniformTypeIdentifiers

/// Shared drag-and-drop import helpers for Finder files, web URLs, and internal item moves.
enum DropImport {
    /// Types accepted when dropping into a stack from outside the app.
    static let externalTypes: [UTType] = [.fileURL, .url, .plainText, .utf8PlainText, .text]

    /// Types used for reordering / moving items between folders inside ClutterDock.
    static let internalItemTypes: [UTType] = [.plainText, .utf8PlainText, .text]

    static let allAcceptedTypes: [UTType] = {
        var seen = Set<String>()
        var out: [UTType] = []
        for t in externalTypes + internalItemTypes {
            if seen.insert(t.identifier).inserted { out.append(t) }
        }
        return out
    }()

    /// Custom type identifier encoding a ClutterDock item UUID for cross-folder moves.
    static let itemUUIDType = "com.ronald.clutterdock.item-uuid"

    struct ParsedDrop {
        var paths: [String] = []
        var urlStrings: [String] = []
        var itemIDs: [UUID] = []
    }

    /// Load every useful payload from drop providers (async).
    static func parse(_ providers: [NSItemProvider]) async -> ParsedDrop {
        var result = ParsedDrop()
        for provider in providers {
            // Internal item UUID (preferred custom type, then plain text UUID)
            if provider.hasItemConformingToTypeIdentifier(itemUUIDType) {
                if let id = await loadUUID(provider, type: itemUUIDType) {
                    result.itemIDs.append(id)
                    continue
                }
            }
            if let id = await loadPlainUUID(provider) {
                result.itemIDs.append(id)
                continue
            }

            // File URLs from Finder
            if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                if let url = await loadURL(provider, type: UTType.fileURL.identifier), url.isFileURL {
                    result.paths.append(url.path)
                    continue
                }
            }

            // Web URLs
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                if let url = await loadURL(provider, type: UTType.url.identifier) {
                    if url.isFileURL {
                        result.paths.append(url.path)
                    } else {
                        result.urlStrings.append(url.absoluteString)
                    }
                    continue
                }
            }

            // Plain text that looks like a path or URL
            if let text = await loadString(provider) {
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                if let uuid = UUID(uuidString: trimmed) {
                    result.itemIDs.append(uuid)
                } else if trimmed.hasPrefix("/") || trimmed.hasPrefix("~") {
                    let expanded = (trimmed as NSString).expandingTildeInPath
                    result.paths.append(expanded)
                } else if trimmed.contains("://") || trimmed.contains(".") {
                    result.urlStrings.append(trimmed)
                }
            }
        }
        return result
    }

    // MARK: - Loaders

    private static func loadURL(_ provider: NSItemProvider, type: String) async -> URL? {
        await withCheckedContinuation { cont in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                cont.resume(returning: coerceURL(item))
            }
        }
    }

    private static func loadString(_ provider: NSItemProvider) async -> String? {
        let types = [UTType.plainText.identifier, UTType.utf8PlainText.identifier, UTType.text.identifier]
        for type in types where provider.hasItemConformingToTypeIdentifier(type) {
            let value: String? = await withCheckedContinuation { cont in
                provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                    cont.resume(returning: coerceString(item))
                }
            }
            if let value, !value.isEmpty { return value }
        }
        return nil
    }

    private static func loadUUID(_ provider: NSItemProvider, type: String) async -> UUID? {
        let s: String? = await withCheckedContinuation { cont in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                cont.resume(returning: coerceString(item))
            }
        }
        guard let s else { return nil }
        return UUID(uuidString: s.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private static func loadPlainUUID(_ provider: NSItemProvider) async -> UUID? {
        guard let s = await loadString(provider) else { return nil }
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        // Only treat pure UUID strings as item IDs (avoid hijacking short text)
        return UUID(uuidString: trimmed)
    }

    private static func coerceURL(_ item: NSSecureCoding?) -> URL? {
        if let url = item as? URL { return url }
        if let data = item as? Data {
            return URL(dataRepresentation: data, relativeTo: nil)
        }
        if let s = item as? String {
            if s.hasPrefix("file:"), let u = URL(string: s) { return u }
            if s.hasPrefix("/") { return URL(fileURLWithPath: s) }
            return URL(string: s)
        }
        if let s = item as? NSString {
            let str = s as String
            if str.hasPrefix("file:"), let u = URL(string: str) { return u }
            if str.hasPrefix("/") { return URL(fileURLWithPath: str) }
            return URL(string: str)
        }
        return nil
    }

    private static func coerceString(_ item: NSSecureCoding?) -> String? {
        if let s = item as? String { return s }
        if let s = item as? NSString { return s as String }
        if let d = item as? Data { return String(data: d, encoding: .utf8) }
        return nil
    }

    /// Build an item provider that represents a DockItem for internal drag (reorder / move).
    static func itemProvider(for itemID: UUID) -> NSItemProvider {
        let provider = NSItemProvider()
        let idString = itemID.uuidString
        provider.registerDataRepresentation(
            forTypeIdentifier: itemUUIDType,
            visibility: .ownProcess
        ) { completion in
            completion(idString.data(using: .utf8), nil)
            return nil
        }
        provider.registerDataRepresentation(
            forTypeIdentifier: UTType.plainText.identifier,
            visibility: .ownProcess
        ) { completion in
            completion(idString.data(using: .utf8), nil)
            return nil
        }
        return provider
    }
}
