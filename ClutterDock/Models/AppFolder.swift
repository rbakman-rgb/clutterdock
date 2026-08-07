import Foundation

enum FolderSortMode: String, Codable, CaseIterable, Identifiable {
    case manual
    case nameAZ
    case nameZA
    case kind

    var id: String { rawValue }

    var label: String {
        switch self {
        case .manual: return "Manual"
        case .nameAZ: return "Name A–Z"
        case .nameZA: return "Name Z–A"
        case .kind: return "By type"
        }
    }
}

enum FolderViewMode: String, Codable, CaseIterable, Identifiable {
    case grid
    case list

    var id: String { rawValue }

    var label: String {
        switch self {
        case .grid: return "Grid"
        case .list: return "List"
        }
    }
}

enum SmartFolderKind: String, Codable, CaseIterable, Identifiable {
    case none
    case recents
    case running

    var id: String { rawValue }

    var label: String {
        switch self {
        case .none: return "Normal"
        case .recents: return "Recents"
        case .running: return "Running apps"
        }
    }
}

/// Optional per-folder hotkey (in addition to the main launcher hotkey).
enum FolderHotkey: String, Codable, CaseIterable, Identifiable {
    case none
    case commandShift1
    case commandShift2
    case commandShift3
    case commandShift4
    case commandShift5
    case commandShift6
    case commandShift7
    case commandShift8
    case commandShift9

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .none: return "None"
        case .commandShift1: return "⌘⇧1"
        case .commandShift2: return "⌘⇧2"
        case .commandShift3: return "⌘⇧3"
        case .commandShift4: return "⌘⇧4"
        case .commandShift5: return "⌘⇧5"
        case .commandShift6: return "⌘⇧6"
        case .commandShift7: return "⌘⇧7"
        case .commandShift8: return "⌘⇧8"
        case .commandShift9: return "⌘⇧9"
        }
    }

    var keyCode: UInt32? {
        // Top row number keys: 1=18, 2=19, 3=20, 4=21, 5=23, 6=22, 7=26, 8=28, 9=25
        switch self {
        case .none: return nil
        case .commandShift1: return 18
        case .commandShift2: return 19
        case .commandShift3: return 20
        case .commandShift4: return 21
        case .commandShift5: return 23
        case .commandShift6: return 22
        case .commandShift7: return 26
        case .commandShift8: return 28
        case .commandShift9: return 25
        }
    }

    /// cmdKey | shiftKey
    var carbonModifiers: UInt32 {
        256 | 512
    }
}

struct AppFolder: Identifiable, Codable, Equatable, Hashable {
    let id: UUID
    var name: String
    var items: [DockItem]
    var symbolName: String?
    var sortMode: FolderSortMode
    var viewMode: FolderViewMode
    var hotkey: FolderHotkey
    /// Optional custom image path for tab/icon
    var customImagePath: String?
    var smartKind: SmartFolderKind
    /// Present when this stack is password-protected. While locked, `items` is
    /// empty and the real contents live encrypted inside this payload.
    var lock: FolderLock?

    init(
        id: UUID = UUID(),
        name: String,
        items: [DockItem] = [],
        symbolName: String? = nil,
        sortMode: FolderSortMode = .manual,
        viewMode: FolderViewMode = .grid,
        hotkey: FolderHotkey = .none,
        customImagePath: String? = nil,
        smartKind: SmartFolderKind = .none,
        lock: FolderLock? = nil
    ) {
        self.id = id
        self.name = name
        self.items = items
        self.symbolName = symbolName
        self.sortMode = sortMode
        self.viewMode = viewMode
        self.hotkey = hotkey
        self.customImagePath = customImagePath
        self.smartKind = smartKind
        self.lock = lock
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? "Folder"
        // v3: items; v1/v2: apps
        if let items = try c.decodeIfPresent([DockItem].self, forKey: .items) {
            self.items = items
        } else {
            self.items = try c.decodeIfPresent([DockItem].self, forKey: .apps) ?? []
        }
        symbolName = try c.decodeIfPresent(String.self, forKey: .symbolName)
        sortMode = try c.decodeIfPresent(FolderSortMode.self, forKey: .sortMode) ?? .manual
        viewMode = try c.decodeIfPresent(FolderViewMode.self, forKey: .viewMode) ?? .grid
        hotkey = try c.decodeIfPresent(FolderHotkey.self, forKey: .hotkey) ?? .none
        customImagePath = try c.decodeIfPresent(String.self, forKey: .customImagePath)
        smartKind = try c.decodeIfPresent(SmartFolderKind.self, forKey: .smartKind) ?? .none
        lock = try c.decodeIfPresent(FolderLock.self, forKey: .lock)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encode(items, forKey: .items)
        try c.encodeIfPresent(symbolName, forKey: .symbolName)
        try c.encode(sortMode, forKey: .sortMode)
        try c.encode(viewMode, forKey: .viewMode)
        try c.encode(hotkey, forKey: .hotkey)
        try c.encodeIfPresent(customImagePath, forKey: .customImagePath)
        try c.encode(smartKind, forKey: .smartKind)
        try c.encodeIfPresent(lock, forKey: .lock)
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, items, apps, symbolName, sortMode, viewMode, hotkey, customImagePath, smartKind, lock
    }

    func sortedItems() -> [DockItem] {
        switch sortMode {
        case .manual:
            return items
        case .nameAZ:
            return items.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        case .nameZA:
            return items.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedDescending }
        case .kind:
            return items.sorted {
                if $0.kind != $1.kind { return $0.kind.rawValue < $1.kind.rawValue }
                return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
        }
    }

    var isSmart: Bool { smartKind != .none }
}

struct Workspace: Identifiable, Codable, Equatable, Hashable {
    let id: UUID
    var name: String
    /// Folder IDs visible in this workspace (order preserved). Empty = show all.
    var folderIDs: [UUID]

    init(id: UUID = UUID(), name: String, folderIDs: [UUID] = []) {
        self.id = id
        self.name = name
        self.folderIDs = folderIDs
    }
}
