import Foundation

/// SF Symbols used for stack (folder) tabs — free for all users.
enum StackSymbols {
    /// Curated list: coding, work, creative, life.
    static let all: [String] = [
        // General
        "square.grid.2x2.fill",
        "folder.fill",
        "star.fill",
        "heart.fill",
        "bookmark.fill",
        "pin.fill",
        // Coding / build
        "chevron.left.forwardslash.chevron.right",
        "terminal.fill",
        "hammer.fill",
        "wrench.and.screwdriver.fill",
        "cpu",
        "externaldrive.fill",
        // Work
        "briefcase.fill",
        "envelope.fill",
        "calendar",
        "person.2.fill",
        "building.2.fill",
        "chart.bar.fill",
        // Creative
        "paintbrush.fill",
        "photo.fill",
        "music.note",
        "film.fill",
        "mic.fill",
        "gamecontroller.fill",
        // Life
        "house.fill",
        "cart.fill",
        "figure.run",
        "airplane",
        "book.fill",
        "globe",
        // Status / smart-adjacent
        "clock.fill",
        "bolt.fill",
        "flame.fill",
        "sparkles",
        "link",
        "tray.full.fill",
    ]

    /// One-tap starters for “New stack…”
    static let presets: [(name: String, symbol: String)] = [
        ("Coding", "chevron.left.forwardslash.chevron.right"),
        ("Design", "paintbrush.fill"),
        ("Work", "briefcase.fill"),
        ("Personal", "house.fill"),
        ("Media", "photo.fill"),
        ("Games", "gamecontroller.fill"),
        ("Client", "person.2.fill"),
        ("Admin", "envelope.fill"),
    ]
}
