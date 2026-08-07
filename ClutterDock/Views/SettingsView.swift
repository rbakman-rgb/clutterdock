import SwiftUI
import AppKit
import UniformTypeIdentifiers

struct SettingsView: View {
    @ObservedObject var store: FolderStore
    @ObservedObject var preferences: AppPreferences
    @ObservedObject var history: LaunchHistory
    @ObservedObject private var license = LicenseManager.shared

    @State private var selectedFolderID: UUID?
    @State private var statusMessage: String?
    @State private var licenseDraft = ""

    var body: some View {
        TabView {
            foldersTab.tabItem { Label("Stacks", systemImage: "square.grid.2x2") }
            workspacesTab.tabItem { Label("Workspaces", systemImage: "rectangle.3.group") }
            generalTab.tabItem { Label("General", systemImage: "gearshape") }
            proTab.tabItem { Label("Pro", systemImage: "star.fill") }
            backupTab.tabItem { Label("Backup", systemImage: "externaldrive") }
            aboutTab.tabItem { Label("About", systemImage: "info.circle") }
        }
        .padding(.top, 8)
        .frame(minWidth: 640, minHeight: 480)
    }

    // MARK: - Folders

    private var foldersTab: some View {
        NavigationSplitView {
            List(selection: $selectedFolderID) {
                ForEach(store.folders) { folder in
                    Label {
                        HStack {
                            Text(folder.name)
                            if folder.isSmart {
                                Text("smart")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } icon: {
                        Image(systemName: folder.symbolName ?? "folder.fill")
                    }
                    .tag(folder.id)
                }
                .onMove { s, d in store.moveFolder(from: s, to: d) }
            }
            .navigationSplitViewColumnWidth(min: 170, ideal: 200)
            .toolbar {
                ToolbarItemGroup {
                    Button {
                        if store.addFolder(named: "New Stack", symbolName: "folder.fill") {
                            selectedFolderID = store.folders.last(where: { !$0.isSmart })?.id
                        } else {
                            presentAlert("ClutterDock Pro", FeatureGate.folderLimitMessage(current: store.normalFolderCount))
                        }
                    } label: { Image(systemName: "plus") }
                    Button {
                        if let id = selectedFolderID { store.deleteFolder(id: id) }
                        selectedFolderID = store.selectedFolderID
                    } label: { Image(systemName: "minus") }
                    .disabled(selectedFolderID == nil)
                }
            }
        } detail: {
            if let folder = currentFolder {
                folderDetail(folder)
            } else {
                emptyState("Select a Stack", "square.grid.2x2", "Choose a stack to name, pick a symbol, and manage items.")
            }
        }
        .onAppear { selectedFolderID = store.selectedFolderID ?? store.folders.first?.id }
        .onChange(of: selectedFolderID) {
            if let selectedFolderID { store.selectFolder(id: selectedFolderID) }
        }
    }

    private var currentFolder: AppFolder? {
        guard let selectedFolderID else { return nil }
        return store.folders.first { $0.id == selectedFolderID }
    }

    @ViewBuilder
    private func folderDetail(_ folder: AppFolder) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Form {
                Section("Stack") {
                    Text("Stacks are your mini-docks — e.g. Coding, Client A, Personal.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("Name", text: Binding(
                        get: { folder.name },
                        set: { store.renameFolder(id: folder.id, to: $0) }
                    ))
                    .disabled(folder.isSmart)

                    if !folder.isSmart {
                        Picker("Symbol", selection: Binding(
                            get: { folder.symbolName ?? "folder.fill" },
                            set: { store.setFolderSymbol(id: folder.id, symbolName: $0) }
                        )) {
                            ForEach(StackSymbols.all, id: \.self) { s in
                                Label(s, systemImage: s).tag(s)
                            }
                        }

                        Picker("Sort", selection: Binding(
                            get: { folder.sortMode },
                            set: { store.setFolderSort(id: folder.id, mode: $0) }
                        )) {
                            ForEach(FolderSortMode.allCases) { m in Text(m.label).tag(m) }
                        }

                        Picker("View", selection: Binding(
                            get: { folder.viewMode },
                            set: { store.setFolderView(id: folder.id, mode: $0) }
                        )) {
                            ForEach(FolderViewMode.allCases) { m in Text(m.label).tag(m) }
                        }

                        Picker("Hotkey", selection: Binding(
                            get: { folder.hotkey },
                            set: { new in
                                if !store.setFolderHotkey(id: folder.id, hotkey: new) {
                                    presentAlert("ClutterDock Pro", "Per-folder hotkeys are a Pro feature.")
                                }
                            }
                        )) {
                            ForEach(FolderHotkey.allCases) { h in
                                Text(h.displayName + (h != .none && !FeatureGate.canUseFolderHotkeys ? " ✦" : "")).tag(h)
                            }
                        }
                        .disabled(!FeatureGate.canUseFolderHotkeys && folder.hotkey == .none)

                        HStack {
                            Button("Custom Image…") {
                                if FeatureGate.canUseCustomFolderImages {
                                    pickFolderImage(for: folder.id)
                                } else {
                                    presentAlert("ClutterDock Pro", "Custom folder images are a Pro feature.")
                                }
                            }
                            if folder.customImagePath != nil {
                                Button("Clear Image") { _ = store.setFolderCustomImage(id: folder.id, path: nil) }
                            }
                        }
                    } else {
                        Text("Smart folder — contents are filled automatically.")
                            .foregroundStyle(.secondary)
                        if folder.smartKind == .recents {
                            Button("Clear launch history") {
                                history.clear()
                                statusMessage = "History cleared."
                            }
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .frame(height: folder.isSmart ? 160 : 280)

            if !folder.isSmart {
                HStack {
                    Button("Add Items…") { addItems(to: folder.id) }
                    Button("Add URL…") { addURL(to: folder.id) }
                    Spacer()
                    Text("Drag & drop from Finder")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal)

                if folder.items.isEmpty {
                    emptyState("No Items", "app.dashed", "Drop apps, files, or folders here — or use Add Items…")
                        .onDrop(of: DropImport.externalTypes, isTargeted: nil) { providers in
                            handleSettingsDrop(providers, folderID: folder.id)
                        }
                } else {
                    List {
                        ForEach(folder.items) { item in
                            HStack(spacing: 12) {
                                Image(nsImage: AppIconService.icon(for: item, size: 28))
                                    .resizable().frame(width: 28, height: 28)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.name)
                                    Text("\(item.kind.label) · \(item.path)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                                Spacer()
                                if !item.exists && item.kind != .url {
                                    Text("Missing").font(.caption).foregroundStyle(.red)
                                }
                            }
                            .contextMenu {
                                Button("Open") { LaunchService.open(item) }
                                Button("Reveal") { LaunchService.reveal(item) }
                                Button("Remove", role: .destructive) {
                                    store.removeItem(id: item.id, from: folder.id)
                                }
                            }
                        }
                        .onDelete { indexSet in
                            for i in indexSet {
                                store.removeItem(id: folder.items[i].id, from: folder.id)
                            }
                        }
                        .onMove { s, d in store.moveItem(from: s, to: d, in: folder.id) }
                    }
                    .listStyle(.inset)
                    .onDrop(of: DropImport.externalTypes, isTargeted: nil) { providers in
                        handleSettingsDrop(providers, folderID: folder.id)
                    }
                }
            } else {
                Spacer()
            }
        }
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
                    Button("Go to Pro…") { /* user switches tab */ }
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
                        .background(Capsule().fill(license.isPro ? Color.orange.opacity(0.3) : Color.primary.opacity(0.1)))
                }

                GroupBox("What’s included") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Free: launcher, up to \(FeatureGate.freeMaxNormalFolders) folders, \(FeatureGate.freeMaxItemsPerFolder) items each, Recents, search in folder, hotkey, JSON backup")
                        Text("Pro: unlimited · workspaces · search all · folder hotkeys · custom images · themes · .clutterdock packs")
                            .fontWeight(.medium)
                    }
                    .font(.callout)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(4)
                }

                if license.isPro {
                    GroupBox("License") {
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
                    GroupBox("Activate license") {
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

                if FeatureGate.canUseThemes {
                    Picker("Theme accent", selection: $preferences.themeAccent) {
                        ForEach(AppPreferences.themeOptions, id: \.self) { t in
                            Text(t.capitalized).tag(t)
                        }
                    }
                } else {
                    Text("Themes are included in Pro.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
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
                Text("Per-folder hotkeys: set under Folders. URL scheme: clutterdock://open")
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
        .padding()
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
            try store.importPack(from: url, merge: merge)
            selectedFolderID = store.selectedFolderID
            statusMessage = merge ? "Merged \(url.lastPathComponent)" : "Replaced from \(url.lastPathComponent)"
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
