import Foundation
import Combine

enum HotkeyPreset: String, CaseIterable, Identifiable, Codable {
    case commandShiftD
    case commandShiftSpace
    case optionSpace
    case controlCommandF

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .commandShiftD: return "⌘⇧D"
        case .commandShiftSpace: return "⌘⇧Space"
        case .optionSpace: return "⌥Space"
        case .controlCommandF: return "⌃⌘F"
        }
    }

    var keyCode: UInt32 {
        switch self {
        case .commandShiftD: return 2
        case .commandShiftSpace: return 49
        case .optionSpace: return 49
        case .controlCommandF: return 3
        }
    }
}

@MainActor
final class AppPreferences: ObservableObject {
    @Published var iconSize: Double {
        didSet { defaults.set(iconSize, forKey: Keys.iconSize) }
    }

    @Published var showMenuBarIcon: Bool {
        didSet {
            defaults.set(showMenuBarIcon, forKey: Keys.showMenuBarIcon)
            NotificationCenter.default.post(name: .clutterDockPreferencesChanged, object: Keys.showMenuBarIcon)
        }
    }

    @Published var launchAtLogin: Bool {
        didSet { defaults.set(launchAtLogin, forKey: Keys.launchAtLogin) }
    }

    @Published var hotkeyEnabled: Bool {
        didSet {
            defaults.set(hotkeyEnabled, forKey: Keys.hotkeyEnabled)
            NotificationCenter.default.post(name: .clutterDockPreferencesChanged, object: Keys.hotkeyEnabled)
        }
    }

    @Published var hotkeyPreset: HotkeyPreset {
        didSet {
            defaults.set(hotkeyPreset.rawValue, forKey: Keys.hotkeyPreset)
            NotificationCenter.default.post(name: .clutterDockPreferencesChanged, object: Keys.hotkeyPreset)
        }
    }

    @Published var showRunningIndicator: Bool {
        didSet { defaults.set(showRunningIndicator, forKey: Keys.showRunningIndicator) }
    }

    @Published var closeAfterLaunch: Bool {
        didSet { defaults.set(closeAfterLaunch, forKey: Keys.closeAfterLaunch) }
    }

    @Published var openEmptyOnLaunch: Bool {
        didSet { defaults.set(openEmptyOnLaunch, forKey: Keys.openEmptyOnLaunch) }
    }

    @Published var globalSearchDefault: Bool {
        didSet { defaults.set(globalSearchDefault, forKey: Keys.globalSearchDefault) }
    }

    /// First-run coach card in the launcher
    @Published var hasCompletedOnboarding: Bool {
        didSet { defaults.set(hasCompletedOnboarding, forKey: Keys.hasCompletedOnboarding) }
    }

    /// Compact keyboard hint strip under the panel content
    @Published var showKeyboardHints: Bool {
        didSet { defaults.set(showKeyboardHints, forKey: Keys.showKeyboardHints) }
    }

    @Published var checkForUpdatesAutomatically: Bool {
        didSet { defaults.set(checkForUpdatesAutomatically, forKey: Keys.checkForUpdatesAutomatically) }
    }

    /// Default: sit next to the Dock (or menu-bar) icon. Custom: restore a dragged origin.
    @Published var launcherAnchor: LauncherAnchorMode {
        didSet {
            defaults.set(launcherAnchor.rawValue, forKey: Keys.launcherAnchor)
            NotificationCenter.default.post(name: .clutterDockPreferencesChanged, object: Keys.launcherAnchor)
        }
    }

    private let defaults: UserDefaults

    enum Keys {
        static let iconSize = "iconSize"
        static let showMenuBarIcon = "showMenuBarIcon"
        static let launchAtLogin = "launchAtLogin"
        static let hotkeyEnabled = "hotkeyEnabled"
        static let hotkeyPreset = "hotkeyPreset"
        static let showRunningIndicator = "showRunningIndicator"
        static let closeAfterLaunch = "closeAfterLaunch"
        static let openEmptyOnLaunch = "openEmptyOnLaunch"
        static let globalSearchDefault = "globalSearchDefault"
        static let hasCompletedOnboarding = "hasCompletedOnboarding"
        static let showKeyboardHints = "showKeyboardHints"
        static let checkForUpdatesAutomatically = "checkForUpdatesAutomatically"
        static let launcherAnchor = "launcherAnchor"
        static let launcherCustomX = "launcherCustomX"
        static let launcherCustomY = "launcherCustomY"
        static let lastDockIconX = "lastDockIconX"
        static let lastDockIconY = "lastDockIconY"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults

        let storedSize = defaults.object(forKey: Keys.iconSize) as? Double
        iconSize = min(80, max(40, storedSize ?? 56))

        showMenuBarIcon = defaults.object(forKey: Keys.showMenuBarIcon) as? Bool ?? true
        launchAtLogin = defaults.bool(forKey: Keys.launchAtLogin)
        hotkeyEnabled = defaults.object(forKey: Keys.hotkeyEnabled) as? Bool ?? true

        if let raw = defaults.string(forKey: Keys.hotkeyPreset),
           let preset = HotkeyPreset(rawValue: raw) {
            hotkeyPreset = preset
        } else {
            hotkeyPreset = .commandShiftD
        }

        showRunningIndicator = defaults.object(forKey: Keys.showRunningIndicator) as? Bool ?? true
        closeAfterLaunch = defaults.object(forKey: Keys.closeAfterLaunch) as? Bool ?? true
        openEmptyOnLaunch = defaults.object(forKey: Keys.openEmptyOnLaunch) as? Bool ?? true
        globalSearchDefault = defaults.object(forKey: Keys.globalSearchDefault) as? Bool ?? false
        hasCompletedOnboarding = defaults.bool(forKey: Keys.hasCompletedOnboarding)
        showKeyboardHints = defaults.object(forKey: Keys.showKeyboardHints) as? Bool ?? true
        checkForUpdatesAutomatically = defaults.object(forKey: Keys.checkForUpdatesAutomatically) as? Bool ?? true

        if let raw = defaults.string(forKey: Keys.launcherAnchor),
           let mode = LauncherAnchorMode(rawValue: raw) {
            launcherAnchor = mode
        } else {
            launcherAnchor = .dock
        }
    }

    var customOrigin: CGPoint? {
        get {
            guard defaults.object(forKey: Keys.launcherCustomX) != nil,
                  defaults.object(forKey: Keys.launcherCustomY) != nil else { return nil }
            return CGPoint(
                x: defaults.double(forKey: Keys.launcherCustomX),
                y: defaults.double(forKey: Keys.launcherCustomY)
            )
        }
        set {
            if let point = newValue {
                defaults.set(point.x, forKey: Keys.launcherCustomX)
                defaults.set(point.y, forKey: Keys.launcherCustomY)
            } else {
                defaults.removeObject(forKey: Keys.launcherCustomX)
                defaults.removeObject(forKey: Keys.launcherCustomY)
            }
            objectWillChange.send()
        }
    }

    var lastDockPoint: CGPoint? {
        get {
            guard defaults.object(forKey: Keys.lastDockIconX) != nil,
                  defaults.object(forKey: Keys.lastDockIconY) != nil else { return nil }
            return CGPoint(
                x: defaults.double(forKey: Keys.lastDockIconX),
                y: defaults.double(forKey: Keys.lastDockIconY)
            )
        }
        set {
            if let point = newValue {
                defaults.set(point.x, forKey: Keys.lastDockIconX)
                defaults.set(point.y, forKey: Keys.lastDockIconY)
            } else {
                defaults.removeObject(forKey: Keys.lastDockIconX)
                defaults.removeObject(forKey: Keys.lastDockIconY)
            }
        }
    }

    func resetOnboarding() {
        hasCompletedOnboarding = false
    }

    func adoptSystemLoginItemState(_ enabled: Bool) {
        guard launchAtLogin != enabled else { return }
        defaults.set(enabled, forKey: Keys.launchAtLogin)
        launchAtLogin = enabled
    }

    var panelWidth: CGFloat { 440 }
    /// Compact chrome + ~2 icon rows (less empty dead space under a short stack)
    var panelHeight: CGFloat {
        let chrome: CGFloat = 168
        let row: CGFloat = iconSize + 48
        return min(520, max(300, chrome + row * 2))
    }

    var tileWidth: CGFloat { iconSize + 22 }
}

extension Notification.Name {
    static let clutterDockPreferencesChanged = Notification.Name("clutterDockPreferencesChanged")
}
