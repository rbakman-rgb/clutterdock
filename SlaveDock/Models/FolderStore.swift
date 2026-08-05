import Foundation
import Combine
import AppKit

@MainActor
final class FolderStore: ObservableObject {
    static let currentVersion = 3

    @Published var folders: [AppFolder]
    @Published var selectedFolderID: UUID?
    @Published var workspaces: [Workspace]
    @Published var activeWorkspaceID: UUID?

    private let fileURL: URL
    private var saveTask: Task<Void, Never>?
    private let supportDir: URL

    init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        supportDir = support.appendingPathComponent("SlaveDock", isDirectory: true)
        try? FileManager.default.createDirectory(at: supportDir, withIntermediateDirectories: true)
        fileURL = supportDir.appendingPathComponent("folders.json")

        // Initialize all stored properties first (Swift requires this before reading self).
        var loadedFolders: [AppFolder] = []
        var loadedSelected: UUID?
        var loadedWorkspaces: [Workspace] = []
        var loadedActiveWS: UUID?
        var shouldPersist = false

        if let data = try? Data(contentsOf: fileURL),
           let decoded = try? Self.decodeState(from: data) {
            loadedFolders = Self.sanitize(decoded.folders)
            loadedSelected = decoded.selectedFolderID ?? loadedFolders.first?.id
            loadedWorkspaces = decoded.workspaces ?? []
            loadedActiveWS = decoded.activeWorkspaceID
            if decoded.version < Self.currentVersion {
                shouldPersist = true
            }
        } else {
            loadedFolders = [
                AppFolder(name: "Apps", symbolName: "square.grid.2x2"),
                AppFolder(name: "Recents", symbolName: "clock", smartKind: .recents),
                AppFolder(name: "Running", symbolName: "circle.fill", smartKind: .running)
            ]
            loadedSelected = loadedFolders.first?.id
            loadedWorkspaces = [Workspace(name: "All", folderIDs: [])]
            loadedActiveWS = loadedWorkspaces.first?.id
            shouldPersist = true
        }

        if loadedFolders.isEmpty {
            loadedFolders = [AppFolder(name: "Apps", symbolName: "square.grid.2x2")]
            loadedSelected = loadedFolders.first?.id
            shouldPersist = true
        }
        if loadedWorkspaces.isEmpty {
            loadedWorkspaces = [Workspace(name: "All", folderIDs: [])]
            loadedActiveWS = loadedWorkspaces.first?.id
            shouldPersist = true
        }

        folders = loadedFolders
        selectedFolderID = loadedSelected
        workspaces = loadedWorkspaces
        activeWorkspaceID = loadedActiveWS

        ensureSmartFolders()
        if shouldPersist {
            persistNow()
        }
    }

    // MARK: - Visible folders (workspace filter)

    var visibleFolders: [AppFolder] {
        guard let ws = activeWorkspace,
              !ws.folderIDs.isEmpty else {
            return folders
        }
        let map = Dictionary(uniqueKeysWithValues: folders.map { ($0.id, $0) })
        return ws.folderIDs.compactMap { map[$0] }
    }

    var activeWorkspace: Workspace? {
        guard let activeWorkspaceID else { return workspaces.first }
        return workspaces.first { $0.id == activeWorkspaceID } ?? workspaces.first
    }

    var selectedFolder: AppFolder? {
        let list = visibleFolders
        guard let selectedFolderID else { return list.first }
        return list.first { $0.id == selectedFolderID } ?? list.first ?? folders.first
    }

    var selectedFolderIndex: Int {
        let list = visibleFolders
        guard let selectedFolderID,
              let idx = list.firstIndex(where: { $0.id == selectedFolderID }) else {
            return 0
        }
        return idx
    }

    var missingItemCount: Int {
        folders.reduce(0) { $0 + $1.items.filter { !$0.exists && $0.kind != .url }.count }
    }

    var missingAppCount: Int { missingItemCount }

    /// Resolve items for display (smart folders filled dynamically).
    func displayItems(
        for folder: AppFolder,
        history: LaunchHistory,
        running: RunningAppsService
    ) -> [DockItem] {
        switch folder.smartKind {
        case .recents:
            return history.recentItems()
        case .running:
            return running.runningDockItems()
        case .none:
            return folder.sortedItems()
        }
    }

    // MARK: - Workspaces

    @discardableResult
    func addWorkspace(named name: String) -> Bool {
        guard FeatureGate.canUseWorkspaces else { return false }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let ws = Workspace(name: trimmed.isEmpty ? "Workspace" : trimmed, folderIDs: [])
        workspaces.append(ws)
        activeWorkspaceID = ws.id
        persist()
        return true
    }

    func renameWorkspace(id: UUID, to name: String) {
        guard let idx = workspaces.firstIndex(where: { $0.id == id }) else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        workspaces[idx].name = trimmed
        persist()
    }

    func deleteWorkspace(id: UUID) {
        guard workspaces.count > 1 else { return }
        workspaces.removeAll { $0.id == id }
        if activeWorkspaceID == id {
            activeWorkspaceID = workspaces.first?.id
        }
        persist()
    }

    func selectWorkspace(id: UUID) {
        guard workspaces.contains(where: { $0.id == id }) else { return }
        activeWorkspaceID = id
        // Prefer first visible folder
        if let first = visibleFolders.first {
            selectedFolderID = first.id
        }
        persist()
        NotificationCenter.default.post(name: .slaveDockHotkeysNeedRefresh, object: nil)
    }

    func setWorkspaceFolders(id: UUID, folderIDs: [UUID]) {
        guard let idx = workspaces.firstIndex(where: { $0.id == id }) else { return }
        workspaces[idx].folderIDs = folderIDs
        persist()
    }

    func toggleFolderInWorkspace(workspaceID: UUID, folderID: UUID) {
        guard let idx = workspaces.firstIndex(where: { $0.id == workspaceID }) else { return }
        if let i = workspaces[idx].folderIDs.firstIndex(of: folderID) {
            workspaces[idx].folderIDs.remove(at: i)
        } else {
            workspaces[idx].folderIDs.append(folderID)
        }
        persist()
    }

    // MARK: - Folders

    /// Returns false if Free folder limit reached.
    @discardableResult
    func addFolder(named name: String, symbolName: String? = "folder.fill", smartKind: SmartFolderKind = .none) -> Bool {
        if smartKind == .none {
            let normalCount = folders.filter { !$0.isSmart }.count
            guard FeatureGate.canAddNormalFolder(currentNormalCount: normalCount) else {
                return false
            }
        }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let folder = AppFolder(
            name: trimmed.isEmpty ? "Folder" : trimmed,
            symbolName: symbolName,
            smartKind: smartKind
        )
        folders.append(folder)
        selectedFolderID = folder.id
        persist()
        NotificationCenter.default.post(name: .slaveDockHotkeysNeedRefresh, object: nil)
        return true
    }

    func renameFolder(id: UUID, to name: String) {
        guard let idx = folders.firstIndex(where: { $0.id == id }) else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        folders[idx].name = trimmed
        persist()
    }

    func setFolderSymbol(id: UUID, symbolName: String?) {
        guard let idx = folders.firstIndex(where: { $0.id == id }) else { return }
        folders[idx].symbolName = symbolName
        persist()
    }

    func setFolderSort(id: UUID, mode: FolderSortMode) {
        guard let idx = folders.firstIndex(where: { $0.id == id }) else { return }
        folders[idx].sortMode = mode
        persist()
    }

    func setFolderView(id: UUID, mode: FolderViewMode) {
        guard let idx = folders.firstIndex(where: { $0.id == id }) else { return }
        folders[idx].viewMode = mode
        persist()
    }

    @discardableResult
    func setFolderHotkey(id: UUID, hotkey: FolderHotkey) -> Bool {
        if hotkey != .none && !FeatureGate.canUseFolderHotkeys {
            return false
        }
        // Ensure uniqueness
        if hotkey != .none {
            for i in folders.indices where folders[i].id != id && folders[i].hotkey == hotkey {
                folders[i].hotkey = .none
            }
        }
        guard let idx = folders.firstIndex(where: { $0.id == id }) else { return false }
        folders[idx].hotkey = hotkey
        persist()
        NotificationCenter.default.post(name: .slaveDockHotkeysNeedRefresh, object: nil)
        return true
    }

    @discardableResult
    func setFolderCustomImage(id: UUID, path: String?) -> Bool {
        if path != nil && !FeatureGate.canUseCustomFolderImages {
            return false
        }
        guard let idx = folders.firstIndex(where: { $0.id == id }) else { return false }
        folders[idx].customImagePath = path
        persist()
        return true
    }

    func deleteFolder(id: UUID) {
        guard let folder = folders.first(where: { $0.id == id }) else { return }
        // Don't delete last non-smart folder if it's the only real one
        let normalCount = folders.filter { !$0.isSmart }.count
        if !folder.isSmart && normalCount <= 1 && folders.count <= 1 { return }

        folders.removeAll { $0.id == id }
        for i in workspaces.indices {
            workspaces[i].folderIDs.removeAll { $0 == id }
        }
        if selectedFolderID == id {
            selectedFolderID = visibleFolders.first?.id ?? folders.first?.id
        }
        persist()
        NotificationCenter.default.post(name: .slaveDockHotkeysNeedRefresh, object: nil)
    }

    func selectFolder(id: UUID) {
        guard folders.contains(where: { $0.id == id }) else { return }
        selectedFolderID = id
        persist()
    }

    func selectFolder(at index: Int) {
        let list = visibleFolders
        guard list.indices.contains(index) else { return }
        selectedFolderID = list[index].id
        persist()
    }

    func moveFolder(from source: IndexSet, to destination: Int) {
        folders.move(fromOffsets: source, toOffset: destination)
        persist()
    }

    // MARK: - Items

    struct AddItemsResult {
        var added: Int
        var hitLimit: Bool
    }

    @discardableResult
    func addItems(_ newItems: [DockItem], to folderID: UUID? = nil) -> AddItemsResult {
        let targetID = folderID ?? selectedFolderID ?? folders.first(where: { !$0.isSmart })?.id
        guard let targetID,
              let idx = folders.firstIndex(where: { $0.id == targetID }),
              !folders[idx].isSmart else { return AddItemsResult(added: 0, hitLimit: false) }

        var existing = Set(folders[idx].items.map { "\($0.kind.rawValue)|\($0.path)" })
        var added = 0
        var hitLimit = false
        for item in newItems {
            if !FeatureGate.canAddItem(currentCount: folders[idx].items.count) {
                hitLimit = true
                break
            }
            let key = "\(item.kind.rawValue)|\(item.path)"
            guard !existing.contains(key) else { continue }
            if item.kind != .url && !item.exists { continue }
            existing.insert(key)
            folders[idx].items.append(item)
            added += 1
        }
        if added > 0 { persist() }
        return AddItemsResult(added: added, hitLimit: hitLimit)
    }

    @discardableResult
    func addPaths(_ paths: [String], to folderID: UUID? = nil) -> AddItemsResult {
        let items = paths.compactMap { DockItem.fromPath($0) }
        return addItems(items, to: folderID)
    }

    @discardableResult
    func addApps(paths: [String], to folderID: UUID? = nil) -> AddItemsResult {
        addPaths(paths, to: folderID)
    }

    @discardableResult
    func addURL(_ string: String, to folderID: UUID? = nil) -> AddItemsResult {
        guard let item = DockItem.fromURLString(string) else {
            return AddItemsResult(added: 0, hitLimit: false)
        }
        return addItems([item], to: folderID)
    }

    var normalFolderCount: Int {
        folders.filter { !$0.isSmart }.count
    }

    func removeApp(id: UUID, from folderID: UUID? = nil) {
        removeItem(id: id, from: folderID)
    }

    func removeItem(id: UUID, from folderID: UUID? = nil) {
        let targetID = folderID ?? selectedFolderID
        guard let targetID,
              let idx = folders.firstIndex(where: { $0.id == targetID }),
              !folders[idx].isSmart else { return }
        folders[idx].items.removeAll { $0.id == id }
        persist()
    }

    func moveApp(from source: IndexSet, to destination: Int, in folderID: UUID? = nil) {
        moveItem(from: source, to: destination, in: folderID)
    }

    func moveItem(from source: IndexSet, to destination: Int, in folderID: UUID? = nil) {
        let targetID = folderID ?? selectedFolderID
        guard let targetID,
              let idx = folders.firstIndex(where: { $0.id == targetID }),
              !folders[idx].isSmart else { return }
        folders[idx].sortMode = .manual
        folders[idx].items.move(fromOffsets: source, toOffset: destination)
        persist()
    }

    func reorderItem(id: UUID, toIndex: Int, in folderID: UUID? = nil) {
        let targetID = folderID ?? selectedFolderID
        guard let targetID,
              let fidx = folders.firstIndex(where: { $0.id == targetID }),
              !folders[fidx].isSmart,
              let from = folders[fidx].items.firstIndex(where: { $0.id == id }) else { return }
        folders[fidx].sortMode = .manual
        var items = folders[fidx].items
        let item = items.remove(at: from)
        let dest = min(max(0, toIndex), items.count)
        items.insert(item, at: dest)
        folders[fidx].items = items
        persist()
    }

    /// Move item one step left (−1) or right (+1) within its folder.
    @discardableResult
    func nudgeItem(id: UUID, by delta: Int, in folderID: UUID? = nil) -> Bool {
        let targetID = folderID ?? selectedFolderID
        guard let targetID,
              let fidx = folders.firstIndex(where: { $0.id == targetID }),
              !folders[fidx].isSmart,
              let from = folders[fidx].items.firstIndex(where: { $0.id == id }) else { return false }
        let to = from + delta
        guard folders[fidx].items.indices.contains(to) else { return false }
        folders[fidx].sortMode = .manual
        folders[fidx].items.swapAt(from, to)
        persist()
        return true
    }

    // MARK: - Cleanup

    @discardableResult
    func removeMissingApps() -> Int {
        var removed = 0
        for i in folders.indices where !folders[i].isSmart {
            let before = folders[i].items.count
            folders[i].items.removeAll { !$0.exists && $0.kind != .url }
            removed += before - folders[i].items.count
        }
        if removed > 0 { persist() }
        return removed
    }

    @discardableResult
    func removeDuplicateApps() -> Int {
        var removed = 0
        for i in folders.indices where !folders[i].isSmart {
            var seen = Set<String>()
            var unique: [DockItem] = []
            for item in folders[i].items {
                let key = "\(item.kind.rawValue)|\(item.path)"
                if seen.contains(key) {
                    removed += 1
                } else {
                    seen.insert(key)
                    unique.append(item)
                }
            }
            folders[i].items = unique
        }
        if removed > 0 { persist() }
        return removed
    }

    func refreshAppNames() {
        for i in folders.indices {
            for j in folders[i].items.indices {
                let item = folders[i].items[j]
                folders[i].items[j].name = DockItem.defaultName(kind: item.kind, path: item.path)
            }
        }
        persist()
    }

    // MARK: - Search

    struct SearchHit: Identifiable {
        var id: UUID { item.id }
        let item: DockItem
        let folderName: String
        let folderID: UUID
    }

    func searchAll(query: String) -> [SearchHit] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        var hits: [SearchHit] = []
        for folder in folders where !folder.isSmart {
            for item in folder.items where item.searchText.contains(q) {
                hits.append(SearchHit(item: item, folderName: folder.name, folderID: folder.id))
            }
        }
        return hits
    }

    // MARK: - Import / Export / Pack

    func exportData() throws -> Data {
        let state = PersistedState(
            version: Self.currentVersion,
            folders: folders,
            selectedFolderID: selectedFolderID,
            workspaces: workspaces,
            activeWorkspaceID: activeWorkspaceID
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(state)
    }

    func importData(_ data: Data, merge: Bool) throws {
        let decoded = try Self.decodeState(from: data)
        let incoming = Self.sanitize(decoded.folders)
        guard !incoming.isEmpty else { throw StoreError.emptyImport }

        if merge {
            for folder in incoming where !folder.isSmart {
                if let idx = folders.firstIndex(where: { $0.name == folder.name && !$0.isSmart }) {
                    _ = addItems(folder.items, to: folders[idx].id)
                } else {
                    folders.append(folder)
                }
            }
            if let ws = decoded.workspaces {
                for w in ws where !workspaces.contains(where: { $0.name == w.name }) {
                    workspaces.append(w)
                }
            }
            persist()
        } else {
            folders = incoming
            workspaces = decoded.workspaces ?? [Workspace(name: "All", folderIDs: [])]
            selectedFolderID = decoded.selectedFolderID ?? folders.first?.id
            activeWorkspaceID = decoded.activeWorkspaceID ?? workspaces.first?.id
            ensureSmartFolders()
            persistNow()
        }
        NotificationCenter.default.post(name: .slaveDockHotkeysNeedRefresh, object: nil)
    }

    /// Export a `.slavedock` pack (JSON with that extension).
    func exportPack(to url: URL) throws {
        guard FeatureGate.canExportPack else {
            throw StoreError.proRequired
        }
        let data = try exportData()
        try data.write(to: url, options: .atomic)
    }

    func importPack(from url: URL, merge: Bool) throws {
        let data = try Data(contentsOf: url)
        try importData(data, merge: merge)
    }

    enum StoreError: LocalizedError {
        case emptyImport
        case proRequired
        var errorDescription: String? {
            switch self {
            case .emptyImport: return "The file did not contain any folders."
            case .proRequired: return "Pack export requires SlaveDock Pro."
            }
        }
    }

    // MARK: - Smart folders

    private func ensureSmartFolders() {
        if !folders.contains(where: { $0.smartKind == .recents }) {
            folders.append(AppFolder(name: "Recents", symbolName: "clock", smartKind: .recents))
        }
        if !folders.contains(where: { $0.smartKind == .running }) {
            folders.append(AppFolder(name: "Running", symbolName: "circle.fill", smartKind: .running))
        }
    }

    // MARK: - Persistence

    private func persist() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled else { return }
            writeToDisk()
        }
    }

    private func persistNow() {
        saveTask?.cancel()
        writeToDisk()
    }

    private func writeToDisk() {
        do {
            let data = try exportData()
            try data.write(to: fileURL, options: .atomic)
        } catch {
            NSLog("SlaveDock: failed to save: \(error.localizedDescription)")
        }
    }

    private static func decodeState(from data: Data) throws -> PersistedState {
        let decoder = JSONDecoder()
        if let state = try? decoder.decode(PersistedState.self, from: data) {
            return state
        }
        // Minimal v1
        struct V1: Codable {
            var folders: [AppFolder]
            var selectedFolderID: UUID?
        }
        let v1 = try decoder.decode(V1.self, from: data)
        return PersistedState(version: 1, folders: v1.folders, selectedFolderID: v1.selectedFolderID, workspaces: nil, activeWorkspaceID: nil)
    }

    private static func sanitize(_ folders: [AppFolder]) -> [AppFolder] {
        folders.map { folder in
            var f = folder
            var seen = Set<String>()
            f.items = folder.items.compactMap { item in
                let key = "\(item.kind.rawValue)|\(item.path)"
                guard !seen.contains(key) else { return nil }
                if item.kind != .url {
                    guard item.path.hasSuffix(".app") || item.kind != .app else { return nil }
                }
                seen.insert(key)
                return item
            }
            if f.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                f.name = "Folder"
            }
            return f
        }
    }

    private struct PersistedState: Codable {
        var version: Int
        var folders: [AppFolder]
        var selectedFolderID: UUID?
        var workspaces: [Workspace]?
        var activeWorkspaceID: UUID?
    }
}

extension Notification.Name {
    static let slaveDockHotkeysNeedRefresh = Notification.Name("slaveDockHotkeysNeedRefresh")
    static let slaveDockOpenFolder = Notification.Name("slaveDockOpenFolder")
    static let slaveDockAddPaths = Notification.Name("slaveDockAddPaths")
}
