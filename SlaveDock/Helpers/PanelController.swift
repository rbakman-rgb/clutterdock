import AppKit
import SwiftUI

@MainActor
final class PanelController {
    private var panel: NSPanel?
    private let store: FolderStore
    private let preferences: AppPreferences
    private let runningApps: RunningAppsService
    private let history: LaunchHistory
    private var settingsWindow: NSWindow?
    private var prefsObserver: NSObjectProtocol?

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
            forName: .slaveDockPreferencesChanged,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.syncPanelSize() }
        }
    }

    deinit {
        if let prefsObserver {
            NotificationCenter.default.removeObserver(prefsObserver)
        }
    }

    var isVisible: Bool { panel?.isVisible == true }

    func toggle() {
        if isVisible { hide() } else { show() }
    }

    func show() {
        let panel = ensurePanel()
        syncPanelSize()
        position(panel)
        runningApps.refresh()
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        panel.orderFrontRegardless()
    }

    func hide() {
        panel?.orderOut(nil)
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
        window.title = "SlaveDock Settings"
        window.contentView = NSHostingView(rootView: root)
        window.center()
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("SlaveDockSettings")
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
                self?.showSettings()
            }
        )

        let hosting = NSHostingView(rootView: content)
        let size = NSSize(width: preferences.panelWidth, height: preferences.panelHeight)
        hosting.frame = NSRect(origin: .zero, size: size)

        let panel = NSPanel(
            contentRect: hosting.frame,
            styleMask: [.titled, .fullSizeContentView, .utilityWindow],
            backing: .buffered,
            defer: false
        )
        panel.title = "SlaveDock"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = false
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.contentView = hosting
        panel.animationBehavior = .utilityWindow
        panel.becomesKeyOnlyIfNeeded = false

        NotificationCenter.default.addObserver(
            forName: NSWindow.didResignKeyNotification,
            object: panel,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 120_000_000)
                if NSApp.modalWindow != nil { return }
                if self?.settingsWindow?.isKeyWindow == true { return }
                if self?.panel?.isKeyWindow != true {
                    self?.hide()
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
        var x = mouse.x - size.width / 2
        var y: CGFloat
        let dockZone = visible.minY + 100
        if mouse.y < dockZone {
            y = mouse.y + 24
        } else {
            y = mouse.y - size.height - 12
        }
        x = min(max(x, visible.minX + 8), visible.maxX - size.width - 8)
        y = min(max(y, visible.minY + 8), visible.maxY - size.height - 8)
        panel.setFrameOrigin(NSPoint(x: x, y: y))
    }
}
