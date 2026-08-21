import CoreGraphics
import Foundation

enum LauncherAnchorMode: String, CaseIterable, Identifiable, Codable {
    case dock
    case custom

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .dock: return "Next to Dock icon"
        case .custom: return "Saved spot"
        }
    }
}

enum LauncherShowOrigin: String {
    case dock
    case menuBar
    case hotkey
    case other
}

enum DockEdge: String {
    case bottom, left, right, top, none
}

/// Pure placement math (Cocoa bottom-left coords). No private Dock APIs —
/// we infer the Dock edge from `visibleFrame` vs `frame`, then align to the
/// last Dock-icon click, a status-item frame, or the middle of that edge.
enum LauncherPlacement {
    static let pad: CGFloat = 12

    static func dockEdge(visible: CGRect, full: CGRect) -> DockEdge {
        let bottom = visible.minY - full.minY
        let left = visible.minX - full.minX
        let right = full.maxX - visible.maxX
        let top = full.maxY - visible.maxY
        let maxGap = max(bottom, left, right, top)
        guard maxGap > 8 else { return .none }
        if bottom >= maxGap { return .bottom }
        if left >= maxGap { return .left }
        if right >= maxGap { return .right }
        return .top
    }

    static func clamp(_ origin: CGPoint, size: CGSize, visible: CGRect) -> CGPoint {
        let maxX = max(visible.minX + pad, visible.maxX - size.width - pad)
        let maxY = max(visible.minY + pad, visible.maxY - size.height - pad)
        return CGPoint(
            x: min(max(origin.x, visible.minX + pad), maxX),
            y: min(max(origin.y, visible.minY + pad), maxY)
        )
    }

    static func origin(
        panelSize: CGSize,
        visibleFrame: CGRect,
        fullFrame: CGRect,
        mode: LauncherAnchorMode,
        showOrigin: LauncherShowOrigin,
        mouse: CGPoint,
        statusItemFrame: CGRect?,
        savedOrigin: CGPoint?,
        lastDockPoint: CGPoint?
    ) -> CGPoint {
        if mode == .custom, let saved = savedOrigin {
            return clamp(saved, size: panelSize, visible: visibleFrame)
        }

        if showOrigin == .menuBar, let item = statusItemFrame, item.width > 1, item.height > 1 {
            return originBesideStatusItem(panelSize: panelSize, item: item, visible: visibleFrame)
        }

        let edge = dockEdge(visible: visibleFrame, full: fullFrame)
        let icon = iconPoint(
            edge: edge,
            visible: visibleFrame,
            mouse: mouse,
            lastDockPoint: lastDockPoint,
            showOrigin: showOrigin
        )
        return originBesideDock(panelSize: panelSize, edge: edge, icon: icon, visible: visibleFrame)
    }

    static func shouldCacheDockPoint(
        showOrigin: LauncherShowOrigin,
        mouse: CGPoint,
        visible: CGRect,
        full: CGRect
    ) -> Bool {
        if showOrigin == .dock { return true }
        let edge = dockEdge(visible: visible, full: full)
        return isNearDock(mouse: mouse, edge: edge, visible: visible)
    }

    static func isNearDock(mouse: CGPoint, edge: DockEdge, visible: CGRect) -> Bool {
        let slop: CGFloat = 96
        switch edge {
        case .bottom: return mouse.y < visible.minY + slop
        case .top: return mouse.y > visible.maxY - slop
        case .left: return mouse.x < visible.minX + slop
        case .right: return mouse.x > visible.maxX - slop
        case .none: return false
        }
    }

    private static func iconPoint(
        edge: DockEdge,
        visible: CGRect,
        mouse: CGPoint,
        lastDockPoint: CGPoint?,
        showOrigin: LauncherShowOrigin
    ) -> CGPoint {
        if showOrigin == .dock { return mouse }
        if let last = lastDockPoint { return last }
        if isNearDock(mouse: mouse, edge: edge, visible: visible) { return mouse }
        switch edge {
        case .left, .right:
            return CGPoint(x: visible.minX, y: visible.midY)
        case .top:
            return CGPoint(x: visible.midX, y: visible.maxY)
        case .bottom, .none:
            return CGPoint(x: visible.midX, y: visible.minY)
        }
    }

    private static func originBesideDock(
        panelSize: CGSize,
        edge: DockEdge,
        icon: CGPoint,
        visible: CGRect
    ) -> CGPoint {
        var x: CGFloat
        var y: CGFloat
        switch edge {
        case .top:
            x = icon.x - panelSize.width / 2
            y = visible.maxY - panelSize.height - pad
        case .left:
            x = visible.minX + pad
            y = icon.y - panelSize.height / 2
        case .right:
            x = visible.maxX - panelSize.width - pad
            y = icon.y - panelSize.height / 2
        case .bottom, .none:
            x = icon.x - panelSize.width / 2
            y = visible.minY + pad
        }
        return clamp(CGPoint(x: x, y: y), size: panelSize, visible: visible)
    }

    /// Menu bar is at the top of the screen: sit just under the status item.
    private static func originBesideStatusItem(
        panelSize: CGSize,
        item: CGRect,
        visible: CGRect
    ) -> CGPoint {
        let x = item.midX - panelSize.width / 2
        var y = item.minY - panelSize.height - 6
        if y < visible.minY + pad {
            y = item.maxY + 6
        }
        return clamp(CGPoint(x: x, y: y), size: panelSize, visible: visible)
    }
}
