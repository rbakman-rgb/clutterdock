import AppKit
import Combine
import Foundation

@MainActor
final class RunningAppsService: ObservableObject {
    @Published private(set) var runningPaths: Set<String> = []
    @Published private(set) var runningBundleIDs: Set<String> = []
    /// Rebuilt only on launch/terminate notifications — reading it per render is free.
    @Published private(set) var runningItems: [DockItem] = []

    private var observers: [NSObjectProtocol] = []
    /// Stable per-path ids so the Running folder's ForEach identity (and selection)
    /// survives re-renders; fresh UUIDs each call made selection impossible.
    private var stableItemIDs: [String: UUID] = [:]
    /// Bundle(url:) parses Info.plist — far too slow to run per tile per render.
    private var bundleIDCache: [String: String?] = [:]

    init() {
        refresh()
        let workspace = NSWorkspace.shared.notificationCenter
        let launch = workspace.addObserver(
            forName: NSWorkspace.didLaunchApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in self?.refresh() }
        }
        let terminate = workspace.addObserver(
            forName: NSWorkspace.didTerminateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in self?.refresh() }
        }
        observers = [launch, terminate]
    }

    deinit {
        for obs in observers {
            NSWorkspace.shared.notificationCenter.removeObserver(obs)
        }
    }

    func refresh() {
        let apps = NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular }
        var paths = Set<String>()
        var ids = Set<String>()
        var items: [DockItem] = []
        for app in apps {
            if let bid = app.bundleIdentifier {
                ids.insert(bid)
            }
            guard let url = app.bundleURL else { continue }
            let path = DockItem.normalizePath(url.path)
            paths.insert(path)
            guard path.hasSuffix(".app") else { continue }
            let id: UUID
            if let existing = stableItemIDs[path] {
                id = existing
            } else {
                id = UUID()
                stableItemIDs[path] = id
            }
            items.append(DockItem(id: id, kind: .app, path: path, name: app.localizedName))
        }
        runningPaths = paths
        runningBundleIDs = ids
        runningItems = items.sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    func isRunning(_ item: DockItem) -> Bool {
        guard item.kind == .app else { return false }
        if runningPaths.contains(item.path) { return true }
        if let bid = cachedBundleID(forPath: item.path), runningBundleIDs.contains(bid) {
            return true
        }
        return false
    }

    private func cachedBundleID(forPath path: String) -> String? {
        if let cached = bundleIDCache[path] { return cached }
        let bid = Bundle(url: URL(fileURLWithPath: path))?.bundleIdentifier
        bundleIDCache[path] = bid
        return bid
    }

    /// For smart "Running" folder
    func runningDockItems() -> [DockItem] {
        runningItems
    }
}
