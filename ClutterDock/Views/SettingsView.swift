import SwiftUI
import AppKit
import UniformTypeIdentifiers

struct SettingsView: View {
    @ObservedObject var store: FolderStore
    @ObservedObject var preferences: AppPreferences
    @ObservedObject var history: LaunchHistory
    @ObservedObject private var license = LicenseManager.shared

    private enum Tab: String, CaseIterable, Identifiable {
        case stacks = "Stacks", workspaces = "Workspaces", general = "General"
        case pro = "Pro", backup = "Backup", about = "About"
        var id: String { rawValue }
        var symbol: String {
            switch self {
            case .stacks: return "square.grid.2x2"
            case .workspaces: return "rectangle.3.group"
            case .general: return "slider.horizontal.3"
            case .pro: return "sparkles"
            case .backup: return "externaldrive"
            case .about: return "info.circle"
            }
        }
    }

    @State private var selectedFolderID: UUID?
    @State private var statusMessage: String?
    @State private var licenseDraft = ""
    @State private var selectedTab: Tab = .stacks

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("SETTINGS")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.5)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 12)
                ForEach(Tab.allCases) { tab in
                    Button { selectedTab = tab } label: {
                        Label(tab.rawValue, systemImage: tab.symbol)
                            .font(.system(size: 13, weight: selectedTab == tab ? .semibold : .regular))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(PrismSelection(selected: selectedTab == tab))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selectedTab == tab ? .isSelected : [])
                }
                Spacer()
                HStack(spacing: 9) {
                    Image(nsImage: NSApp.applicationIconImage)
                        .resizable().frame(width: 30, height: 30)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("ClutterDock").font(.system(size: 12, weight: .semibold))
                        Text(license.isPro ? "Pro" : "Made for your Mac")
                            .font(.system(size: 10)).foregroundStyle(.secondary)
                    }
                }
                .padding(.horizontal, 8)
            }
            .padding(14)
            .padding(.vertical, 12)
            .frame(width: 180)
            .background(Color.primary.opacity(0.025))
            Divider().opacity(0.45)
            Group {
                switch selectedTab {
                case .stacks: foldersTab
                case .workspaces: settingsSection("Workspaces", subtitle: "A space for every kind of work.") { workspacesTab }
                case .general: settingsSection("General", subtitle: "Make ClutterDock feel at home.") { generalTab }
                case .pro: proTab
                case .backup: backupTab
                case .about: aboutTab
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background { PrismSurface() }
        .tint(Prism.blue)
        .preferredColorScheme(preferences.appearance.colorScheme)
        .frame(minWidth: 800, minHeight: 600)
    }

    private func prismSection<Content: View>(_ title: String,
                                             @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            content().frame(maxWidth: .infinity, alignment: .leading)
        }
        .modifier(PrismCard())
    }

    private func settingsSection<Content: View>(_ title: String, subtitle: String,
                                                @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.system(size: 25, weight: .semibold))
                Text(subtitle).foregroundStyle(.secondary)
            }
            .padding(24)
            content()
        }
    }

    // MARK: - Stacks

    private var foldersTab: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(store.folders) { folder in
                            Button { selectedFolderID = folder.id } label: {
                                Label(folder.name, systemImage: folder.symbolName ?? "folder.fill")
                                    .font(.system(size: 12, weight: .medium))
                                    .padding(.horizontal, 12).padding(.vertical, 8)
                                    .background(PrismSelection(selected: selectedFolderID == folder.id))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(selectedFolderID == folder.id ? .isSelected : [])
                            .contextMenu {
                                if !folder.isSmart { Button("Rename…") { promptRename(folder) } }
                                Button("Move left") { moveStack(folder, by: -1) }
                                    .disabled(store.folders.first?.id == folder.id)
                                Button("Move right") { moveStack(folder, by: 1) }
                                    .disabled(store.folders.last?.id == folder.id)
                                Divider()
                                Button("Delete Stack", role: .destructive) { deleteStack(folder) }
                            }
                        }
                    }
                }
                Menu {
                    Button("New Stack") {
                        if store.addFolder(named: "New Stack", symbolName: "folder.fill") {
                            selectedFolderID = store.folders.last(where: { !$0.isSmart })?.id
                        } else {
                            presentAlert("ClutterDock Pro", FeatureGate.folderLimitMessage(current: store.normalFolderCount))
                        }
                    }
                    if let folder = currentFolder {
                        Divider()
                        Button("Move stack left") { moveStack(folder, by: -1) }
                            .disabled(store.folders.first?.id == folder.id)
                        Button("Move stack right") { moveStack(folder, by: 1) }
                            .disabled(store.folders.last?.id == folder.id)
                        Button("Delete Stack", role: .destructive) { deleteStack(folder) }
                    }
                } label: { Image(systemName: "plus") }
                .menuStyle(.borderlessButton).frame(width: 28)
                .accessibilityLabel("Manage stacks")
            }
            if let folder = currentFolder {
                folderDetail(folder)
            } else {
                emptyState("Select a Stack", "square.grid.2x2", "Choose a stack to manage its appearance and items.")
            }
        }
        .padding(24)
        .onAppear { selectedFolderID = store.selectedFolderID ?? store.folders.first?.id }
        .onChange(of: selectedFolderID) {
            if let selectedFolderID { store.selectFolder(id: selectedFolderID) }
        }
        .onChange(of: store.folders.map(\.id)) {
            if currentFolder == nil { selectedFolderID = store.selectedFolderID ?? store.folders.first?.id }
        }
    }

    private func moveStack(_ folder: AppFolder, by delta: Int) {
        guard let index = store.folders.firstIndex(where: { $0.id == folder.id }),
              store.folders.indices.contains(index + delta) else { return }
        store.moveFolder(from: IndexSet(integer: index), to: index + delta + (delta > 0 ? 1 : 0))
    }

    private func deleteStack(_ folder: AppFolder) {
        store.deleteFolder(id: folder.id)
        selectedFolderID = store.selectedFolderID
    }

    private func promptRename(_ folder: AppFolder) {
        let alert = NSAlert()
        alert.messageText = "Rename Stack"
        alert.informativeText = "e.g. Coding, Design, Work — each stack is its own dock of apps and files."
        alert.addButton(withTitle: "Rename")
        alert.addButton(withTitle: "Cancel")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 240, height: 24))
        field.stringValue = folder.name
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let trimmed = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        store.renameFolder(id: folder.id, to: trimmed)
    }

    private var currentFolder: AppFolder? {
        guard let selectedFolderID else { return nil }
        return store.folders.first { $0.id == selectedFolderID }
    }

    private func propertyRow<Content: View>(_ title: String,
                                            @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 16) {
            Text(title).foregroundStyle(.secondary).frame(width: 70, alignment: .leading)
            Spacer(minLength: 0)
            content()
        }
        .frame(minHeight: 29)
    }

    @ViewBuilder
    private func folderDetail(_ folder: AppFolder) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(folder.name).font(.system(size: 25, weight: .semibold))
                Spacer()
                Text(folder.isSmart ? "SMART STACK" : "STACK")
                    .font(.system(size: 10, weight: .semibold)).tracking(1.2).foregroundStyle(.secondary)
            }
            VStack(spacing: 5) {
                propertyRow("Name") {
                    Text(folder.name)
                    if !folder.isSmart {
                        Button("Rename…") { promptRename(folder) }.controlSize(.small)
                    }
                }
                if !folder.isSmart {
                    Divider().opacity(0.5)
                    propertyRow("Icon") {
                        Picker("Stack icon", selection: Binding(
                            get: { folder.symbolName ?? "folder.fill" },
                            set: { store.setFolderSymbol(id: folder.id, symbolName: $0) }
                        )) {
                            ForEach(StackSymbols.all, id: \.self) { symbol in
                                Image(systemName: symbol).tag(symbol).accessibilityLabel(symbol)
                            }
                        }
                        .labelsHidden().frame(width: 64)
                        Button("Custom Image…") {
                            if FeatureGate.canUseCustomFolderImages { pickFolderImage(for: folder.id) }
                            else { presentAlert("ClutterDock Pro", "Custom folder images are a Pro feature.") }
                        }.controlSize(.small)
                        if folder.customImagePath != nil {
                            Button("Clear") { _ = store.setFolderCustomImage(id: folder.id, path: nil) }.controlSize(.small)
                        }
                    }
                    Divider().opacity(0.5)
                    propertyRow("Sort") {
                        Picker("Sort", selection: Binding(
                            get: { folder.sortMode }, set: { store.setFolderSort(id: folder.id, mode: $0) }
                        )) { ForEach(FolderSortMode.allCases) { Text($0.label).tag($0) } }
                        .labelsHidden().frame(width: 180)
                    }
                    Divider().opacity(0.5)
                    propertyRow("View") {
                        Picker("View", selection: Binding(
                            get: { folder.viewMode }, set: { store.setFolderView(id: folder.id, mode: $0) }
                        )) { ForEach(FolderViewMode.allCases) { Text($0.label).tag($0) } }
                        .labelsHidden().pickerStyle(.segmented).frame(width: 180)
                    }
                    Divider().opacity(0.5)
                    propertyRow("Hotkey") {
                        Picker("Hotkey", selection: Binding(
                            get: { folder.hotkey },
                            set: { if !store.setFolderHotkey(id: folder.id, hotkey: $0) {
                                presentAlert("ClutterDock Pro", "Per-folder hotkeys are a Pro feature.")
                            } }
                        )) {
                            ForEach(FolderHotkey.allCases) { hotkey in
                                Text(hotkey.displayName + (hotkey != .none && !FeatureGate.canUseFolderHotkeys ? " · Pro" : "")).tag(hotkey)
                            }
                        }
                        .labelsHidden().frame(width: 180)
                        .disabled(!FeatureGate.canUseFolderHotkeys && folder.hotkey == .none)
                    }
                } else {
                    Divider().opacity(0.5)
                    Text("This stack updates automatically as you use your Mac.")
                        .foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8)
                    if folder.smartKind == .recents {
                        Button("Clear launch history") { history.clear(); statusMessage = "History cleared." }
                    }
                }
            }
            .modifier(PrismCard())
            if !folder.isSmart {
                HStack(spacing: 10) {
                    Text("Items").font(.headline)
                    Text("\(folder.items.count)").foregroundStyle(.secondary)
                    Spacer()
                    Button("Add URL…") { addURL(to: folder.id) }
                    Button("Add Items…") { addItems(to: folder.id) }.buttonStyle(.borderedProminent)
                }
                if folder.items.isEmpty {
                    emptyState("Your stack starts here", "app.dashed", "Drop apps, files, or folders here, or choose Add Items.")
                        .onDrop(of: DropImport.externalTypes, isTargeted: nil) { handleSettingsDrop($0, folderID: folder.id) }
                } else {
                    List {
                        ForEach(folder.items) { item in
                            HStack(spacing: 12) {
                                ItemIconView(item: item, size: 32)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(item.name).font(.system(size: 13, weight: .medium))
                                    Text(item.kind.label).font(.system(size: 11)).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if !item.exists && item.kind != .url {
                                    Label("Missing", systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(.orange)
                                }
                                Menu { itemActions(item, folder: folder) } label: { Image(systemName: "ellipsis") }
                                    .menuStyle(.borderlessButton).frame(width: 24)
                                    .accessibilityLabel("Actions for \(item.name)")
                            }
                            .padding(.vertical, 5)
                            .help(item.path)
                            .contextMenu { itemActions(item, folder: folder) }
                            .listRowBackground(Color.clear)
                        }
                        .onDelete { indices in
                            for index in indices { store.removeItem(id: folder.items[index].id, from: folder.id) }
                        }
                        .onMove { store.moveItem(from: $0, to: $1, in: folder.id) }
                    }
                    .listStyle(.plain).scrollContentBackground(.hidden)
                    .background(Color.primary.opacity(0.025), in: RoundedRectangle(cornerRadius: 12))
                    .onDrop(of: DropImport.externalTypes, isTargeted: nil) { handleSettingsDrop($0, folderID: folder.id) }
                }
            } else { Spacer() }
            if let statusMessage {
                Text(statusMessage).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func itemActions(_ item: DockItem, folder: AppFolder) -> some View {
        Button("Open") { LaunchService.open(item) }
        Button("Show in Finder") { LaunchService.reveal(item) }
        Button("Move up") { _ = store.nudgeItem(id: item.id, by: -1, in: folder.id) }
            .disabled(folder.items.first?.id == item.id)
        Button("Move down") { _ = store.nudgeItem(id: item.id, by: 1, in: folder.id) }
            .disabled(folder.items.last?.id == item.id)
        Divider()
        Button("Remove", role: .destructive) { store.removeItem(id: item.id, from: folder.id) }
    }

    @discardableResult
    private func handleSettingsDrop(_ providers: [NSItemProvider], folderID: UUID) -> Bool {
        Task { @MainActor in
            let parsed = await DropImport.parse(providers)
            var added = 0
            var hitLimit = false
            if !parsed.paths.isEmpty {
                let r = store.addPaths(parsed.paths, to: folderID)
                added += r.added
                hitLimit = hitLimit || r.hitLimit
            }
            for url in parsed.urlStrings {
                let r = store.addURL(url, to: folderID)
                added += r.added
                hitLimit = hitLimit || r.hitLimit
            }
            if hitLimit {
                presentAlert("ClutterDock Pro", FeatureGate.itemLimitMessage(current: store.folders.first(where: { $0.id == folderID })?.items.count ?? 0))
            } else if added > 0 {
                statusMessage = added == 1 ? "Added 1 item." : "Added \(added) items."
            } else {
                statusMessage = "Nothing new to add."
            }
        }
        return true
    }

    // MARK: - Workspaces

    private var workspacesTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !FeatureGate.canUseWorkspaces {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Workspaces are a Pro feature")
                        .font(.title3.weight(.semibold))
                    Text("Switch between Work / Personal / Client folder sets with one click. Included in ClutterDock Pro (one-time unlock).")
                        .foregroundStyle(.secondary)
                    Text(FeatureGate.proUpgradeSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button("Go to Pro…") { selectedTab = .pro }
                        .buttonStyle(.borderedProminent)
                }
                .padding()
                Spacer()
            } else {
                Text("Workspaces show different sets of folders. “All” (empty selection) shows every folder.")
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack {
                    Button("Add Workspace") {
                        _ = store.addWorkspace(named: "Workspace \(store.workspaces.count + 1)")
                    }
                    Spacer()
                }

                List {
                    ForEach(store.workspaces) { ws in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                TextField("Name", text: Binding(
                                    get: { ws.name },
                                    set: { store.renameWorkspace(id: ws.id, to: $0) }
                                ))
                                .textFieldStyle(.roundedBorder)
                                Button("Activate") { store.selectWorkspace(id: ws.id) }
                                if store.workspaces.count > 1 {
                                    Button("Delete", role: .destructive) {
                                        store.deleteWorkspace(id: ws.id)
                                    }
                                }
                            }
                            Text("Folders in this workspace (none checked = all folders):")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            FlowCheckboxes(workspace: ws, folders: store.folders.filter { !$0.isSmart }) { folderID in
                                store.toggleFolderInWorkspace(workspaceID: ws.id, folderID: folderID)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                }
            }
        }
        .padding()
    }

    // MARK: - Pro

    private var proTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(license.isPro ? "You’re on Pro" : "ClutterDock Free")
                            .font(.title2.weight(.bold))
                        Text(license.isPro
                             ? "Thanks for supporting ClutterDock. All Pro features are unlocked on this Mac."
                             : "Free forever for daily use. Pro is a one-time unlock for power features.")
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(license.isPro ? "PRO" : "FREE")
                        .font(.caption.weight(.bold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(license.isPro ? Prism.blue.opacity(0.18) : Color.primary.opacity(0.1)))
                }

                prismSection("What’s included") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Free: launcher, up to \(FeatureGate.freeMaxNormalFolders) folders, \(FeatureGate.freeMaxItemsPerFolder) items each, Recents, search in folder, hotkey, JSON backup")
                        Text("Pro: unlimited · workspaces · search all · folder hotkeys · custom images · .clutterdock packs")
                            .fontWeight(.medium)
                    }
                    .font(.callout)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(4)
                }

                if license.isPro {
                    prismSection("License") {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Active key: \(license.licenseKeyDisplay)")
                            Button("Deactivate Pro on this Mac", role: .destructive) {
                                license.deactivate()
                                statusMessage = "Pro deactivated."
                            }
                        }
                        .padding(4)
                    }
                } else {
                    prismSection("Activate license") {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Paste your Pro license key (format SDPRO-XXXX-YYYY-ZZZZ).")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            TextField("SDPRO-XXXX-XXXX-XXXX", text: $licenseDraft)
                                .textFieldStyle(.roundedBorder)
                            HStack {
                                Button("Activate") {
                                    if license.activate(key: licenseDraft) {
                                        statusMessage = "Pro activated — thank you!"
                                        licenseDraft = ""
                                    } else {
                                        statusMessage = license.lastError ?? "Invalid key."
                                    }
                                }
                                .buttonStyle(.borderedProminent)
                                Button("Get Pro…") {
                                    NSWorkspace.shared.open(AppSupport.pricingURL)
                                }
                                Button("Buy Me a Coffee") {
                                    if let url = AppSupport.buyMeACoffeeURL {
                                        NSWorkspace.shared.open(url)
                                    }
                                }
                            }
                            Text("Pro is ~$14.99 one-time · works on Mac + Windows · offline key, no account.")
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(4)
                    }
                }

                if let statusMessage {
                    Text(statusMessage).font(.callout).foregroundStyle(.secondary)
                }
            }
            .padding(20)
        }
    }

    // MARK: - General

    private var generalTab: some View {
        Form {
            Section("Appearance") {
                Picker("Appearance", selection: $preferences.appearance) {
                    ForEach(AppAppearance.allCases) { Text($0.rawValue).tag($0) }
                }
                HStack {
                    Text("Icon size")
                    Spacer()
                    Text("\(Int(preferences.iconSize)) pt").foregroundStyle(.secondary).monospacedDigit()
                }
                Slider(value: $preferences.iconSize, in: 40...80, step: 4)
                Toggle("Show running-app indicator", isOn: $preferences.showRunningIndicator)
                Toggle("Close launcher after opening", isOn: $preferences.closeAfterLaunch)
                Toggle(isOn: Binding(
                    get: { preferences.globalSearchDefault },
                    set: { new in
                        if new && !FeatureGate.canUseGlobalSearch {
                            presentAlert("ClutterDock Pro", "Search all folders is a Pro feature.")
                        } else {
                            preferences.globalSearchDefault = new
                        }
                    }
                )) {
                    Text(FeatureGate.canUseGlobalSearch ? "Default search to “All folders”" : "Default search to “All folders” (Pro)")
                }

            }
            Section("Smart stacks") {
                Toggle("Show Recents stack", isOn: Binding(
                    get: { !store.hiddenSmartKinds.contains(.recents) },
                    set: { store.setSmartFolderVisible(.recents, $0) }
                ))
                Toggle("Show Running stack", isOn: Binding(
                    get: { !store.hiddenSmartKinds.contains(.running) },
                    set: { store.setSmartFolderVisible(.running, $0) }
                ))
            }
            Section("Access") {
                Toggle("Show menu bar icon", isOn: $preferences.showMenuBarIcon)
                Toggle(isOn: Binding(
                    get: { preferences.launchAtLogin },
                    set: { new in
                        if LoginItemService.setEnabled(new) {
                            preferences.launchAtLogin = new
                        } else {
                            presentAlert("Login Items", "Allow ClutterDock in System Settings → Login Items, or keep the app in /Applications.")
                        }
                    }
                )) { Text("Open at login") }
                Toggle("Global hotkey", isOn: $preferences.hotkeyEnabled)
                Picker("Hotkey", selection: $preferences.hotkeyPreset) {
                    ForEach(HotkeyPreset.allCases) { p in Text(p.displayName).tag(p) }
                }
                .disabled(!preferences.hotkeyEnabled)
                Text("Per-stack hotkeys: set under Stacks. URL scheme: clutterdock://open")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Startup & tips") {
                Toggle("Open launcher when empty on first launch", isOn: $preferences.openEmptyOnLaunch)
                Toggle("Show keyboard hints in launcher", isOn: $preferences.showKeyboardHints)
                Button("Show welcome tips again") {
                    preferences.resetOnboarding()
                    statusMessage = "Open the launcher to see tips."
                }
            }
            Section("Install register (optional)") {
                InstallRegisterSection(preferences: preferences)
            }
            Section("Updates") {
                Toggle("Check for updates automatically", isOn: $preferences.checkForUpdatesAutomatically)
                Text("Current version \(appVersion) (\(appBuild))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("Check for Updates…") {
                    UpdateService.checkAndPrompt(interactive: true)
                }
                Text("Updates download from GitHub Releases. Replace the app in Applications, then reopen — your data and Pro license stay put.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Maintenance") {
                HStack {
                    Button("Remove missing") {
                        let n = store.removeMissingApps()
                        statusMessage = n == 0 ? "Nothing missing." : "Removed \(n)."
                    }
                    Button("Remove duplicates") {
                        let n = store.removeDuplicateApps()
                        statusMessage = n == 0 ? "No duplicates." : "Removed \(n)."
                    }
                    Button("Refresh names") {
                        store.refreshAppNames()
                        statusMessage = "Names refreshed."
                    }
                }
                if let statusMessage {
                    Text(statusMessage).font(.caption).foregroundStyle(.secondary)
                }
            }
            Section("Automation") {
                Text("clutterdock://open")
                Text("clutterdock://open?folder=Work")
                Text("clutterdock://settings")
                Text("clutterdock://add?path=/Applications/Safari.app")
                Text("clutterdock://add?url=https://example.com")
                Text("clutterdock://workspace?name=All")
                    .font(.system(.caption, design: .monospaced))
                Text("Finder: select items → Services → Add to ClutterDock (after enabling in Keyboard settings once).")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .padding(.horizontal, 4)
    }

    // MARK: - Backup

    private var backupTab: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Backup & Packs").font(.title2.weight(.semibold))
            Text("Export JSON or a .clutterdock pack. Import can replace everything or merge by folder name.")
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                Button("Export JSON…") { exportJSON() }
                Button(FeatureGate.canExportPack ? "Export .clutterdock Pack…" : "Export Pack… (Pro)") {
                    if FeatureGate.canExportPack {
                        exportPack()
                    } else {
                        presentAlert("ClutterDock Pro", "Pack export (.clutterdock) is a Pro feature. JSON backup stays free.")
                    }
                }
            }
            HStack(spacing: 12) {
                Button("Import (Replace)…") { importFile(merge: false) }
                Button("Import (Merge)…") { importFile(merge: true) }
            }
            if let statusMessage {
                Text(statusMessage).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: - About

    private var aboutTab: some View {
        VStack(spacing: 14) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 96, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .shadow(radius: 6, y: 2)
            Text("ClutterDock").font(.title.weight(.bold))
            Text("Version \(appVersion) (\(appBuild)) · \(FeatureGate.tierDisplayName)")
                .foregroundStyle(.secondary)
            Text(license.isPro
                 ? "Pro unlocked · apps, files, folders & URLs · unlimited stacks"
                 : "Free Dock folders · upgrade anytime for Pro power features")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            KeyboardCheatSheet()
                .padding(12)
                .background(Color.primary.opacity(0.04))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .padding(.horizontal, 24)

            Button {
                openBuyMeACoffee()
            } label: {
                HStack {
                    Image(systemName: "cup.and.saucer.fill")
                    Text("Buy me a coffee").fontWeight(.semibold)
                }
                .frame(minWidth: 180)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 1.0, green: 0.81, blue: 0.25))
            .foregroundStyle(.black)
            Text("© \(Calendar.current.component(.year, from: Date())) · Free forever")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.2.0"
    }
    private var appBuild: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "3"
    }

    // MARK: - Helpers

    private func emptyState(_ title: String, _ symbol: String, _ sub: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: symbol).font(.system(size: 40, weight: .light)).foregroundStyle(.secondary)
            Text(title).font(.title3.weight(.semibold))
            Text(sub).font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func addItems(to folderID: UUID) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = true
        panel.directoryURL = URL(fileURLWithPath: "/Applications")
        if panel.runModal() == .OK {
            let result = store.addPaths(panel.urls.map(\.path), to: folderID)
            if result.hitLimit {
                presentAlert("ClutterDock Pro", FeatureGate.itemLimitMessage(current: store.folders.first(where: { $0.id == folderID })?.items.count ?? 0))
            }
            statusMessage = "Added \(result.added) item(s)."
        }
    }

    private func addURL(to folderID: UUID) {
        let alert = NSAlert()
        alert.messageText = "Add URL"
        alert.addButton(withTitle: "Add")
        alert.addButton(withTitle: "Cancel")
        let field = NSTextField(string: "https://")
        field.frame = NSRect(x: 0, y: 0, width: 280, height: 24)
        alert.accessoryView = field
        if alert.runModal() == .alertFirstButtonReturn {
            let result = store.addURL(field.stringValue, to: folderID)
            if result.hitLimit {
                presentAlert("ClutterDock Pro", FeatureGate.itemLimitMessage(current: store.folders.first(where: { $0.id == folderID })?.items.count ?? 0))
            }
        }
    }

    private func pickFolderImage(for folderID: UUID) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.png, .jpeg, .tiff, .webP]
        panel.canChooseFiles = true
        if panel.runModal() == .OK, let url = panel.url {
            // Copy into Application Support
            let dir = AppSupport.applicationSupportDirectory.appendingPathComponent("FolderImages", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let dest = dir.appendingPathComponent("\(folderID.uuidString).\(url.pathExtension)")
            try? FileManager.default.removeItem(at: dest)
            try? FileManager.default.copyItem(at: url, to: dest)
            store.setFolderCustomImage(id: folderID, path: dest.path)
            AppIconService.clearCache()
        }
    }

    private func exportJSON() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = "ClutterDock-backup.json"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try store.exportData().write(to: url, options: .atomic)
            statusMessage = "Exported \(url.lastPathComponent)"
        } catch {
            presentAlert("Export failed", error.localizedDescription)
        }
    }

    private func exportPack() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [UTType(filenameExtension: "clutterdock") ?? .json]
        panel.nameFieldStringValue = "MyPack.clutterdock"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try store.exportPack(to: url)
            statusMessage = "Exported pack \(url.lastPathComponent)"
        } catch {
            presentAlert("Export failed", error.localizedDescription)
        }
    }

    private func importFile(merge: Bool) {
        let panel = NSOpenPanel()
        var types: [UTType] = [.json]
        if let t = UTType(filenameExtension: "clutterdock") { types.append(t) }
        if let t = UTType(filenameExtension: "slavedock") { types.append(t) }
        panel.allowedContentTypes = types
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let summary = try store.importPack(from: url, merge: merge)
            selectedFolderID = store.selectedFolderID
            statusMessage = "\(merge ? "Merged" : "Replaced from") \(url.lastPathComponent): \(summary.message)"
        } catch {
            presentAlert("Import failed", error.localizedDescription)
        }
    }

    private func openBuyMeACoffee() {
        if let url = AppSupport.buyMeACoffeeURL {
            NSWorkspace.shared.open(url)
        }
    }

    private func presentAlert(_ title: String, _ message: String) {
        let a = NSAlert()
        a.messageText = title
        a.informativeText = message
        a.runModal()
    }
}

// Simple checkbox list for workspace folders
private struct FlowCheckboxes: View {
    let workspace: Workspace
    let folders: [AppFolder]
    var onToggle: (UUID) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(folders) { folder in
                Toggle(isOn: Binding(
                    get: {
                        // Empty list means all — show as unchecked for "filter mode"
                        workspace.folderIDs.contains(folder.id)
                    },
                    set: { _ in onToggle(folder.id) }
                )) {
                    Text(folder.name)
                }
                .toggleStyle(.checkbox)
            }
        }
    }
}

/// Settings → General rows for the opt-in install register (RON-507).
/// Registering again with the same install ID updates the one record
/// server-side, so "Update email" reuses the same call.
private struct InstallRegisterSection: View {
    @ObservedObject var preferences: AppPreferences
    @State private var email = ""
    @State private var busy = false
    @State private var status: String?

    var body: some View {
        if preferences.installRegisterChoice == .registered {
            Text(preferences.registeredEmail.isEmpty
                ? "This install is counted — thank you!"
                : "This install is counted — release news goes to \(preferences.registeredEmail).")
        }
        Text("Send a one-time ping (Mac + app version + a random ID) so the developer knows this copy is in use. Add an email only if you want release news. Never your stacks, files, or machine name.")
            .font(.caption)
            .foregroundStyle(.secondary)
        HStack {
            TextField("Email (optional)", text: $email)
                .textFieldStyle(.roundedBorder)
            Button(busy ? "Sending…" : (preferences.installRegisterChoice == .registered ? "Update email" : "Count this install")) {
                submit()
            }
            .disabled(busy)
        }
        if let status {
            Text(status)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func submit() {
        busy = true
        status = nil
        let entered = email
        InstallRegisterService.register(email: entered, installId: preferences.installId) { ok in
            busy = false
            if ok {
                preferences.installRegisterChoice = .registered
                let trimmed = entered.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { preferences.registeredEmail = trimmed }
                status = "Thanks — this install is counted."
            } else {
                status = "Couldn't reach clutterdock.com — check your connection and try again."
            }
        }
    }
}
