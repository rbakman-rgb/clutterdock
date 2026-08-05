import SwiftUI

/// First-run coach card shown inside the launcher until dismissed.
struct OnboardingCard: View {
    var onDismiss: () -> Void
    var onAddApps: () -> Void
    var onOpenSettings: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: "sparkles")
                    .foregroundStyle(.orange)
                Text("Welcome to SlaveDock")
                    .font(.headline)
                Spacer()
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Dismiss tips")
            }

            VStack(alignment: .leading, spacing: 8) {
                tipRow("1", "Drop apps, files, or folders here — or click +")
                tipRow("2", "Click an icon to open · Esc closes the panel")
                tipRow("3", "⌘⇧D opens SlaveDock from anywhere")
                tipRow("4", "⌘G searches all folders · ⌘1–9 switches tabs")
                tipRow("5", "⌥← / ⌥→ reorders the selected item")
            }
            .font(.callout)

            HStack(spacing: 10) {
                Button("Add apps…") { onAddApps() }
                    .buttonStyle(.borderedProminent)
                Button("Settings") { onOpenSettings() }
                    .buttonStyle(.bordered)
                Spacer()
                Button("Got it") { onDismiss() }
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(16)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.accentColor.opacity(0.35), lineWidth: 1)
        )
        .padding(14)
        .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
    }

    private func tipRow(_ num: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(num)
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 18, height: 18)
                .background(Circle().fill(Color.accentColor))
            Text(text)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Full keyboard reference used in About / help.
struct KeyboardCheatSheet: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Keyboard")
                .font(.headline)
            Group {
                row("↑ ↓ ← →", "Move selection")
                row("Return", "Open selected")
                row("Esc", "Close launcher")
                row("⌘1 … ⌘9", "Switch folder tab")
                row("⌘G", "Toggle search all folders")
                row("⌥← / ⌥→", "Reorder selected item")
                row("⌘⇧D", "Open/close (default hotkey)")
                row("Type", "Filter items")
            }
            .font(.system(.caption, design: .default))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(_ keys: String, _ action: String) -> some View {
        HStack {
            Text(keys)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 110, alignment: .leading)
            Text(action)
        }
    }
}

struct KeyboardHintsBar: View {
    var body: some View {
        Text("↑↓←→ move · ⏎ open · esc close · ⌘G all · ⌥←→ reorder · ⌘1–9 folders")
            .font(.system(size: 10))
            .foregroundStyle(.tertiary)
            .lineLimit(2)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
    }
}
