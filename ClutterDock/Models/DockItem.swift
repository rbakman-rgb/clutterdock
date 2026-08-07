import Foundation
import AppKit

enum DockItemKind: String, Codable, CaseIterable, Identifiable {
    case app
    case file
    case folder
    case url

    var id: String { rawValue }

    var label: String {
        switch self {
        case .app: return "App"
        case .file: return "File"
        case .folder: return "Folder"
        case .url: return "URL"
        }
    }
}

/// An entry in a ClutterDock folder — app, file, folder, or URL.
struct DockItem: Identifiable, Codable, Equatable, Hashable {
    let id: UUID
    var kind: DockItemKind
    /// File path for app/file/folder, or absolute URL string for urls.
    var path: String
    var name: String

    init(id: UUID = UUID(), kind: DockItemKind, path: String, name: String? = nil) {
        self.id = id
        self.kind = kind
        if kind == .url {
            self.path = path.trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            self.path = Self.normalizePath(path)
        }
        if let name, !name.isEmpty {
            self.name = name
        } else {
            self.name = Self.defaultName(kind: kind, path: self.path)
        }
    }

    /// Legacy v1/v2 decoder support (apps only).
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        if let kind = try c.decodeIfPresent(DockItemKind.self, forKey: .kind) {
            self.kind = kind
        } else {
            self.kind = .app
        }
        let rawPath = try c.decode(String.self, forKey: .path)
        if self.kind == .url {
            path = rawPath
        } else {
            path = Self.normalizePath(rawPath)
        }
        name = try c.decodeIfPresent(String.self, forKey: .name)
            ?? Self.defaultName(kind: kind, path: path)
    }

    var fileURL: URL {
        URL(fileURLWithPath: path)
    }

    var webURL: URL? {
        guard kind == .url else { return nil }
        return URL(string: path)
    }

    var exists: Bool {
        switch kind {
        case .url:
            return webURL != nil
        case .app:
            var isDir: ObjCBool = false
            let ok = FileManager.default.fileExists(atPath: path, isDirectory: &isDir)
            return ok && isDir.boolValue && path.hasSuffix(".app")
        case .file:
            var isDir: ObjCBool = false
            let ok = FileManager.default.fileExists(atPath: path, isDirectory: &isDir)
            return ok && !isDir.boolValue
        case .folder:
            var isDir: ObjCBool = false
            let ok = FileManager.default.fileExists(atPath: path, isDirectory: &isDir)
            return ok && isDir.boolValue
        }
    }

    var bundleIdentifier: String? {
        guard kind == .app else { return nil }
        return Bundle(url: fileURL)?.bundleIdentifier
    }

    var searchText: String {
        "\(name) \(path)".lowercased()
    }

    /// Identity used for duplicate detection within a folder.
    var dedupeKey: String {
        "\(kind.rawValue)|\(path)"
    }

    static func normalizePath(_ path: String) -> String {
        var p = path
        if p.hasSuffix("/") { p = String(p.dropLast()) }
        return URL(fileURLWithPath: p).resolvingSymlinksInPath().path
    }

    static func defaultName(kind: DockItemKind, path: String) -> String {
        switch kind {
        case .url:
            if let host = URL(string: path)?.host { return host }
            return path
        case .app:
            let url = URL(fileURLWithPath: path)
            if let bundle = Bundle(url: url),
               let n = bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String,
               !n.isEmpty { return n }
            if let bundle = Bundle(url: url),
               let n = bundle.object(forInfoDictionaryKey: "CFBundleName") as? String,
               !n.isEmpty { return n }
            return (path as NSString).lastPathComponent.replacingOccurrences(of: ".app", with: "")
        case .file, .folder:
            return (path as NSString).lastPathComponent
        }
    }

    static func kind(forPath path: String) -> DockItemKind {
        let normalized = normalizePath(path)
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: normalized, isDirectory: &isDir) else {
            return normalized.hasSuffix(".app") ? .app : .file
        }
        if isDir.boolValue {
            return normalized.hasSuffix(".app") ? .app : .folder
        }
        return .file
    }

    static func fromPath(_ path: String) -> DockItem? {
        let kind = kind(forPath: path)
        let normalized = normalizePath(path)
        guard FileManager.default.fileExists(atPath: normalized) else { return nil }
        return DockItem(kind: kind, path: normalized)
    }

    /// Web-style URLs only: file://, smb:// etc. would turn a "link" into a one-click
    /// file/app launcher, which matters because URLs can arrive from untrusted sources
    /// (clutterdock:// scheme, imported packs).
    static let allowedURLSchemes: Set<String> = ["http", "https", "mailto"]

    static func fromURLString(_ string: String) -> DockItem? {
        var s = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return nil }
        if !s.contains("://") && !s.lowercased().hasPrefix("mailto:") {
            s = "https://\(s)"
        }
        guard let url = URL(string: s),
              let scheme = url.scheme?.lowercased(),
              allowedURLSchemes.contains(scheme) else { return nil }
        return DockItem(kind: .url, path: url.absoluteString, name: url.host ?? url.absoluteString)
    }
}
