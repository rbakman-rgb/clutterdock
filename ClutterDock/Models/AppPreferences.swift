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

/// Opt-in "count this install" state — RON-507. `.undecided` shows the offer
/// once (welcome card); any skip locks it to `.skipped` so it never nags again.
enum InstallRegisterChoice: String {
    case undecided
    case skipped
    case registered
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

    @Published var installRegisterChoice: InstallRegisterChoice {
        didSet { defaults.set(installRegisterChoice.rawValue, forKey: Keys.installRegisterChoice) }
    }

    @Published var registeredEmail: String {
        didSet { defaults.set(registeredEmail, forKey: Keys.registeredEmail) }
    }

    /// Random UUID minted on first read, stable across launches. The only
    /// identifier the optional install register ever sends.
    let installId: String

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
        static let installRegisterChoice = "installRegisterChoice"
        static let registeredEmail = "registeredEmail"
        static let installId = "installId"
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

        installRegisterChoice = defaults.string(forKey: Keys.installRegisterChoice)
            .flatMap(InstallRegisterChoice.init(rawValue:)) ?? .undecided
        registeredEmail = defaults.string(forKey: Keys.registeredEmail) ?? ""
        if let stored = defaults.string(forKey: Keys.installId), !stored.isEmpty {
            installId = stored
        } else {
            let fresh = UUID().uuidString
            defaults.set(fresh, forKey: Keys.installId)
            installId = fresh
        }
    }

    /// Dismissing the welcome card counts as skip — the offer never reappears.
    func markInstallRegisterSkippedIfUndecided() {
        if installRegisterChoice == .undecided {
            installRegisterChoice = .skipped
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
