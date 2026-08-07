import AppKit
import Foundation

enum AppIconService {
    private static let cache = NSCache<NSString, NSImage>()

    static func icon(for item: DockItem, size: CGFloat = 64) -> NSImage {
        let key = "\(item.kind.rawValue)|\(item.path)|\(Int(size))" as NSString
        if let cached = cache.object(forKey: key) {
            return cached
        }
        let image = baseImage(for: item)
        let resized = resize(image, to: size)
        cache.setObject(resized, forKey: key)
        return resized
    }

    /// Cache-only lookup — lets views paint a placeholder first and render the real
    /// icon a frame later instead of blocking the first frame of a large stack.
    static func cachedIcon(for item: DockItem, size: CGFloat) -> NSImage? {
        cache.object(forKey: "\(item.kind.rawValue)|\(item.path)|\(Int(size))" as NSString)
    }

    private static var placeholders: [DockItemKind: NSImage] = [:]

    static func placeholder(for kind: DockItemKind) -> NSImage {
        if let cached = placeholders[kind] { return cached }
        let symbol: String
        switch kind {
        case .app: symbol = "app.dashed"
        case .file: symbol = "doc"
        case .folder: symbol = "folder"
        case .url: symbol = "link.circle.fill"
        }
        let image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)
            ?? NSImage(size: NSSize(width: 64, height: 64))
        placeholders[kind] = image
        return image
    }

    static func folderTabImage(folder: AppFolder, size: CGFloat = 16) -> NSImage? {
        if let path = folder.customImagePath,
           FileManager.default.fileExists(atPath: path),
           let img = NSImage(contentsOfFile: path) {
            return resize(img, to: size)
        }
        return nil
    }

    static func clearCache() {
        cache.removeAllObjects()
    }

    private static func baseImage(for item: DockItem) -> NSImage {
        switch item.kind {
        case .app, .file, .folder:
            if FileManager.default.fileExists(atPath: item.path) {
                return NSWorkspace.shared.icon(forFile: item.path)
            }
            let symbol: String
            switch item.kind {
            case .app: symbol = "app.dashed"
            case .file: symbol = "doc"
            case .folder: symbol = "folder"
            case .url: symbol = "link"
            }
            return NSImage(systemSymbolName: symbol, accessibilityDescription: nil)
                ?? NSImage(size: NSSize(width: 64, height: 64))
        case .url:
            if let img = NSImage(systemSymbolName: "link.circle.fill", accessibilityDescription: nil) {
                return img
            }
            return NSImage(systemSymbolName: "link", accessibilityDescription: nil)
                ?? NSImage(size: NSSize(width: 64, height: 64))
        }
    }

    private static func resize(_ image: NSImage, to size: CGFloat) -> NSImage {
        let target = NSSize(width: size, height: size)
        let result = NSImage(size: target)
        result.lockFocus()
        NSGraphicsContext.current?.imageInterpolation = .high
        image.draw(
            in: NSRect(origin: .zero, size: target),
            from: NSRect(origin: .zero, size: image.size),
            operation: .sourceOver,
            fraction: 1.0
        )
        result.unlockFocus()
        return result
    }
}
