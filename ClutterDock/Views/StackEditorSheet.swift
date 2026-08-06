import SwiftUI

/// Create or customize a stack: name + SF Symbol icon.
struct StackEditorSheet: View {
    enum Mode {
        case create
        case edit(AppFolder)
    }

    let mode: Mode
    var onCancel: () -> Void
    var onSave: (_ name: String, _ symbolName: String) -> Void

    @State private var name: String = ""
    @State private var symbolName: String = "folder.fill"

    private var title: String {
        switch mode {
        case .create: return "New stack"
        case .edit: return "Customize stack"
        }
    }

    private var confirmLabel: String {
        switch mode {
        case .create: return "Create"
        case .edit: return "Save"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(title)
                    .font(.title2.weight(.semibold))
                Spacer()
                Button("Cancel") { onCancel() }
                    .keyboardShortcut(.cancelAction)
            }

            Text(
                "Stacks group apps, files, and links by context — e.g. Coding, Design, Work."
            )
            .font(.callout)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)

            if case .create = mode {
                Text("Quick start")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: 8)], spacing: 8) {
                    ForEach(StackSymbols.presets, id: \.name) { preset in
                        Button {
                            name = preset.name
                            symbolName = preset.symbol
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: preset.symbol)
                                Text(preset.name)
                                    .lineLimit(1)
                            }
                            .font(.caption.weight(.medium))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .padding(.horizontal, 6)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(name == preset.name && symbolName == preset.symbol
                                          ? Color.accentColor.opacity(0.2)
                                          : Color.primary.opacity(0.06))
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Name")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                TextField("e.g. Coding", text: $name)
                    .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Symbol")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 36), spacing: 8)],
                    spacing: 8
                ) {
                    ForEach(StackSymbols.all, id: \.self) { symbol in
                        Button {
                            symbolName = symbol
                        } label: {
                            Image(systemName: symbol)
                                .font(.system(size: 14, weight: .semibold))
                                .frame(width: 36, height: 36)
                                .background(
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .fill(symbolName == symbol
                                              ? Color.accentColor.opacity(0.25)
                                              : Color.primary.opacity(0.06))
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .strokeBorder(
                                            symbolName == symbol
                                                ? Color.accentColor.opacity(0.6)
                                                : Color.clear,
                                            lineWidth: 1.5
                                        )
                                )
                        }
                        .buttonStyle(.plain)
                        .help(symbol)
                    }
                }
            }

            HStack {
                Spacer()
                Button(confirmLabel) {
                    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                    onSave(trimmed.isEmpty ? "Stack" : trimmed, symbolName)
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 420, height: {
            if case .create = mode { return 520 }
            return 460
        }())
        .onAppear {
            switch mode {
            case .create:
                name = ""
                symbolName = "folder.fill"
            case .edit(let folder):
                name = folder.name
                symbolName = folder.symbolName ?? "folder.fill"
            }
        }
    }
}
