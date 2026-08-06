import AppKit
import SwiftUI
import QuartzCore

@MainActor
final class PanelController {
    private var panel: NSPanel?
    private let store: FolderStore
    private let preferences: AppPreferences
    private let runningApps: RunningAppsService
    private let history: LaunchHistory
    private var settingsWindow: NSWindow?
    private var prefsObserver: NSObjectProtocol?
    /// True while the fade-out animation is running (panel still “visible”).
    private var isHiding = false
    private var resignObserver: NSObjectProtocol?

    init(
        store: FolderStore,
        preferences: AppPreferences,
        runningApps: RunningAppsService,
        history: LaunchHistory
    ) {
        self.store = store
        self.preferences = preferences
        self.runningApps = runningApps
        self.history = history

        prefsObserver = NotificationCenter.default.addObserver(
            forName: .clutterDockPreferencesChanged,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in self?.syncPanelSize() }
        }
    }

    deinit {
        if let prefsObserver {
            NotificationCenter.default.removeObserver(prefsObserver)
        }
        if let resignObserver {
            NotificationCenter.default.removeObserver(resignObserver)
        }
    }

    var isVisible: Bool {
        guard let panel else { return false }
        return panel.isVisible && !isHiding
    }

    func toggle() {
        if isHiding {
            // User re-opened mid close — cancel hide and show again
            show()
            return
        }
        if isVisible { hide() } else { show() }
    }

    func show() {
        let panel = ensurePanel()
        isHiding = false
        syncPanelSize()
        position(panel)
        runningApps.refresh()
        NSApp.activate(ignoringOtherApps: true)

        // Cancel any in-flight hide
        panel.alphaValue = 0
        panel.makeKeyAndOrderFront(nil)
        panel.orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.14
            ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().alphaValue = 1
        }
    }

    func hide() {
        guard let panel, panel.isVisible, !isHiding else { return }
        isHiding = true
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.1
            ctx.timingFunction = CAMediaTimingFunction(name: .easeIn)
            panel.animator().alphaValue = 0
        }, completionHandler: { [weak self, weak panel] in
            DispatchQueue.main.async {
                // Only finish hide if we weren't reopened mid-animation
                guard let self, self.isHiding else {
                    panel?.alphaValue = 1
                    return
                }
                panel?.orderOut(nil)
                panel?.alphaValue = 1
                self.isHiding = false
            }
        })
    }

    func showSettings() {
        if let settingsWindow, settingsWindow.isVisible {
            settingsWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let root = SettingsView(store: store, preferences: preferences, history: history)
            .frame(minWidth: 640, minHeight: 480)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 700, height: 520),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "ClutterDock Settings"
        window.contentView = NSHostingView(rootView: root)
        window.center()
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("ClutterDockSettings")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        settingsWindow = window
    }

    private func ensurePanel() -> NSPanel {
        if let panel { return panel }

        let content = LauncherView(
            store: store,
            preferences: preferences,
            runningApps: runningApps,
            history: history,
            onDismiss: { [weak self] in self?.hide() },
            onOpenSettings: { [weak self] in
                self?.hide()
                // Small delay so hide animation doesn't fight settings key window
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    self?.showSettings()
                }
            }
        )

        let hosting = NSHostingView(rootView: content)
        let size = NSSize(width: preferences.panelWidth, height: preferences.panelHeight)
        hosting.frame = NSRect(origin: .zero, size: size)
        // Kill AppKit focus rings that draw a blue outline around the panel
        hosting.focusRingType = .none

        // Borderless floating panel — no system key-window chrome (the blue edge)
        let panel = NSPanel(
            contentRect: hosting.frame,
            styleMask: [.borderless, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.title = "ClutterDock"
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = false
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.contentView = hosting
        panel.contentView?.focusRingType = .none
        panel.animationBehavior = .utilityWindow
        panel.becomesKeyOnlyIfNeeded = false
        // Ensure no system border / textured chrome leaks through
        panel.isRestorable = false

        resignObserver = NotificationCenter.default.addObserver(
            forName: NSWindow.didResignKeyNotification,
            object: panel,
            queue: .main
        ) { [weak self] _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { [weak self] in
                guard let self else { return }
                // Keep open for sheets, open panels, alerts, and settings
                if NSApp.modalWindow != nil { return }
                if self.settingsWindow?.isKeyWindow == true { return }
                if let key = NSApp.keyWindow, key !== self.panel {
                    // Don't hide if a sheet/alert took key
                    if key.sheetParent != nil || key.isSheet { return }
                    // Settings window is open
                    if key === self.settingsWindow { return }
                }
                if self.panel?.isKeyWindow != true {
                    self.hide()
                }
            }
        }

        self.panel = panel
        return panel
    }

    private func syncPanelSize() {
        guard let panel else { return }
        var frame = panel.frame
        let newSize = NSSize(width: preferences.panelWidth, height: preferences.panelHeight)
        frame.origin.y += frame.size.height - newSize.height
        frame.size = newSize
        panel.setFrame(frame, display: true)
    }

    /// Prefer a stable, Dock-friendly placement: above the Dock / near the pointer.
    private func position(_ panel: NSPanel) {
        panel.layoutIfNeeded()
        let size = panel.frame.size
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) }
            ?? NSScreen.main
            ?? NSScreen.screens.first
        guard let screen else {
            panel.center()
            return
        }

        let visible = screen.visibleFrame
        let full = screen.frame
        // Infer Dock edge from the difference between frame and visibleFrame
        let dockBottom = visible.minY - full.minY
        let dockLeft = visible.minX - full.minX
        let dockRight = full.maxX - visible.maxX
        let dockTop = full.maxY - visible.maxY

        var x = mouse.x - size.width / 2
        var y: CGFloat

        // Near bottom Dock (most common)
        if dockBottom > 8 && mouse.y < visible.minY + 120 {
            x = mouse.x - size.width / 2
            y = visible.minY + 16
        }
        // Near left Dock
        else if dockLeft > 8 && mouse.x < visible.minX + 120 {
            x = visible.minX + 16
            y = mouse.y - size.height / 2
        }
        // Near right Dock
        else if dockRight > 8 && mouse.x > visible.maxX - 120 {
            x = visible.maxX - size.width - 16
            y = mouse.y - size.height / 2
        }
        // Near top (rare)
        else if dockTop > 8 && mouse.y > visible.maxY - 80 {
            x = mouse.x - size.width / 2
            y = visible.maxY - size.height - 16
        }
        // Default: near cursor, prefer below unless near bottom of screen
        else {
            x = mouse.x - size.width / 2
            if mouse.y - size.height - 16 < visible.minY + 8 {
                y = mouse.y + 20
            } else {
                y = mouse.y - size.height - 16
            }
        }

        x = min(max(x, visible.minX + 10), visible.maxX - size.width - 10)
        y = min(max(y, visible.minY + 10), visible.maxY - size.height - 10)
        panel.setFrameOrigin(NSPoint(x: x, y: y))
    }
}
