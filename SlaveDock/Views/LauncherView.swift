import SwiftUI
import AppKit
import UniformTypeIdentifiers

struct LauncherView: View {
    @ObservedObject var store: FolderStore
    @ObservedObject var preferences: AppPreferences
    @ObservedObject var runningApps: RunningAppsService
    @ObservedObject var history: LaunchHistory

    var onDismiss: () -> Void
    var onOpenSettings: () -> Void

    @State private var isTargeted = false
    @State private var newFolderName = ""
    @State private var showingNewFolder = false
    @State private var showingAddURL = false
    @State private var urlDraft = ""
    @State private var searchText = ""
    @State private var searchGlobal = false
    @State private var selectedItemID: UUID?
    @State private var showingHelp = false
    @State private var dragSourceID: UUID?
    @ObservedObject private var license = LicenseManager.shared
    @FocusState private var searchFocused: Bool

    private var columns: [GridItem] {
        [GridItem(.adaptive(minimum: preferences.tileWidth, maximum: preferences.tileWidth + 12), spacing: 10)]
    }

    private var currentFolder: AppFolder? { store.selectedFolder }

    private var folderItems: [DockItem] {
        guard let folder = currentFolder else { return [] }
        let items = store.displayItems(for: folder, history: history, running: runningApps)
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !searchGlobal else { return items }
        return items.filter { $0.searchText.contains(q.lowercased()) }
    }

    private var globalHits: [FolderStore.SearchHit] {
        guard searchGlobal else { return [] }
        return store.searchAll(query: searchText)
    }

    private var selectableIDs: [UUID] {
        if searchGlobal && !searchText.isEmpty {
            return globalHits.map(\.item.id)
        }
        return folderItems.map(\.id)
    }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                workspaceBar
                folderTabs
                searchBar
                Divider().opacity(0.35)
                content
                if preferences.showKeyboardHints {
                    KeyboardHintsBar()
                }
                Divider().opacity(0.35)
                footer
            }

            if !preferences.hasCompletedOnboarding {
                Color.black.opacity(0.18)
                    .ignoresSafeArea()
                OnboardingCard(
                    onDismiss: { preferences.hasCompletedOnboarding = true },
                    onAddApps: {
                        preferences.hasCompletedOnboarding = true
                        addFiles()
                    },
                    onOpenSettings: {
                        preferences.hasCompletedOnboarding = true
                        onOpenSettings()
                    }
                )
            }
        }
        .frame(width: preferences.panelWidth, height: preferences.panelHeight)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.12), lineWidth: 1)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(isTargeted ? Color.accentColor : .clear, lineWidth: 2)
        )
        .onDrop(of: [.fileURL], isTargeted: $isTargeted, perform: handleDrop)
        .alert("New Folder", isPresented: $showingNewFolder) {
            TextField("Folder name", text: $newFolderName)
            Button("Cancel", role: .cancel) { newFolderName = "" }
            Button("Create") {
                if !store.addFolder(named: newFolderName) {
                    promptUpgrade(FeatureGate.folderLimitMessage(current: store.normalFolderCount))
                }
                newFolderName = ""
            }
        }
        .alert("Add URL", isPresented: $showingAddURL) {
            TextField("https://…", text: $urlDraft)
            Button("Cancel", role: .cancel) { urlDraft = "" }
            Button("Add") {
                let result = store.addURL(urlDraft)
                if result.hitLimit {
                    promptUpgrade(FeatureGate.itemLimitMessage(current: store.selectedFolder?.items.count ?? 0))
                }
                urlDraft = ""
            }
        }
        .sheet(isPresented: $showingHelp) {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("SlaveDock help").font(.title2.weight(.semibold))
                    Spacer()
                    Button("Done") { showingHelp = false }
                        .keyboardShortcut(.cancelAction)
                }
                KeyboardCheatSheet()
                Text("Tip: keep SlaveDock in the Dock, then click it or press your hotkey anytime.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(24)
            .frame(width: 420, height: 340)
        }
        .onAppear {
            searchGlobal = FeatureGate.canUseGlobalSearch && preferences.globalSearchDefault
            searchText = ""
            selectedItemID = selectableIDs.first
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { searchFocused = true }
        }
        .onChange(of: store.selectedFolderID) { refreshSelection() }
        .onChange(of: searchText) { refreshSelection() }
        .onChange(of: searchGlobal) { refreshSelection() }
        .focusable()
        .onKeyPress(.escape) {
            if !preferences.hasCompletedOnboarding {
                preferences.hasCompletedOnboarding = true
                return .handled
            }
            onDismiss()
            return .handled
        }
        .onKeyPress(.return) { launchSelected(); return .handled }
        .onKeyPress(.upArrow) { moveSelection(by: -columnsEstimate()); return .handled }
        .onKeyPress(.downArrow) { moveSelection(by: columnsEstimate()); return .handled }
        .onKeyPress(.leftArrow) { handleLeftRight(delta: -1) }
        .onKeyPress(.rightArrow) { handleLeftRight(delta: 1) }
        .onKeyPress(keys: [.init("1"), .init("2"), .init("3"), .init("4"), .init("5"),
                           .init("6"), .init("7"), .init("8"), .init("9")]) { press in
            guard press.modifiers.contains(.command),
                  let ch = press.characters.first,
                  let n = Int(String(ch)), n >= 1 else { return .ignored }
            store.selectFolder(at: n - 1)
            return .handled
        }
        .onKeyPress(keys: [.init("g")]) { press in
            guard press.modifiers.contains(.command) else { return .ignored }
            if FeatureGate.canUseGlobalSearch {
                searchGlobal.toggle()
            } else {
                promptUpgrade("Search across all folders is a Pro feature.")
            }
            return .handled
        }
        .onKeyPress(keys: [.init("?")]) { _ in
            showingHelp = true
            return .handled
        }
        .onKeyPress(keys: [.init("/")]) { press in
            guard press.modifiers.contains(.command) else { return .ignored }
            showingHelp = true
            return .handled
        }
    }

    private func handleLeftRight(delta: Int) -> KeyPress.Result {
        // Option+arrow reorders; plain arrow moves selection
        if NSEvent.modifierFlags.contains(.option),
           let id = selectedItemID,
           let folder = currentFolder,
           !folder.isSmart {
            _ = store.nudgeItem(id: id, by: delta, in: folder.id)
            return .handled
        }
        moveSelection(by: delta)
        return .handled
    }

    // MARK: - Bars

    private var workspaceBar: some View {
        Group {
            if FeatureGate.canUseWorkspaces && store.workspaces.count > 1 {
                HStack(spacing: 6) {
                    Image(systemName: "rectangle.3.group")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    ForEach(store.workspaces) { ws in
                        Button {
                            store.selectWorkspace(id: ws.id)
                        } label: {
                            Text(ws.name)
                                .font(.system(size: 11, weight: ws.id == store.activeWorkspaceID ? .semibold : .regular))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(
                                    Capsule().fill(ws.id == store.activeWorkspaceID
                                                   ? Color.accentColor.opacity(0.2)
                                                   : Color.primary.opacity(0.05))
                                )
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                    Text(license.isPro ? "Pro" : "Free")
                        .font(.system(size: 9, weight: .semibold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(license.isPro ? Color.orange.opacity(0.25) : Color.primary.opacity(0.08)))
                }
                .padding(.horizontal, 14)
                .padding(.top, 8)
            } else if !license.isPro {
                HStack {
                    Spacer()
                    Text("Free")
                        .font(.system(size: 9, weight: .semibold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.primary.opacity(0.08)))
                        .padding(.trailing, 14)
                        .padding(.top, 6)
                }
            }
        }
    }

    private var folderTabs: some View {
        HStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(store.visibleFolders.enumerated()), id: \.element.id) { index, folder in
                        Button {
                            store.selectFolder(id: folder.id)
                        } label: {
                            HStack(spacing: 4) {
                                if let img = AppIconService.folderTabImage(folder: folder, size: 12) {
                                    Image(nsImage: img).resizable().frame(width: 12, height: 12)
                                } else if let symbol = folder.symbolName {
                                    Image(systemName: symbol).font(.system(size: 10))
                                }
                                Text(folder.name)
                                    .font(.system(size: 12, weight: folder.id == store.selectedFolderID ? .semibold : .regular))
                                if folder.hotkey != .none {
                                    Text(folder.hotkey.displayName)
                                        .font(.system(size: 9))
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(
                                Capsule().fill(folder.id == store.selectedFolderID
                                               ? Color.accentColor.opacity(0.22)
                                               : Color.primary.opacity(0.06))
                            )
                        }
                        .buttonStyle(.plain)
                        .help(index < 9 ? "⌘\(index + 1)" : folder.name)
                        .contextMenu {
                            if !folder.isSmart {
                                Button("Rename…") { renameFolder(folder) }
                            }
                            if store.folders.filter({ !$0.isSmart }).count > 1 || folder.isSmart {
                                if !folder.isSmart || store.folders.count > 1 {
                                    Button("Remove Tab", role: .destructive) {
                                        store.deleteFolder(id: folder.id)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Menu {
                Button("New Folder…") { showingNewFolder = true }
                Button("Add Apps / Files…") { addFiles() }
                Button("Add URL…") { showingAddURL = true }
                Divider()
                Button("Grid view") {
                    if let id = currentFolder?.id { store.setFolderView(id: id, mode: .grid) }
                }
                Button("List view") {
                    if let id = currentFolder?.id { store.setFolderView(id: id, mode: .list) }
                }
            } label: {
                Image(systemName: "plus")
            }
            .menuStyle(.borderlessButton)
            .frame(width: 28)
            .help("Add")
        }
        .padding(.horizontal, 14)
        .padding(.top, store.workspaces.count > 1 ? 6 : 10)
        .padding(.bottom, 6)
    }

    private var searchBar: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
            TextField(searchGlobal ? "Search all folders" : "Search", text: $searchText)
                .textFieldStyle(.plain)
                .focused($searchFocused)
            Toggle(isOn: Binding(
                get: { searchGlobal },
                set: { new in
                    if new && !FeatureGate.canUseGlobalSearch {
                        promptUpgrade("Search across all folders is a Pro feature.")
                        searchGlobal = false
                    } else {
                        searchGlobal = new
                    }
                }
            )) {
                Text(FeatureGate.canUseGlobalSearch ? "All" : "All ✦")
                    .font(.caption2)
            }
            .toggleStyle(.button)
            .help(FeatureGate.canUseGlobalSearch ? "Search all folders (⌘G)" : "Pro: search all folders")
            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.primary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .padding(.horizontal, 14)
        .padding(.bottom, 8)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if searchGlobal && !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            globalResults
        } else if let folder = currentFolder {
            let items = folderItems
            if items.isEmpty {
                emptyState(folder: folder)
            } else if folder.viewMode == .list {
                listContent(items: items, folder: folder)
            } else {
                gridContent(items: items, folder: folder)
            }
        } else {
            emptyState(folder: nil)
        }
    }

    private func emptyState(folder: AppFolder?) -> some View {
        VStack(spacing: 12) {
            Image(systemName: emptySymbol(folder))
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(.secondary)
            Text(emptyTitle(folder))
                .font(.headline)
                .multilineTextAlignment(.center)
            Text(emptySubtitle(folder))
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 280)

            if folder?.isSmart != true {
                HStack(spacing: 10) {
                    Button("Add apps…") { addFiles() }
                        .buttonStyle(.borderedProminent)
                    Button("Add URL…") { showingAddURL = true }
                        .buttonStyle(.bordered)
                }
                .padding(.top, 4)
            } else if folder?.smartKind == .recents {
                Text("Open anything from your folders — it will show up here.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private func emptySymbol(_ folder: AppFolder?) -> String {
        switch folder?.smartKind {
        case .recents: return "clock"
        case .running: return "circle.dashed"
        default: return isTargeted ? "plus.circle.fill" : "square.dashed"
        }
    }

    private func emptyTitle(_ folder: AppFolder?) -> String {
        if isTargeted { return "Drop to add" }
        switch folder?.smartKind {
        case .recents: return "No recent launches yet"
        case .running: return "No apps running"
        default: return "This folder is empty"
        }
    }

    private func emptySubtitle(_ folder: AppFolder?) -> String {
        if isTargeted { return "Apps, files, and folders are welcome" }
        switch folder?.smartKind {
        case .recents: return "Items you open from SlaveDock appear here automatically"
        case .running: return "Regular apps you open will list here while they’re running"
        default: return "Drag items from Finder, or use + to add apps, files, folders, or URLs"
        }
    }

    private func gridContent(items: [DockItem], folder: AppFolder) -> some View {
        let canReorder = !folder.isSmart && !searchGlobal && searchText.isEmpty
        return ScrollViewReader { proxy in
            ScrollView {
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(items) { item in
                        ItemTile(
                            item: item,
                            iconSize: preferences.iconSize,
                            tileWidth: preferences.tileWidth,
                            isSelected: selectedItemID == item.id,
                            isRunning: preferences.showRunningIndicator && runningApps.isRunning(item),
                            canReorder: canReorder,
                            isDropTarget: dragSourceID != nil && dragSourceID != item.id && selectedItemID == item.id
                        ) {
                            open(item)
                        } onRemove: {
                            store.removeItem(id: item.id)
                        } onMoveLeft: {
                            _ = store.nudgeItem(id: item.id, by: -1, in: folder.id)
                        } onMoveRight: {
                            _ = store.nudgeItem(id: item.id, by: 1, in: folder.id)
                        }
                        .id(item.id)
                        .opacity(dragSourceID == item.id ? 0.45 : 1)
                        .onDrag {
                            dragSourceID = item.id
                            selectedItemID = item.id
                            return NSItemProvider(object: item.id.uuidString as NSString)
                        }
                        .onDrop(of: [.text, .plainText, .utf8PlainText], isTargeted: nil) { providers in
                            defer { dragSourceID = nil }
                            guard canReorder else { return false }
                            guard let provider = providers.first else { return false }
                            let typeID = provider.registeredTypeIdentifiers.first ?? UTType.plainText.identifier
                            provider.loadItem(forTypeIdentifier: typeID, options: nil) { data, _ in
                                let uuidString: String?
                                if let s = data as? String {
                                    uuidString = s
                                } else if let d = data as? Data {
                                    uuidString = String(data: d, encoding: .utf8)
                                } else if let s = data as? NSString {
                                    uuidString = s as String
                                } else {
                                    uuidString = nil
                                }
                                guard let uuidString,
                                      let fromID = UUID(uuidString: uuidString.trimmingCharacters(in: .whitespacesAndNewlines)),
                                      let toIndex = items.firstIndex(where: { $0.id == item.id }) else { return }
                                DispatchQueue.main.async {
                                    store.reorderItem(id: fromID, toIndex: toIndex, in: folder.id)
                                    selectedItemID = fromID
                                    dragSourceID = nil
                                }
                            }
                            return true
                        }
                    }
                }
                .padding(14)
            }
            .onChange(of: selectedItemID) {
                if let id = selectedItemID {
                    withAnimation(.easeOut(duration: 0.12)) { proxy.scrollTo(id, anchor: .center) }
                }
            }
        }
    }

    private func listContent(items: [DockItem], folder: AppFolder) -> some View {
        ScrollViewReader { proxy in
            List(selection: $selectedItemID) {
                ForEach(items) { item in
                    HStack(spacing: 10) {
                        Image(nsImage: AppIconService.icon(for: item, size: 28))
                            .resizable()
                            .frame(width: 28, height: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name)
                            Text(item.kind.label)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if preferences.showRunningIndicator && runningApps.isRunning(item) {
                            Circle().fill(Color.primary.opacity(0.7)).frame(width: 6, height: 6)
                        }
                    }
                    .tag(item.id)
                    .contentShape(Rectangle())
                    .onTapGesture { open(item) }
                    .contextMenu { itemContext(item) }
                }
                .onMove { source, dest in
                    store.moveItem(from: source, to: dest, in: folder.id)
                }
            }
            .listStyle(.plain)
            .onChange(of: selectedItemID) {
                if let id = selectedItemID {
                    proxy.scrollTo(id, anchor: .center)
                }
            }
        }
    }

    private var globalResults: some View {
        let hits = globalHits
        return Group {
            if hits.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 28, weight: .light))
                        .foregroundStyle(.secondary)
                    Text("No matches across folders")
                        .foregroundStyle(.secondary)
                    Text("Try a shorter name, or turn off All to search this folder only")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 260)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        ForEach(hits) { hit in
                            Button {
                                open(hit.item)
                            } label: {
                                HStack(spacing: 10) {
                                    Image(nsImage: AppIconService.icon(for: hit.item, size: 28))
                                        .resizable().frame(width: 28, height: 28)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(hit.item.name)
                                        Text(hit.folderName)
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                }
                                .padding(8)
                                .background(
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(selectedItemID == hit.item.id
                                              ? Color.accentColor.opacity(0.15) : .clear)
                                )
                            }
                            .buttonStyle(.plain)
                            .id(hit.item.id)
                        }
                    }
                    .padding(12)
                }
            }
        }
    }

    private var footer: some View {
        HStack {
            let count: Int = {
                if searchGlobal && !searchText.isEmpty { return globalHits.count }
                return folderItems.count
            }()
            Text("\(count) items")
                .font(.caption)
                .foregroundStyle(.secondary)
            if store.missingItemCount > 0 {
                Text("· \(store.missingItemCount) missing")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
            Spacer()
            if let folder = currentFolder, !folder.isSmart {
                Menu {
                    ForEach(FolderSortMode.allCases) { mode in
                        Button(mode.label) { store.setFolderSort(id: folder.id, mode: mode) }
                    }
                } label: {
                    Text(folder.sortMode.label)
                        .font(.caption)
                }
                .menuStyle(.borderlessButton)
            }
            if !license.isPro {
                Button("Pro") { onOpenSettings() }
                    .buttonStyle(.borderless)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .help("Upgrade to SlaveDock Pro")
            }
            Button {
                showingHelp = true
            } label: {
                Image(systemName: "questionmark.circle")
            }
            .buttonStyle(.borderless)
            .help("Keyboard help (⌘/)")
            Button("Settings…") { onOpenSettings() }
                .buttonStyle(.borderless)
                .font(.caption)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private func promptUpgrade(_ message: String) {
        UpgradePresenter.showLimitAlert(message: message) {
            onOpenSettings()
        }
    }

    private func applyAddResult(_ result: FolderStore.AddItemsResult) {
        if result.hitLimit {
            promptUpgrade(FeatureGate.itemLimitMessage(current: store.selectedFolder?.items.count ?? 0))
        }
    }

    // MARK: - Actions

    private func open(_ item: DockItem) {
        let ok = LaunchService.open(item)
        if ok {
            history.record(item)
            if preferences.closeAfterLaunch { onDismiss() }
        }
    }

    private func launchSelected() {
        if let id = selectedItemID {
            if searchGlobal, let hit = globalHits.first(where: { $0.item.id == id }) {
                open(hit.item)
                return
            }
            if let item = folderItems.first(where: { $0.id == id }) {
                open(item)
                return
            }
        }
        if searchGlobal, let first = globalHits.first {
            open(first.item)
        } else if let first = folderItems.first {
            open(first)
        }
    }

    private func refreshSelection() {
        let ids = selectableIDs
        if let selectedItemID, ids.contains(selectedItemID) { return }
        selectedItemID = ids.first
    }

    private func columnsEstimate() -> Int {
        max(1, Int(preferences.panelWidth / (preferences.tileWidth + 10)))
    }

    private func moveSelection(by delta: Int) {
        let ids = selectableIDs
        guard !ids.isEmpty else { return }
        if let id = selectedItemID, let idx = ids.firstIndex(of: id) {
            selectedItemID = ids[min(ids.count - 1, max(0, idx + delta))]
        } else {
            selectedItemID = ids.first
        }
    }

    private func addFiles() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = true
        panel.directoryURL = URL(fileURLWithPath: "/Applications")
        panel.prompt = "Add"
        panel.message = "Choose apps, files, or folders"
        if panel.runModal() == .OK {
            applyAddResult(store.addPaths(panel.urls.map(\.path)))
        }
    }

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        var handled = false
        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                handled = true
                provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                    let url: URL?
                    if let data = item as? Data {
                        url = URL(dataRepresentation: data, relativeTo: nil)
                    } else if let u = item as? URL {
                        url = u
                    } else { url = nil }
                    guard let url else { return }
                    Task { @MainActor in
                        applyAddResult(store.addPaths([url.path]))
                    }
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                handled = true
                provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                    if let url = item as? URL {
                        Task { @MainActor in applyAddResult(store.addURL(url.absoluteString)) }
                    }
                }
            }
        }
        return handled
    }

    private func renameFolder(_ folder: AppFolder) {
        let alert = NSAlert()
        alert.messageText = "Rename Folder"
        alert.addButton(withTitle: "Rename")
        alert.addButton(withTitle: "Cancel")
        let field = NSTextField(string: folder.name)
        field.frame = NSRect(x: 0, y: 0, width: 240, height: 24)
        alert.accessoryView = field
        if alert.runModal() == .alertFirstButtonReturn {
            store.renameFolder(id: folder.id, to: field.stringValue)
        }
    }

    @ViewBuilder
    private func itemContext(_ item: DockItem) -> some View {
        Button("Open") { open(item) }
        Button("Show in Finder") { LaunchService.reveal(item) }
        if !(currentFolder?.isSmart ?? true) {
            Divider()
            Button("Remove", role: .destructive) { store.removeItem(id: item.id) }
        }
    }
}

// MARK: - Tile

private struct ItemTile: View {
    let item: DockItem
    let iconSize: Double
    let tileWidth: CGFloat
    let isSelected: Bool
    let isRunning: Bool
    let canReorder: Bool
    var isDropTarget: Bool = false
    var onLaunch: () -> Void
    var onRemove: () -> Void
    var onMoveLeft: () -> Void = {}
    var onMoveRight: () -> Void = {}
    @State private var hovering = false

    var body: some View {
        Button(action: onLaunch) {
            VStack(spacing: 6) {
                ZStack(alignment: .bottom) {
                    Image(nsImage: AppIconService.icon(for: item, size: iconSize))
                        .resizable()
                        .interpolation(.high)
                        .frame(width: iconSize, height: iconSize)
                        .shadow(color: .black.opacity(0.12), radius: 3, y: 2)
                        .opacity(item.exists || item.kind == .url ? 1 : 0.4)
                    if isRunning {
                        Circle().fill(Color.primary.opacity(0.85)).frame(width: 6, height: 6).offset(y: 4)
                    }
                }
                Text(item.name)
                    .font(.system(size: 11))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(width: tileWidth - 8)
                    .foregroundStyle(item.exists || item.kind == .url ? .primary : .secondary)
            }
            .padding(6)
            .frame(width: tileWidth)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(isSelected ? Color.accentColor.opacity(0.18)
                          : (hovering ? Color.primary.opacity(0.08) : .clear))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(
                        isDropTarget ? Color.accentColor
                        : (isSelected ? Color.accentColor.opacity(0.5) : .clear),
                        lineWidth: isDropTarget ? 2 : 1
                    )
            )
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(canReorder ? "\(item.path)\nDrag to reorder · ⌥← ⌥→" : item.path)
        .contextMenu {
            Button("Open") { onLaunch() }
            Button("Show in Finder") { LaunchService.reveal(item) }
            if canReorder {
                Divider()
                Button("Move left") { onMoveLeft() }
                Button("Move right") { onMoveRight() }
            }
            Divider()
            Button("Remove", role: .destructive) { onRemove() }
        }
    }
}
