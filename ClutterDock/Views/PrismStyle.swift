import SwiftUI

/// Shared material and selection treatment for the launcher and Settings.
enum Prism {
    static let blue = Color(red: 0.15, green: 0.46, blue: 0.96)
    static let radius: CGFloat = 22
}

extension AppAppearance {
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

struct PrismSurface: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        ZStack {
            if reduceTransparency || contrast == .increased {
                Color(nsColor: .windowBackgroundColor)
            } else {
                Rectangle().fill(.regularMaterial)
                LinearGradient(
                    colors: scheme == .dark
                        ? [Color(red: 0.10, green: 0.16, blue: 0.25).opacity(0.6), .black.opacity(0.2)]
                        : [.white.opacity(0.62), Color(red: 0.87, green: 0.94, blue: 1).opacity(0.32)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            }
        }
        .allowsHitTesting(false)
    }
}

struct PrismSelection: View {
    var selected: Bool
    var hovering = false
    var radius: CGFloat = 10
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(selected ? Prism.blue.opacity(0.13) : Color.primary.opacity(hovering ? 0.055 : 0))
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(selected ? Prism.blue.opacity(contrast == .increased ? 1 : 0.45) : .clear,
                                  lineWidth: contrast == .increased ? 2 : 1)
            }
    }
}

struct PrismCard: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast

    func body(content: Content) -> some View {
        content
            .padding(14)
            .background(scheme == .dark ? Color.white.opacity(0.045) : Color.white.opacity(0.58),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(Color.primary.opacity(contrast == .increased ? 0.45 : 0.08))
            }
    }
}

