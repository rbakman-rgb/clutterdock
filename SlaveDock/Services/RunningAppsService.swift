import AppKit
import Combine
import Foundation

@MainActor
final class RunningAppsService: ObservableObject {
    @Published private(set) var runningPaths: Set<String> = []
    @Published private(set) var runningBundleIDs: Set<String> = []

    private var observers: [NSObjectProtocol] = []

    init() {
        refresh()
        let workspace = NSWorkspace.shared.notificationCenter
        let launch = workspace.addObserver(
            forName: NSWorkspace.didLaunchApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in self?.refresh() }
        }
        let terminate = workspace.addObserver(
            forName: NSWorkspace.didTerminateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in self?.refresh() }
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
        for app in apps {
            if let url = app.bundleURL {
                paths.insert(DockItem.normalizePath(url.path))
            }
            if let bid = app.bundleIdentifier {
                ids.insert(bid)
            }
        }
        runningPaths = paths
        runningBundleIDs = ids
    }

    func isRunning(_ item: DockItem) -> Bool {
        guard item.kind == .app else { return false }
        if runningPaths.contains(item.path) { return true }
        if let bid = item.bundleIdentifier, runningBundleIDs.contains(bid) { return true }
        return false
    }

    /// For smart "Running" folder
    func runningDockItems() -> [DockItem] {
        NSWorkspace.shared.runningApplications
            .filter { $0.activationPolicy == .regular }
            .compactMap { app -> DockItem? in
                guard let url = app.bundleURL else { return nil }
                let path = DockItem.normalizePath(url.path)
                guard path.hasSuffix(".app") else { return nil }
                return DockItem(kind: .app, path: path, name: app.localizedName)
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}
