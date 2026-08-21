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
    /// Fallback Settings window, only created when the SwiftUI Settings scene
    /// can't be opened via a system selector. Reused so there's never a second one.
    private var settingsWindow: NSWindow?
    // nonisolated(unsafe): read from deinit, which is not MainActor-isolated under
    // strict concurrency. Only written once from init/ensurePanel on the main actor.
    nonisolated(unsafe) private var prefsObserver: NSObjectProtocol?
    /// True while the fade-out animation is running (panel still “visible”).
    private var isHiding = false
    nonisolated(unsafe) private var resignObserver: NSObjectProtocol?
    nonisolated(unsafe) private var moveObserver: NSObjectProtocol?
    /// Skip persisting origin while we are programmatically placing the panel.
    private var isPositioning = false
    /// Screen frame of the menu-bar status item, if present.
    var menuBarAnchorFrame: (() -> NSRect?)?

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
        ) { [weak self] note in
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.syncPanelSize()
                if (note.object as? String) == AppPreferences.Keys.launcherAnchor,
                   self.preferences.launcherAnchor == .custom,
                   let panel = self.panel, panel.isVisible {
                    self.preferences.customOrigin = panel.frame.origin
                }
            }
        }
    }

    deinit {
        if let prefsObserver {
            NotificationCenter.default.removeObserver(prefsObserver)
        }
        if let resignObserver {
            NotificationCenter.default.removeObserver(resignObserver)
        }
        if let moveObserver {
            NotificationCenter.default.removeObserver(moveObserver)
        }
    }

    var isVisible: Bool {
        guard let panel else { return false }
        return panel.isVisible && !isHiding
    }

    func toggle(from origin: LauncherShowOrigin = .other) {
        if isHiding {
            // User re-opened mid close — cancel hide and show again
            show(from: origin)
            return
        }
        if isVisible { hide() } else { show(from: origin) }
    }

    func show(from origin: LauncherShowOrigin = .other) {
        let panel = ensurePanel()
        isHiding = false
        syncPanelSize()
        position(panel, from: origin)
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

    /// Prefer the SwiftUI `Settings` scene so ⌘, and this button open the *same*
    /// window. The selector is OS-version dependent (and absent on some releases),
    /// so fall back to a single reused window rather than leaving Settings
    /// unreachable — verified needed on macOS 26.
    /// Opens our own Settings window rather than the SwiftUI `Settings` scene: on
    /// macOS 26 that scene collapses the tab bar into a "»" overflow, hiding
    /// Workspaces/General/Pro/Backup/About. An existing window of either kind is
    /// reused, so ⌘, and this button never produce two divergent Settings windows.
    func showSettings() {
        NSApp.activate(ignoringOtherApps: true)
        if bringSettingsForward() { return }
        openSettingsWindow()
    }

    /// Orders an existing Settings window front. Returns false if there isn't one.
    @discardableResult
    private func bringSettingsForward() -> Bool {
        let window = settingsWindow ?? NSApp.windows.first {
            $0.title.localizedCaseInsensitiveContains("settings")
        }
        guard let window else { return false }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return window.isVisible
    }

    private func openSettingsWindow() {
        let root = SettingsView(store: store, preferences: preferences, history: history)
            .frame(minWidth: 640, minHeight: 480)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 940, height: 620),
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
                if let key = NSApp.keyWindow, key !== self.panel {
                    // Don't hide if a sheet/alert took key
                    if key.sheetParent != nil || key.isSheet { return }
                    // The SwiftUI Settings scene window is open
                    if key.title.contains("Settings") { return }
                }
                if self.panel?.isKeyWindow != true {
                    self.hide()
                }
            }
        }

        moveObserver = NotificationCenter.default.addObserver(
            forName: NSWindow.didMoveNotification,
            object: panel,
            queue: .main
        ) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in
                guard let self, !self.isPositioning, self.preferences.launcherAnchor == .custom else { return }
                guard let panel = self.panel else { return }
                self.preferences.customOrigin = panel.frame.origin
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

    /// Sit next to the Dock / menu-bar icon, or restore a saved origin.
    private func position(_ panel: NSPanel, from origin: LauncherShowOrigin) {
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

        if LauncherPlacement.shouldCacheDockPoint(
            showOrigin: origin,
            mouse: mouse,
            visible: screen.visibleFrame,
            full: screen.frame
        ) {
            preferences.lastDockPoint = mouse
        }

        let point = LauncherPlacement.origin(
            panelSize: size,
            visibleFrame: screen.visibleFrame,
            fullFrame: screen.frame,
            mode: preferences.launcherAnchor,
            showOrigin: origin,
            mouse: mouse,
            statusItemFrame: origin == .menuBar ? menuBarAnchorFrame?() : nil,
            savedOrigin: preferences.customOrigin,
            lastDockPoint: preferences.lastDockPoint
        )
        isPositioning = true
        panel.setFrameOrigin(point)
        isPositioning = false
    }
}
