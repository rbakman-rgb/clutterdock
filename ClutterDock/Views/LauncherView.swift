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
    @State private var dropTargetFolderID: UUID?
    @State private var showingStackEditor = false
    @State private var stackEditorMode: StackEditorSheet.Mode = .create
    @State private var showingAddURL = false
    @State private var urlDraft = ""
    @State private var searchText = ""
    @State private var searchGlobal = false
    @State private var selectedItemID: UUID?
    @State private var showingHelp = false
    @State private var dragSourceID: UUID?
    @State private var dropStatus: String?
    @ObservedObject private var license = LicenseManager.shared
    @FocusState private var searchFocused: Bool
    @Environment(\.colorScheme) private var colorScheme

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
        launcherChrome
            .frame(width: preferences.panelWidth, height: preferences.panelHeight)
            .background {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(.ultraThinMaterial)
            }
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(panelBorder)
            // Soft ambient shadow only — no system blue key-window ring
            .shadow(color: .black.opacity(colorScheme == .dark ? 0.45 : 0.22), radius: 32, y: 16)
            .compositingGroup()
            .onDrop(
                of: DropImport.allAcceptedTypes,
                isTargeted: $isTargeted,
                perform: { providers in handleDrop(providers, to: nil) }
            )
            .overlay(alignment: .top) {
                if let dropStatus {
                    Text(dropStatus)
                        .font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.top, 10)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .allowsHitTesting(false)
                }
            }
            .sheet(isPresented: $showingStackEditor) {
            StackEditorSheet(
                mode: stackEditorMode,
                onCancel: { showingStackEditor = false },
                onSave: { name, symbol in
                    switch stackEditorMode {
                    case .create:
                        if !store.addFolder(named: name, symbolName: symbol) {
                            promptUpgrade(FeatureGate.folderLimitMessage(current: store.normalFolderCount))
                        } else {
                            flashDropStatus("Created \(name)")
                        }
                    case .edit(let folder):
                        store.renameFolder(id: folder.id, to: name)
                        store.setFolderSymbol(id: folder.id, symbolName: symbol)
                        flashDropStatus("Updated \(name)")
                    }
                    showingStackEditor = false
                }
            )
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
                    Text("ClutterDock help").font(.title2.weight(.semibold))
                    Spacer()
                    Button("Done") { showingHelp = false }
                        .keyboardShortcut(.cancelAction)
                }
                KeyboardCheatSheet()
                Text("Tip: keep ClutterDock in the Dock, then click it or press your hotkey anytime.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(24)
            .frame(width: 420, height: 340)
        }
        .modifier(LauncherLifecycleModifier(
            onAppear: {
                searchGlobal = FeatureGate.canUseGlobalSearch && preferences.globalSearchDefault
                searchText = ""
                selectedItemID = selectableIDs.first
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { searchFocused = true }
            },
            onFolderChange: { refreshSelection() },
            onSearchChange: { refreshSelection() },
            onGlobalChange: { refreshSelection() },
            selectedFolderID: store.selectedFolderID,
            searchText: searchText,
            searchGlobal: searchGlobal
        ))
        .modifier(LauncherKeyHandler(
            onEscape: handleEscapeKey,
            onReturn: { launchSelected(); return .handled },
            onSpace: handleSpaceKey,
            onUp: { moveSelection(by: -columnsEstimate()); return .handled },
            onDown: { moveSelection(by: columnsEstimate()); return .handled },
            onLeft: { handleLeftRight(delta: -1) },
            onRight: { handleLeftRight(delta: 1) },
            onTab: handleTabKey,
            onCommandDigit: handleCommandDigit,
            onCommandG: handleCommandG,
            onHelp: { showHelpFromKeyboard() }
        ))
    }

    private func handleEscapeKey() -> KeyPress.Result {
        if !preferences.hasCompletedOnboarding {
            preferences.hasCompletedOnboarding = true
            return .handled
        }
        onDismiss()
        return .handled
    }

    private func handleSpaceKey() -> KeyPress.Result {
        // Never steal Space from the search field (Return launches while typing)
        if searchFocused { return .ignored }
        if searchText.isEmpty {
            launchSelected()
            return .handled
        }
        return .ignored
    }

    private func showHelpFromKeyboard() -> KeyPress.Result {
        // A bare "?" while typing in the search field is input, not a shortcut
        if searchFocused { return .ignored }
        showingHelp = true
        return .handled
    }

    private func handleTabKey(shift: Bool) -> KeyPress.Result {
        // When actively filtering, let Tab leave the field / default behavior
        if searchFocused && !searchText.isEmpty { return .ignored }
        let folders = store.visibleFolders
        guard !folders.isEmpty else { return .ignored }
        let delta = shift ? -1 : 1
        if let id = store.selectedFolderID,
           let idx = folders.firstIndex(where: { $0.id == id }) {
            let next = (idx + delta + folders.count) % folders.count
            store.selectFolder(id: folders[next].id)
        } else {
            store.selectFolder(id: folders[0].id)
        }
        searchFocused = false
        return .handled
    }

    private func handleCommandDigit(_ press: KeyPress) -> KeyPress.Result {
        guard press.modifiers.contains(.command),
              let ch = press.characters.first,
              let n = Int(String(ch)), n >= 1 else { return .ignored }
        store.selectFolder(at: n - 1)
        return .handled
    }

    private func handleCommandG(_ press: KeyPress) -> KeyPress.Result {
        guard press.modifiers.contains(.command) else { return .ignored }
        if FeatureGate.canUseGlobalSearch {
            searchGlobal.toggle()
        } else {
            promptUpgrade("Search across all folders is a Pro feature.")
        }
        return .handled
    }

    @ViewBuilder
    private var launcherChrome: some View {
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
    }

    @ViewBuilder
    private var panelBorder: some View {
        // Hairline glass edge only — never system/accent blue unless dropping files
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .strokeBorder(
                isTargeted
                    ? Color.accentColor.opacity(0.85)
                    : Color(nsColor: .separatorColor), // visible in light AND dark mode
                lineWidth: isTargeted ? 1.5 : 0.75
            )
            .animation(.easeOut(duration: 0.12), value: isTargeted)
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
        // While there's text in the search field, ←/→ must move the caret
        if searchFocused && !searchText.isEmpty { return .ignored }
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
            }
            // Free badge lives in the footer so the top stays clean
        }
    }

    private var folderTabs: some View {
        HStack(spacing: 8) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(Array(store.visibleFolders.enumerated()), id: \.element.id) { index, folder in
                            let selected = folder.id == store.selectedFolderID
                            let dropHighlight = dropTargetFolderID == folder.id
                            Button {
                                withAnimation(.easeOut(duration: 0.14)) {
                                    store.selectFolder(id: folder.id)
                                }
                            } label: {
                                HStack(spacing: 5) {
                                    if let img = AppIconService.folderTabImage(folder: folder, size: 13) {
                                        Image(nsImage: img).resizable().frame(width: 13, height: 13)
                                    } else if let symbol = folder.symbolName {
                                        Image(systemName: symbol).font(.system(size: 11, weight: .medium))
                                    }
                                    Text(folder.name)
                                        .font(.system(size: 12, weight: selected ? .semibold : .medium))
                                    if folder.hotkey != .none {
                                        Text(folder.hotkey.displayName)
                                            .font(.system(size: 9, weight: .medium))
                                            .foregroundStyle(.secondary)
                                    }
                                    if !folder.isSmart {
                                        Text("\(folder.items.count)")
                                            .font(.system(size: 9, weight: .semibold))
                                            .foregroundStyle(.tertiary)
                                            .padding(.horizontal, 5)
                                            .padding(.vertical, 1)
                                            .background(Capsule().fill(Color.primary.opacity(0.06)))
                                    }
                                }
                                .padding(.horizontal, 11)
                                .padding(.vertical, 6)
                                .background(
                                    Capsule()
                                        .fill(dropHighlight
                                              ? Color.accentColor.opacity(0.35)
                                              : (selected
                                                 ? Color.accentColor.opacity(0.22)
                                                 : Color.primary.opacity(0.05)))
                                )
                                .overlay(
                                    Capsule()
                                        .strokeBorder(
                                            dropHighlight
                                                ? Color.accentColor.opacity(0.9)
                                                : (selected ? Color.accentColor.opacity(0.35) : Color.clear),
                                            lineWidth: dropHighlight ? 1.5 : 1
                                        )
                                )
                            }
                            .buttonStyle(.plain)
                            .id(folder.id)
                            .help(
                                folder.isSmart
                                    ? "\(folder.name) (smart — drop targets normal stacks only)"
                                    : (index < 9
                                       ? "⌘\(index + 1) · Drop items here · Tab to cycle"
                                       : "Drop apps/files/URLs or stack items here")
                            )
                            .onDrop(
                                of: DropImport.allAcceptedTypes,
                                isTargeted: Binding(
                                    get: { dropTargetFolderID == folder.id },
                                    set: { dropTargetFolderID = $0 ? folder.id : (dropTargetFolderID == folder.id ? nil : dropTargetFolderID) }
                                ),
                                perform: { providers in handleDrop(providers, to: folder.id) }
                            )
                            .contextMenu {
                                if !folder.isSmart {
                                    Button("Customize…") {
                                        stackEditorMode = .edit(folder)
                                        showingStackEditor = true
                                    }
                                    Button("Rename…") { renameFolder(folder) }
                                }
                                if store.folders.filter({ !$0.isSmart }).count > 1 || folder.isSmart {
                                    if !folder.isSmart || store.folders.count > 1 {
                                        Button("Remove Stack", role: .destructive) {
                                            store.deleteFolder(id: folder.id)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                .onChange(of: store.selectedFolderID) {
                    if let id = store.selectedFolderID {
                        withAnimation(.easeOut(duration: 0.15)) {
                            proxy.scrollTo(id, anchor: .center)
                        }
                    }
                }
            }

            Menu {
                Button("New Stack…") {
                    stackEditorMode = .create
                    showingStackEditor = true
                }
                if let folder = currentFolder, !folder.isSmart {
                    Button("Customize “\(folder.name)”…") {
                        stackEditorMode = .edit(folder)
                        showingStackEditor = true
                    }
                }
                Divider()
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
                Image(systemName: "plus.circle.fill")
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(.secondary)
            }
            .menuStyle(.borderlessButton)
            .frame(width: 28)
            .help("New stack, add items, view")
            .accessibilityLabel("Add stack or items")
        }
        .padding(.horizontal, 14)
        .padding(.top, store.workspaces.count > 1 ? 6 : 10)
        .padding(.bottom, 6)
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
                .imageScale(.medium)
            TextField(searchGlobal ? "Search all stacks…" : "Search this stack…", text: $searchText)
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
                    .font(.caption.weight(.medium))
            }
            .toggleStyle(.button)
            .controlSize(.small)
            .help(FeatureGate.canUseGlobalSearch ? "Search all folders (⌘G)" : "Pro: search all folders")
            .accessibilityLabel(FeatureGate.canUseGlobalSearch ? "Search all folders" : "Search all folders (Pro feature)")
            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("Clear search")
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.primary.opacity(0.055))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
        )
        .padding(.horizontal, 14)
        .padding(.bottom, 8)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        ZStack {
            Group {
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

            if isTargeted {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(Color.accentColor.opacity(0.85), style: StrokeStyle(lineWidth: 2, dash: [7, 5]))
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color.accentColor.opacity(0.08))
                    )
                    .padding(10)
                    .overlay {
                        VStack(spacing: 6) {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 28, weight: .semibold))
                                .foregroundStyle(Color.accentColor)
                            Text(dropOverlayTitle)
                                .font(.subheadline.weight(.semibold))
                            Text(dropOverlaySubtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                        }
                        .padding(16)
                    }
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.12), value: isTargeted)
    }

    private var dropOverlayTitle: String {
        if let folder = currentFolder, folder.isSmart {
            return "Switch to a normal stack"
        }
        return "Drop to add"
    }

    private var dropOverlaySubtitle: String {
        if let folder = currentFolder, folder.isSmart {
            return "Recents and Running can’t hold drops — pick Apps or your own stack"
        }
        return "Apps · files · folders · URLs"
    }

    private func emptyState(folder: AppFolder?) -> some View {
        VStack(spacing: 14) {
            Image(systemName: emptySymbol(folder))
                .font(.system(size: 42, weight: .ultraLight))
                .foregroundStyle(.secondary)
                .symbolRenderingMode(.hierarchical)
            Text(emptyTitle(folder))
                .font(.headline)
                .multilineTextAlignment(.center)
            Text(emptySubtitle(folder))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 300)

            if folder?.isSmart != true {
                HStack(spacing: 10) {
                    Button {
                        addFiles()
                    } label: {
                        Label("Add apps…", systemImage: "plus.app")
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.regular)
                    Button("Add URL…") { showingAddURL = true }
                        .buttonStyle(.bordered)
                }
                .padding(.top, 6)
                Text("Tip: drag apps, files, or folders from Finder into this window")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .padding(.top, 2)
            } else if folder?.smartKind == .recents {
                Text("Open anything from your stacks — it will show up here.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                .foregroundStyle(isTargeted ? Color.accentColor.opacity(0.7) : Color.primary.opacity(0.08))
                .padding(16)
                .opacity(folder?.isSmart == true ? 0 : 1)
        )
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
        case .recents: return "Items you open from ClutterDock appear here automatically"
        case .running: return "Regular apps you open will list here while they’re running"
        default: return "Drag items from Finder, or use + for a new stack (Coding, Work…) and apps"
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
                            guard canReorder else {
                                return NSItemProvider()
                            }
                            dragSourceID = item.id
                            selectedItemID = item.id
                            return DropImport.itemProvider(for: item.id)
                        }
                        .onDrop(of: DropImport.allAcceptedTypes, isTargeted: nil) { providers in
                            // Prefer reorder when dropping an internal item; otherwise add files/URLs
                            Task { @MainActor in
                                let parsed = await DropImport.parse(providers)
                                if canReorder, let fromID = parsed.itemIDs.first,
                                   let toIndex = items.firstIndex(where: { $0.id == item.id }) {
                                    store.reorderItem(id: fromID, toIndex: toIndex, in: folder.id)
                                    selectedItemID = fromID
                                    dragSourceID = nil
                                    flashDropStatus("Reordered")
                                    return
                                }
                                dragSourceID = nil
                                _ = await applyParsedDrop(parsed, to: folder.id)
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
        let canReorder = !folder.isSmart && !searchGlobal && searchText.isEmpty
        return ScrollViewReader { proxy in
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
                    .onDrag {
                        guard canReorder else { return NSItemProvider() }
                        dragSourceID = item.id
                        return DropImport.itemProvider(for: item.id)
                    }
                    .onDrop(of: DropImport.allAcceptedTypes, isTargeted: nil) { providers in
                        Task { @MainActor in
                            let parsed = await DropImport.parse(providers)
                            if canReorder, let fromID = parsed.itemIDs.first,
                               let toIndex = items.firstIndex(where: { $0.id == item.id }) {
                                store.reorderItem(id: fromID, toIndex: toIndex, in: folder.id)
                                selectedItemID = fromID
                                dragSourceID = nil
                                flashDropStatus("Reordered")
                                return
                            }
                            dragSourceID = nil
                            _ = await applyParsedDrop(parsed, to: folder.id)
                        }
                        return true
                    }
                }
                .onMove { source, dest in
                    store.moveItem(from: source, to: dest, in: folder.id)
                }
            }
            .listStyle(.plain)
            .onDrop(of: DropImport.externalTypes, isTargeted: $isTargeted) { providers in
                handleDrop(providers, to: folder.id)
            }
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
        HStack(spacing: 10) {
            let count: Int = {
                if searchGlobal && !searchText.isEmpty { return globalHits.count }
                return folderItems.count
            }()
            Text("\(count) items")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
            if store.missingItemCount > 0 {
                Text("· \(store.missingItemCount) missing")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.orange)
            }
            if !license.isPro {
                Text("Free")
                    .font(.system(size: 9, weight: .semibold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color.primary.opacity(0.08)))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if let folder = currentFolder, !folder.isSmart {
                Menu {
                    ForEach(FolderSortMode.allCases) { mode in
                        Button(mode.label) { store.setFolderSort(id: folder.id, mode: mode) }
                    }
                } label: {
                    Text(folder.sortMode.label)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                .menuStyle(.borderlessButton)
            }
            if !license.isPro {
                Button("Pro") { onOpenSettings() }
                    .buttonStyle(.borderless)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.orange.opacity(0.9))
                    .help("Upgrade to ClutterDock Pro")
            }
            Button {
                showingHelp = true
            } label: {
                Image(systemName: "questionmark.circle")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.borderless)
            .help("Keyboard help (⌘/)")
            .accessibilityLabel("Keyboard help")
            Button("Settings") { onOpenSettings() }
                .buttonStyle(.borderless)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
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
        // Grid rows: panel width minus the 14pt padding on each side, tiles separated
        // by 10pt spacing → n·w + (n-1)·10 ≤ available  ⇔  n ≤ (available+10)/(w+10)
        let available = preferences.panelWidth - 28
        return max(1, Int((available + 10) / (preferences.tileWidth + 10)))
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

    @discardableResult
    private func handleDrop(_ providers: [NSItemProvider], to folderID: UUID?) -> Bool {
        guard !providers.isEmpty else { return false }
        Task { @MainActor in
            let parsed = await DropImport.parse(providers)
            _ = await applyParsedDrop(parsed, to: folderID)
            dragSourceID = nil
        }
        return true
    }

    @MainActor
    @discardableResult
    private func applyParsedDrop(_ parsed: DropImport.ParsedDrop, to folderID: UUID?) async -> Bool {
        // Relocate existing stack items (drag onto another tab)
        if !parsed.itemIDs.isEmpty {
            let targetID = folderID ?? store.selectedFolderID
            guard let targetID,
                  let target = store.folders.first(where: { $0.id == targetID }),
                  !target.isSmart else {
                flashDropStatus("Drop on a normal stack tab")
                return false
            }
            var moved = 0
            var hitLimit = false
            for id in parsed.itemIDs {
                if store.folderID(containingItem: id) == targetID {
                    // Same folder — ignore as a no-op move (reorder handled on tiles)
                    continue
                }
                if store.relocateItem(id: id, toFolder: targetID) {
                    moved += 1
                    selectedItemID = id
                } else if !FeatureGate.canAddItem(currentCount: target.items.count) {
                    hitLimit = true
                }
            }
            if moved > 0 {
                store.selectFolder(id: targetID)
                flashDropStatus(moved == 1 ? "Moved to \(target.name)" : "Moved \(moved) items")
                return true
            }
            if hitLimit {
                promptUpgrade(FeatureGate.itemLimitMessage(current: target.items.count))
                return false
            }
            if parsed.paths.isEmpty && parsed.urlStrings.isEmpty {
                flashDropStatus("Couldn’t move item")
                return false
            }
        }

        let targetID = resolvedDropFolderID(folderID)
        guard let targetID,
              let target = store.folders.first(where: { $0.id == targetID }),
              !target.isSmart else {
            flashDropStatus("Switch to a normal stack to drop")
            return false
        }

        var totalAdded = 0
        var hitLimit = false

        if !parsed.paths.isEmpty {
            let r = store.addPaths(parsed.paths, to: targetID)
            totalAdded += r.added
            hitLimit = hitLimit || r.hitLimit
        }
        for urlString in parsed.urlStrings {
            let r = store.addURL(urlString, to: targetID)
            totalAdded += r.added
            hitLimit = hitLimit || r.hitLimit
        }

        if hitLimit {
            promptUpgrade(FeatureGate.itemLimitMessage(current: store.folders.first(where: { $0.id == targetID })?.items.count ?? 0))
        }
        if totalAdded > 0 {
            store.selectFolder(id: targetID)
            flashDropStatus(totalAdded == 1 ? "Added to \(target.name)" : "Added \(totalAdded) items")
            return true
        }
        if !hitLimit {
            flashDropStatus("Nothing new to add")
        }
        return totalAdded > 0
    }

    private func resolvedDropFolderID(_ preferred: UUID?) -> UUID? {
        if let preferred,
           let f = store.folders.first(where: { $0.id == preferred }),
           !f.isSmart {
            return preferred
        }
        if let selected = store.selectedFolder, !selected.isSmart {
            return selected.id
        }
        return store.folders.first(where: { !$0.isSmart })?.id
    }

    private func flashDropStatus(_ message: String) {
        withAnimation(.easeOut(duration: 0.15)) { dropStatus = message }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_600_000_000)
            if dropStatus == message {
                withAnimation(.easeIn(duration: 0.2)) { dropStatus = nil }
            }
        }
    }

    private func renameFolder(_ folder: AppFolder) {
        let alert = NSAlert()
        alert.messageText = "Rename Stack"
        alert.informativeText = "e.g. Coding, Design, Work — each stack is its own dock of apps and files."
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

// MARK: - Key / lifecycle helpers (split for compiler performance)

private struct LauncherLifecycleModifier: ViewModifier {
    var onAppear: () -> Void
    var onFolderChange: () -> Void
    var onSearchChange: () -> Void
    var onGlobalChange: () -> Void
    var selectedFolderID: UUID?
    var searchText: String
    var searchGlobal: Bool

    func body(content: Content) -> some View {
        content
            .onAppear(perform: onAppear)
            .onChange(of: selectedFolderID) { onFolderChange() }
            .onChange(of: searchText) { onSearchChange() }
            .onChange(of: searchGlobal) { onGlobalChange() }
    }
}

private struct LauncherKeyHandler: ViewModifier {
    var onEscape: () -> KeyPress.Result
    var onReturn: () -> KeyPress.Result
    var onSpace: () -> KeyPress.Result
    var onUp: () -> KeyPress.Result
    var onDown: () -> KeyPress.Result
    var onLeft: () -> KeyPress.Result
    var onRight: () -> KeyPress.Result
    var onTab: (Bool) -> KeyPress.Result
    var onCommandDigit: (KeyPress) -> KeyPress.Result
    var onCommandG: (KeyPress) -> KeyPress.Result
    var onHelp: () -> KeyPress.Result

    func body(content: Content) -> some View {
        content
            .focusable()
            .onKeyPress(.escape, action: onEscape)
            .onKeyPress(.return, action: onReturn)
            .onKeyPress(.space, action: onSpace)
            .onKeyPress(.upArrow, action: onUp)
            .onKeyPress(.downArrow, action: onDown)
            .onKeyPress(.leftArrow, action: onLeft)
            .onKeyPress(.rightArrow, action: onRight)
            .onKeyPress(.tab) {
                onTab(NSEvent.modifierFlags.contains(.shift))
            }
            .onKeyPress(characters: CharacterSet(charactersIn: "123456789")) { press in
                onCommandDigit(press)
            }
            .onKeyPress(characters: CharacterSet(charactersIn: "gG")) { press in
                onCommandG(press)
            }
            .onKeyPress(characters: CharacterSet(charactersIn: "?")) { _ in
                onHelp()
            }
            .onKeyPress(characters: CharacterSet(charactersIn: "/")) { press in
                guard press.modifiers.contains(.command) else { return .ignored }
                return onHelp()
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

    // Running/missing are otherwise conveyed only visually (capsule, dimmed icon)
    private func accessibilityDescription(missing: Bool) -> String {
        var parts = [item.name, item.kind.label]
        if isRunning { parts.append("running") }
        if missing { parts.append("missing") }
        return parts.joined(separator: ", ")
    }

    var body: some View {
        // One stat() per render — item.exists hits the filesystem
        let missing = !item.exists && item.kind != .url
        return Button(action: onLaunch) {
            VStack(spacing: 7) {
                ZStack(alignment: .bottom) {
                    Image(nsImage: AppIconService.icon(for: item, size: iconSize))
                        .resizable()
                        .interpolation(.high)
                        .frame(width: iconSize, height: iconSize)
                        .shadow(color: .black.opacity(hovering || isSelected ? 0.22 : 0.12), radius: hovering ? 6 : 3, y: 2)
                        .scaleEffect(hovering ? 1.04 : 1.0)
                        .opacity(missing ? 0.4 : 1)
                        .animation(.easeOut(duration: 0.12), value: hovering)
                    if isRunning {
                        Capsule()
                            .fill(Color.accentColor)
                            .frame(width: 10, height: 3)
                            .offset(y: 5)
                            .shadow(color: Color.accentColor.opacity(0.5), radius: 2, y: 0)
                    }
                }
                Text(item.name)
                    .font(.system(size: 11, weight: isSelected ? .medium : .regular))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(width: tileWidth - 8)
                    .foregroundStyle(missing ? .secondary : .primary)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 8)
            .frame(width: tileWidth)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(
                        isSelected
                            ? Color.primary.opacity(0.10)
                            : (hovering ? Color.primary.opacity(0.06) : .clear)
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(
                        isDropTarget
                            ? Color.accentColor.opacity(0.9)
                            : (isSelected ? Color.primary.opacity(0.18) : .clear),
                        lineWidth: isDropTarget ? 1.5 : 1
                    )
            )
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(canReorder ? "\(item.name)\n\(item.path)\nDrag to reorder · ⌥← ⌥→ · Space/Return to open" : "\(item.name)\n\(item.path)")
        .accessibilityLabel(accessibilityDescription(missing: missing))
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
