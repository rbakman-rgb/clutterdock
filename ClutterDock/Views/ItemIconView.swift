import SwiftUI
import AppKit

/// Renders a DockItem's icon without blocking the current frame: cached icons show
/// immediately; uncached ones show a placeholder for one frame while the icon renders.
struct ItemIconView: View {
    let item: DockItem
    let size: CGFloat

    @State private var icon: NSImage?

    var body: some View {
        Image(nsImage: icon ?? AppIconService.placeholder(for: item.kind))
            .resizable()
            .interpolation(.high)
            .frame(width: size, height: size)
            .task(id: cacheKey) {
                if let cached = AppIconService.cachedIcon(for: item, size: size) {
                    icon = cached
                    return
                }
                await Task.yield() // let the placeholder frame paint first
                guard !Task.isCancelled else { return }
                icon = AppIconService.icon(for: item, size: size)
            }
    }

    private var cacheKey: String {
        "\(item.kind.rawValue)|\(item.path)|\(Int(size))"
    }
}
