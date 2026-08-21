import Foundation
import Combine
import SwiftUI

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

enum LauncherShape: String, CaseIterable, Identifiable, Codable {
    case rounded
    case square
    case circle

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .rounded: return "Rounded"
        case .square: return "Square"
        case .circle: return "Circle"
        }
    }
}

enum LauncherMotion: String, CaseIterable, Identifiable, Codable {
    case calm
    case fan
    case orbit
    case pulse

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .calm: return "Calm"
        case .fan: return "Fan"
        case .orbit: return "Orbit"
        case .pulse: return "Pulse"
        }
    }
}

enum LauncherColor: String, CaseIterable, Identifiable, Codable {
    case automatic, light, dark, blue, purple, mint, orange, transparent

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .automatic: return "Automatic"
        case .light: return "Light"
        case .dark: return "Dark"
        case .blue: return "Blue"
        case .purple: return "Purple"
        case .mint: return "Mint"
        case .orange: return "Orange"
        case .transparent: return "Transparent"
        }
    }

    var preferredScheme: ColorScheme? {
        switch self {
        case .light: return .light
        case .dark: return .dark
        default: return nil
        }
    }

    var isTransparent: Bool { self == .transparent }

    var usesMaterial: Bool {
        switch self {
        case .transparent, .light, .dark: return false
        default: return true
        }
    }

    var tintOverlay: Color? {
        switch self {
        case .blue: return Color(red: 0.32, green: 0.52, blue: 0.96)
        case .purple: return Color(red: 0.55, green: 0.38, blue: 0.92)
        case .mint: return Color(red: 0.28, green: 0.74, blue: 0.64)
        case .orange: return Color(red: 0.96, green: 0.54, blue: 0.24)
        default: return nil
        }
    }

    var swatch: Color {
        switch self {
        case .automatic: return Color.primary.opacity(0.18)
        case .light: return Color.white
        case .dark: return Color(white: 0.16)
        case .blue: return Color(red: 0.22, green: 0.48, blue: 0.96)
        case .purple: return Color(red: 0.56, green: 0.35, blue: 0.97)
        case .mint: return Color(red: 0.18, green: 0.72, blue: 0.62)
        case .orange: return Color(red: 0.96, green: 0.52, blue: 0.18)
        case .transparent: return Color.clear
        }
    }
}

enum LauncherSize: String, CaseIterable, Identifiable, Codable {
    case compact, regular, large

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .compact: return "Compact"
        case .regular: return "Regular"
        case .large: return "Large"
        }
    }

    var panelWidth: CGFloat {
        switch self {
        case .compact: return 360
        case .regular: return 440
        case .large: return 560
        }
    }

    var circleDiameter: CGFloat {
        switch self {
        case .compact: return 420
        case .regular: return 520
        case .large: return 640
        }
    }

    var defaultIconSize: Double {
        switch self {
        case .compact: return 44
        case .regular: return 56
        case .large: return 72
        }
    }
}

@MainActor
final class AppPreferences: ObservableObject {
    @Published var iconSize: Double = 56 {
        didSet {
            defaults.set(iconSize, forKey: Keys.iconSize)
            NotificationCenter.default.post(name: .clutterDockPreferencesChanged, object: Keys.iconSize)
        }
    }

    @Published var launcherShape: LauncherShape = .rounded {
        didSet {
            defaults.set(launcherShape.rawValue, forKey: Keys.launcherShape)
            NotificationCenter.default.post(name: .clutterDockPreferencesChanged, object: Keys.launcherShape)
        }
    }

    @Published var launcherMotion: LauncherMotion = .fan {
        didSet {
            defaults.set(launcherMotion.rawValue, forKey: Keys.launcherMotion)
            NotificationCenter.default.post(name: .clutterDockPreferencesChanged, object: Keys.launcherMotion)
        }
    }

    @Published var launcherColor: LauncherColor = .automatic {
        didSet {
            defaults.set(launcherColor.rawValue, forKey: Keys.launcherColor)
            NotificationCenter.default.post(name: .clutterDockPreferencesChanged, object: Keys.launcherColor)
        }
    }

    @Published var launcherSize: LauncherSize = .regular {
        didSet {
            defaults.set(launcherSize.rawValue, forKey: Keys.launcherSize)
            NotificationCenter.default.post(name: .clutterDockPreferencesChanged, object: Keys.launcherSize)
        }
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
        static let launcherShape = "launcherShape"
        static let launcherMotion = "launcherMotion"
        static let launcherColor = "launcherColor"
        static let launcherSize = "launcherSize"
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
        static let launcherAnchor = "launcherAnchor"
        static let launcherCustomX = "launcherCustomX"
        static let launcherCustomY = "launcherCustomY"
        static let lastDockIconX = "lastDockIconX"
        static let lastDockIconY = "lastDockIconY"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults

        let initialSize: LauncherSize
        if let raw = defaults.string(forKey: Keys.launcherSize),
           let size = LauncherSize(rawValue: raw) {
            initialSize = size
        } else {
            initialSize = .regular
        }
        launcherSize = initialSize
        let storedSize = defaults.object(forKey: Keys.iconSize) as? Double
        iconSize = min(80, max(40, storedSize ?? initialSize.defaultIconSize))

        if let raw = defaults.string(forKey: Keys.launcherShape),
           let shape = LauncherShape(rawValue: raw) {
            launcherShape = shape
        }
        if let raw = defaults.string(forKey: Keys.launcherMotion),
           let motion = LauncherMotion(rawValue: raw) {
            launcherMotion = motion
        }
        if let raw = defaults.string(forKey: Keys.launcherColor),
           let color = LauncherColor(rawValue: raw) {
            launcherColor = color
        }

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

        if let raw = defaults.string(forKey: Keys.launcherAnchor),
           let mode = LauncherAnchorMode(rawValue: raw) {
            launcherAnchor = mode
        } else {
            launcherAnchor = .dock
        }
    }

    /// Dismissing the welcome card counts as skip — the offer never reappears.
    func markInstallRegisterSkippedIfUndecided() {
        if installRegisterChoice == .undecided {
            installRegisterChoice = .skipped
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

    func applySize(_ size: LauncherSize) {
        launcherSize = size
        iconSize = size.defaultIconSize
    }

    func resetOnboarding() {
        hasCompletedOnboarding = false
    }

    func adoptSystemLoginItemState(_ enabled: Bool) {
        guard launchAtLogin != enabled else { return }
        defaults.set(enabled, forKey: Keys.launchAtLogin)
        launchAtLogin = enabled
    }

    var panelWidth: CGFloat {
        launcherShape == .circle ? launcherSize.circleDiameter : launcherSize.panelWidth
    }

    var panelHeight: CGFloat {
        if launcherShape == .circle { return launcherSize.circleDiameter }
        let chrome: CGFloat = 168
        let row: CGFloat = iconSize + 48
        return min(launcherSize.circleDiameter, max(300, chrome + row * 2))
    }

    var panelCornerRadius: CGFloat {
        switch launcherShape {
        case .rounded: return 20
        case .square: return 4
        case .circle: return panelWidth / 2
        }
    }

    var tileWidth: CGFloat { iconSize + 22 }
}

extension Notification.Name {
    static let clutterDockPreferencesChanged = Notification.Name("clutterDockPreferencesChanged")
}
