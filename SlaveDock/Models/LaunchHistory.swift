import Foundation
import Combine

struct HistoryEntry: Identifiable, Codable, Equatable {
    let id: UUID
    var item: DockItem
    var lastOpened: Date
    var openCount: Int

    init(id: UUID = UUID(), item: DockItem, lastOpened: Date = Date(), openCount: Int = 1) {
        self.id = id
        self.item = item
        self.lastOpened = lastOpened
        self.openCount = openCount
    }
}

@MainActor
final class LaunchHistory: ObservableObject {
    @Published private(set) var entries: [HistoryEntry] = []

    private let fileURL: URL
    private let maxEntries = 40

    init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = support.appendingPathComponent("SlaveDock", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("history.json")
        load()
    }

    func record(_ item: DockItem) {
        if let idx = entries.firstIndex(where: { $0.item.path == item.path && $0.item.kind == item.kind }) {
            entries[idx].lastOpened = Date()
            entries[idx].openCount += 1
            entries[idx].item = item
            let e = entries.remove(at: idx)
            entries.insert(e, at: 0)
        } else {
            entries.insert(HistoryEntry(item: item), at: 0)
        }
        if entries.count > maxEntries {
            entries = Array(entries.prefix(maxEntries))
        }
        save()
    }

    func recentItems(limit: Int = 24) -> [DockItem] {
        Array(entries.prefix(limit).map(\.item))
    }

    func clear() {
        entries = []
        save()
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode([HistoryEntry].self, from: data) else { return }
        entries = decoded
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(entries) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
