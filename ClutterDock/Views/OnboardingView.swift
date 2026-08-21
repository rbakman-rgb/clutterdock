import SwiftUI

/// First-run coach card shown inside the launcher until dismissed.
struct OnboardingCard: View {
    @ObservedObject var preferences: AppPreferences
    var onDismiss: () -> Void
    var onAddApps: () -> Void
    var onOpenSettings: () -> Void

    @State private var registerEmail = ""
    @State private var registerBusy = false
    @State private var registerStatus: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Image(systemName: "sparkles")
                    .foregroundStyle(.orange)
                Text("Welcome to ClutterDock")
                    .font(.headline)
                Spacer()
                Button {
                    dismiss(onDismiss)
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Dismiss tips")
                .accessibilityLabel("Dismiss welcome tips")
            }

            VStack(alignment: .leading, spacing: 8) {
                tipRow("1", "Create stacks for each context — Coding, Design, Work — each with a name & symbol")
                tipRow("2", "Drop apps, files, or links into the open stack (or use +)")
                tipRow("3", "Click an icon to open · Esc closes · ⌘⇧D opens from anywhere")
                tipRow("4", "⌘1–9 switches stacks · right‑click a tab to Customize")
                tipRow("5", "⌥← / ⌥→ reorders items · drag onto another tab to move")
            }
            .font(.callout)

            if preferences.installRegisterChoice == .undecided {
                Divider()
                VStack(alignment: .leading, spacing: 6) {
                    Text("Optional: count this install")
                        .font(.subheadline.weight(.semibold))
                    Text("Send a one-time ping (Mac + version + a random ID) so the developer knows this copy launched. Add your email only if you want release news. Skipping sends nothing.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        TextField("Email (optional)", text: $registerEmail)
                            .textFieldStyle(.roundedBorder)
                        Button(registerBusy ? "Sending…" : "Count me in") { submitRegister() }
                            .disabled(registerBusy)
                    }
                    if let registerStatus {
                        Text(registerStatus)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            HStack(spacing: 10) {
                Button("Add apps…") { dismiss(onAddApps) }
                    .buttonStyle(.borderedProminent)
                Button("Settings") { dismiss(onOpenSettings) }
                    .buttonStyle(.bordered)
                Spacer()
                Button("Got it") { dismiss(onDismiss) }
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

    /// Any way out of the card counts as skip if the user didn't opt in —
    /// the register offer must never be shown again.
    private func dismiss(_ action: () -> Void) {
        preferences.markInstallRegisterSkippedIfUndecided()
        action()
    }

    private func submitRegister() {
        registerBusy = true
        registerStatus = nil
        let email = registerEmail
        InstallRegisterService.register(email: email, installId: preferences.installId) { ok in
            registerBusy = false
            if ok {
                preferences.installRegisterChoice = .registered
                preferences.registeredEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
            } else {
                registerStatus = "Couldn't reach clutterdock.com — you can try again later in Settings → General."
            }
        }
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
                row("Return / Space", "Open selected")
                row("Tab / ⇧Tab", "Cycle stack tabs")
                row("Esc", "Close launcher")
                row("⌘1 … ⌘9", "Switch folder tab")
                row("⌘G", "Toggle search all folders")
                row("⌥← / ⌥→", "Reorder selected item")
                row("Drag", "Reorder · drop on tab to move")
                row("Drop", "Apps/files/folders/URLs from Finder")
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
        // .quaternary at 10pt was effectively invisible against the panel material
        Text("↑↓←→  ·  ⏎ open  ·  drop files  ·  drag to reorder  ·  ⌘1–9")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 12)
            .padding(.vertical, 3)
    }
}
