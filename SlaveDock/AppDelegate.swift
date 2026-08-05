import AppKit
import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let store = FolderStore()
    let preferences = AppPreferences()
    let runningApps = RunningAppsService()
    let history = LaunchHistory()

    private var panelController: PanelController!
    private var statusItem: NSStatusItem?
    private let hotKeyService = HotKeyService()
    private var prefsObserver: NSObjectProtocol?
    private var hotkeyObserver: NSObjectProtocol?
    private var dockMenu: NSMenu?
    private var servicesWatcher: Any?

    func applicationDidFinishLaunching(_ notification: Notification) {
        panelController = PanelController(
            store: store,
            preferences: preferences,
            runningApps: runningApps,
            history: history
        )

        NSApp.setActivationPolicy(.regular)
        NSApp.servicesProvider = self

        applyMenuBarIcon()
        applyHotkeys()
        preferences.adoptSystemLoginItemState(LoginItemService.isEnabled)
        rebuildDockMenu()

        prefsObserver = NotificationCenter.default.addObserver(
            forName: .slaveDockPreferencesChanged,
            object: nil,
            queue: .main
        ) { [weak self] note in
            Task { @MainActor in
                guard let self else { return }
                let key = note.object as? String
                if key == AppPreferences.Keys.showMenuBarIcon || key == nil {
                    self.applyMenuBarIcon()
                }
                if key == AppPreferences.Keys.hotkeyEnabled
                    || key == AppPreferences.Keys.hotkeyPreset
                    || key == nil {
                    self.applyHotkeys()
                }
                self.rebuildDockMenu()
            }
        }

        hotkeyObserver = NotificationCenter.default.addObserver(
            forName: .slaveDockHotkeysNeedRefresh,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.applyHotkeys() }
        }

        NotificationCenter.default.addObserver(
            forName: .slaveDockLicenseChanged,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.applyHotkeys()
                self?.rebuildDockMenu()
            }
        }

        if preferences.openEmptyOnLaunch {
            let userFolders = store.folders.filter { !$0.isSmart }
            if userFolders.allSatisfy(\.items.isEmpty) {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { [weak self] in
                    self?.panelController.show()
                }
            }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        hotKeyService.unregister()
        if let prefsObserver { NotificationCenter.default.removeObserver(prefsObserver) }
        if let hotkeyObserver { NotificationCenter.default.removeObserver(hotkeyObserver) }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            if url.isFileURL {
                // Dropped files onto app / open with
                _ = store.addPaths([url.path])
                panelController.show()
            } else {
                URLSchemeHandler.handle(url, store: store, panel: panelController)
            }
        }
    }

    func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
        rebuildDockMenu()
        return dockMenu
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        panelController.toggle()
        return false
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    // MARK: - Finder Services (“Add to SlaveDock”)

    @objc func addToSlaveDock(_ pboard: NSPasteboard, userData: String, error: AutoreleasingUnsafeMutablePointer<NSString?>) {
        var paths: [String] = []
        if let files = pboard.propertyList(forType: .fileURL) as? [String] {
            // uncommon path
            paths.append(contentsOf: files)
        }
        if let urls = pboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] {
            paths.append(contentsOf: urls.map(\.path))
        }
        if let list = pboard.propertyList(forType: NSPasteboard.PasteboardType("NSFilenamesPboardType")) as? [String] {
            paths.append(contentsOf: list)
        }
        // Also try modern fileURL type strings
        if let strs = pboard.propertyList(forType: .string) as? String {
            // ignore
            _ = strs
        }
        if let items = pboard.pasteboardItems {
            for item in items {
                if let path = item.string(forType: .fileURL),
                   let url = URL(string: path) {
                    paths.append(url.path)
                }
            }
        }

        paths = Array(Set(paths))
        guard !paths.isEmpty else { return }
        _ = store.addPaths(paths)
        panelController.show()
    }

    // MARK: - Menu bar / hotkeys

    private func applyMenuBarIcon() {
        if preferences.showMenuBarIcon {
            if statusItem == nil {
                let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
                if let button = item.button {
                    button.image = NSImage(
                        systemSymbolName: "square.grid.2x2.fill",
                        accessibilityDescription: "SlaveDock"
                    )
                    button.image?.isTemplate = true
                    button.action = #selector(statusItemClicked(_:))
                    button.target = self
                    button.sendAction(on: [.leftMouseUp, .rightMouseUp])
                }
                statusItem = item
            }
        } else if let statusItem {
            NSStatusBar.system.removeStatusItem(statusItem)
            self.statusItem = nil
        }
    }

    private func applyHotkeys() {
        let folderBindings: [(FolderHotkey, () -> Void)] = FeatureGate.canUseFolderHotkeys
            ? store.folders.compactMap { folder in
                guard folder.hotkey != .none else { return nil }
                let id = folder.id
                return (folder.hotkey, { [weak self] in
                    Task { @MainActor in
                        self?.store.selectFolder(id: id)
                        self?.panelController.show()
                    }
                })
            }
            : []

        hotKeyService.update(
            mainEnabled: preferences.hotkeyEnabled,
            mainPreset: preferences.hotkeyPreset,
            mainHandler: { [weak self] in
                Task { @MainActor in self?.panelController.toggle() }
            },
            folderBindings: folderBindings
        )
    }

    private func rebuildDockMenu() {
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Open Launcher", action: #selector(showLauncher), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Settings…", action: #selector(showSettings), keyEquivalent: ","))

        if store.workspaces.count > 1 {
            menu.addItem(NSMenuItem.separator())
            let wsMenu = NSMenu()
            for ws in store.workspaces {
                let item = NSMenuItem(title: ws.name, action: #selector(selectWorkspace(_:)), keyEquivalent: "")
                item.representedObject = ws.id.uuidString
                item.state = ws.id == store.activeWorkspaceID ? .on : .off
                wsMenu.addItem(item)
            }
            let wsRoot = NSMenuItem(title: "Workspace", action: nil, keyEquivalent: "")
            wsRoot.submenu = wsMenu
            menu.addItem(wsRoot)
        }

        let folders = store.visibleFolders
        if !folders.isEmpty {
            menu.addItem(NSMenuItem.separator())
            for (index, folder) in folders.prefix(12).enumerated() {
                var title = folder.name
                if folder.hotkey != .none {
                    title += "  \(folder.hotkey.displayName)"
                }
                let item = NSMenuItem(title: title, action: #selector(openFolderFromDock(_:)), keyEquivalent: "")
                item.tag = index
                item.representedObject = folder.id.uuidString
                menu.addItem(item)
            }
        }

        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Buy Me a Coffee…", action: #selector(openBuyMeACoffee), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Quit SlaveDock", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        dockMenu = menu
    }

    // MARK: - Actions

    @objc private func showLauncher() { panelController.show() }
    @objc private func showSettings() { panelController.showSettings() }

    @objc private func openBuyMeACoffee() {
        if let url = AppSupport.buyMeACoffeeURL {
            NSWorkspace.shared.open(url)
        } else {
            NSWorkspace.shared.open(AppSupport.buyMeACoffeeSignupURL)
        }
    }

    @objc private func openFolderFromDock(_ sender: NSMenuItem) {
        if let idString = sender.representedObject as? String,
           let id = UUID(uuidString: idString) {
            store.selectFolder(id: id)
        }
        panelController.show()
    }

    @objc private func selectWorkspace(_ sender: NSMenuItem) {
        if let idString = sender.representedObject as? String,
           let id = UUID(uuidString: idString) {
            store.selectWorkspace(id: id)
        }
        panelController.show()
    }

    @objc private func statusItemClicked(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent else {
            panelController.toggle()
            return
        }
        if event.type == .rightMouseUp {
            let menu = NSMenu()
            menu.addItem(NSMenuItem(title: "Open Launcher", action: #selector(showLauncher), keyEquivalent: ""))
            menu.addItem(NSMenuItem(title: "Settings…", action: #selector(showSettings), keyEquivalent: ""))
            menu.addItem(NSMenuItem.separator())
            menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
            statusItem?.menu = menu
            statusItem?.button?.performClick(nil)
            DispatchQueue.main.async { [weak self] in self?.statusItem?.menu = nil }
        } else {
            panelController.toggle()
        }
    }
}
