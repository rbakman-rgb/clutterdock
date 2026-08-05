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
        let cap = FeatureGate.historyLimit
        if entries.count > cap {
            entries = Array(entries.prefix(cap))
        }
        save()
    }

    func recentItems(limit: Int? = nil) -> [DockItem] {
        let cap = limit ?? FeatureGate.historyLimit
        return Array(entries.prefix(cap).map(\.item))
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
