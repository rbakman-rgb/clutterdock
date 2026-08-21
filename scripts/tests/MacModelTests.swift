import Foundation

// Model-level tests for the Mac app. Run with scripts/test-mac.sh — the compiled
// binary exits non-zero on the first failure.

var failures = 0

func check(_ condition: Bool, _ what: String) {
    if condition {
        print("  ok   \(what)")
    } else {
        print("  FAIL \(what)")
        failures += 1
    }
}

func tempDir() -> URL {
    let dir = FileManager.default.temporaryDirectory
        .appendingPathComponent("clutterdock-tests-\(UUID().uuidString)")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
}

@MainActor
func run() {
    print("DockItem")
    check(DockItem.fromURLString("example.com")?.path == "https://example.com",
          "bare domain gets https://")
    check(DockItem.fromURLString("https://example.com/x") != nil, "https accepted")
    check(DockItem.fromURLString("file:///Applications/Terminal.app") == nil, "file:// rejected")
    check(DockItem.fromURLString("smb://server/share") == nil, "smb:// rejected")
    check(DockItem.fromURLString("mailto:a@b.com") != nil, "mailto accepted")
    // Paths are symlink-resolved on init, so compare against the stored path
    let a = DockItem(kind: .app, path: "/Applications/Safari.app")
    check(a.dedupeKey == "app|\(a.path)", "dedupeKey is kind|path")
    let b = DockItem(kind: .file, path: "/Applications/Safari.app")
    check(a.dedupeKey != b.dedupeKey, "dedupeKey distinguishes kinds at the same path")

    print("DropImport.looksLikeURL")
    check(DropImport.looksLikeURL("https://x.dev"), "scheme URL")
    check(DropImport.looksLikeURL("example.com/path"), "bare domain with path")
    check(!DropImport.looksLikeURL("e.g."), "\"e.g.\" is not a URL")
    check(!DropImport.looksLikeURL("hello world."), "sentence is not a URL")

    print("UpdateService.isTrustedDownloadURL")
    check(UpdateService.isTrustedDownloadURL(URL(string: "https://github.com/x/y.zip")!),
          "https github.com trusted")
    check(UpdateService.isTrustedDownloadURL(URL(string: "https://objects.githubusercontent.com/a")!),
          "release asset host trusted")
    check(!UpdateService.isTrustedDownloadURL(URL(string: "http://github.com/x")!), "http rejected")
    check(!UpdateService.isTrustedDownloadURL(URL(string: "https://evil.example/x.zip")!),
          "other hosts rejected")

    print("UpdateService.isRemoteNewer")
    check(UpdateService.isRemoteNewer("v1.4.6", than: "1.4.5"), "patch bump is newer")
    check(!UpdateService.isRemoteNewer("v1.4.5", than: "1.4.5"), "same version is not newer")
    check(!UpdateService.isRemoteNewer("v1.3.0", than: "1.4.5"), "older is not newer")

    print("FolderStore persistence")
    let dir = tempDir()
    let store = FolderStore(directory: dir)
    check(store.folders.contains { $0.smartKind == .recents }, "default Recents exists")
    check(store.addFolder(named: "Coding", symbolName: "chevron.left.forwardslash.chevron.right"),
          "addFolder succeeds")
    let coding = store.folders.first { $0.name == "Coding" }!

    let file = dir.appendingPathComponent("thing.txt")
    try? "x".write(to: file, atomically: true, encoding: .utf8)
    check(store.addPaths([file.path], to: coding.id).added == 1, "addPaths adds a file")
    check(store.addPaths([file.path], to: coding.id).added == 0, "duplicate path is ignored")
    store.flushPendingSave()

    let reloaded = FolderStore(directory: dir)
    check(reloaded.folders.contains { $0.name == "Coding" }, "folders survive reload")
    check(reloaded.folders.first { $0.name == "Coding" }?.items.count == 1, "items survive reload")
    check(reloaded.dataRecoveryBackupURL == nil, "clean load reports no recovery backup")

    print("FolderStore free limits")
    for name in ["A", "B", "C", "D", "E", "F"] {
        _ = reloaded.addFolder(named: name, symbolName: "folder")
    }
    check(reloaded.folders.filter { !$0.isSmart }.count == 5, "free folder cap enforced")

    print("FolderStore smart-folder visibility")
    reloaded.setSmartFolderVisible(.running, false)
    reloaded.flushPendingSave()
    let afterHide = FolderStore(directory: dir)
    check(!afterHide.folders.contains { $0.smartKind == .running },
          "hidden smart folder stays hidden after relaunch")
    afterHide.setSmartFolderVisible(.running, true)
    check(afterHide.folders.contains { $0.smartKind == .running }, "smart folder can be restored")

    print("FolderStore corrupt-file recovery")
    let badDir = tempDir()
    try? "{not json".write(
        to: badDir.appendingPathComponent("folders.json"), atomically: true, encoding: .utf8)
    let recovered = FolderStore(directory: badDir)
    check(recovered.dataRecoveryBackupURL != nil, "corrupt file reported")
    check(
        FileManager.default.fileExists(
            atPath: badDir.appendingPathComponent("folders.json.corrupt.bak").path),
        "corrupt file preserved as .bak")
    check(!recovered.folders.isEmpty, "fresh defaults loaded after corruption")

    print("StackLock (password-protected stacks)")
    let secretItems = [
        DockItem(kind: .url, path: "https://client-a.example/portal", name: "Client A"),
        DockItem(kind: .url, path: "https://payroll.example", name: "Payroll"),
    ]
    do {
        let payload = try StackLock.lock(items: secretItems, password: "correct horse battery")
        check(payload.iter == StackLock.iterations, "uses the configured iteration count")
        check(!payload.ct.contains("client-a"), "ciphertext doesn't leak the plaintext")
        let out = try StackLock.unlock(payload, password: "correct horse battery")
        check(out == secretItems, "round-trips the exact items")

        var wrongRejected = false
        do { _ = try StackLock.unlock(payload, password: "wrong") } catch { wrongRejected = true }
        check(wrongRejected, "wrong password is rejected")

        // Tampering with the ciphertext must fail the GCM tag, not silently decode
        var tampered = payload
        var raw = Array(Data(base64Encoded: payload.ct)!)
        raw[0] ^= 0xFF
        tampered.ct = Data(raw).base64EncodedString()
        var tamperRejected = false
        do { _ = try StackLock.unlock(tampered, password: "correct horse battery") } catch {
            tamperRejected = true
        }
        check(tamperRejected, "tampered ciphertext is rejected")

        let resealed = try StackLock.relock(
            items: secretItems, existing: payload, password: "correct horse battery")
        check(resealed.salt == payload.salt, "relock keeps the salt so the password still works")
        check(try StackLock.unlock(resealed, password: "correct horse battery") == secretItems,
              "relocked payload still decrypts")
    } catch {
        check(false, "StackLock threw: \(error)")
    }

    print("FolderStore lock lifecycle")
    let lockDir = tempDir()
    let lockStore = FolderStore(directory: lockDir)
    _ = lockStore.addFolder(named: "Private", symbolName: "lock")
    let privateID = lockStore.folders.first { $0.name == "Private" }!.id
    let secretFile = lockDir.appendingPathComponent("secret-notes.txt")
    try? "x".write(to: secretFile, atomically: true, encoding: .utf8)
    _ = lockStore.addPaths([secretFile.path], to: privateID)
    check(lockStore.folders.first { $0.id == privateID }?.items.count == 1, "item added before lock")

    do {
        try lockStore.lockFolder(id: privateID, password: "hunter2")
        let locked = lockStore.folders.first { $0.id == privateID }!
        check(locked.items.isEmpty, "items cleared from memory when locked")
        check(locked.lock != nil, "lock payload stored")
        check(lockStore.isLocked(locked), "reports as locked")
        check(lockStore.searchAll(query: "secret-notes").isEmpty, "locked items excluded from search")

        // The on-disk file must not contain the plaintext path
        let onDisk = try String(contentsOf: lockDir.appendingPathComponent("folders.json"), encoding: .utf8)
        check(!onDisk.contains("secret-notes.txt"), "plaintext path absent from folders.json")

        let reopened = FolderStore(directory: lockDir)
        let stillLocked = reopened.folders.first { $0.id == privateID }!
        check(reopened.isLocked(stillLocked), "still locked after relaunch")
        check(try reopened.unlockFolder(id: privateID, password: "hunter2"), "unlocks with password")
        check(reopened.folders.first { $0.id == privateID }?.items.count == 1, "items restored")

        var badRejected = false
        reopened.relockFolder(id: privateID)
        do { _ = try reopened.unlockFolder(id: privateID, password: "nope") } catch { badRejected = true }
        check(badRejected, "wrong password can't unlock")
    } catch {
        check(false, "lock lifecycle threw: \(error)")
    }
    try? FileManager.default.removeItem(at: lockDir)

    print("LicenseManager")
    if let key = LicenseManager.generateKey(serial: "A1B2") {
        check(key.replacingOccurrences(of: "-", with: "").count == 17, "generated key is 17 chars")
        check(LicenseManager.validate(key), "generated key validates")
        check(LicenseManager.validate(key.lowercased()), "validation is case-insensitive")
        let tampered = String(key.dropLast()) + (key.hasSuffix("0") ? "1" : "0")
        check(!LicenseManager.validate(tampered), "tampered key rejected")
    } else {
        check(false, "generateKey returned nil")
    }
    check(!LicenseManager.validate(""), "empty key rejected")
    check(!LicenseManager.validate("SDPRO-A1B2-0000-000"), "wrong-length key rejected")

    print("LauncherPlacement")
    let full = CGRect(x: 0, y: 0, width: 1440, height: 900)
    let visibleBottomDock = CGRect(x: 0, y: 80, width: 1440, height: 820)
    let panel = CGSize(width: 440, height: 400)
    check(LauncherPlacement.dockEdge(visible: visibleBottomDock, full: full) == .bottom, "bottom Dock inferred")
    let atIcon = LauncherPlacement.origin(
        panelSize: panel,
        visibleFrame: visibleBottomDock,
        fullFrame: full,
        mode: .dock,
        showOrigin: .dock,
        mouse: CGPoint(x: 520, y: 40),
        statusItemFrame: nil,
        savedOrigin: nil,
        lastDockPoint: nil
    )
    check(abs(atIcon.x - (520 - 220)) < 1, "Dock click centers horizontally on the icon")
    check(abs(atIcon.y - (80 + 12)) < 1, "Dock click sits just above the Dock")

    let hotkey = LauncherPlacement.origin(
        panelSize: panel,
        visibleFrame: visibleBottomDock,
        fullFrame: full,
        mode: .dock,
        showOrigin: .hotkey,
        mouse: CGPoint(x: 900, y: 500),
        statusItemFrame: nil,
        savedOrigin: nil,
        lastDockPoint: CGPoint(x: 520, y: 40)
    )
    check(abs(hotkey.x - atIcon.x) < 1, "hotkey reuses last Dock icon x")
    check(abs(hotkey.y - atIcon.y) < 1, "hotkey reuses Dock edge")

    let saved = CGPoint(x: 200, y: 300)
    let custom = LauncherPlacement.origin(
        panelSize: panel,
        visibleFrame: visibleBottomDock,
        fullFrame: full,
        mode: .custom,
        showOrigin: .hotkey,
        mouse: CGPoint(x: 10, y: 10),
        statusItemFrame: nil,
        savedOrigin: saved,
        lastDockPoint: nil
    )
    check(abs(custom.x - 200) < 1 && abs(custom.y - 300) < 1, "custom mode restores saved origin")

    let status = CGRect(x: 1100, y: 870, width: 28, height: 24)
    let menuBar = LauncherPlacement.origin(
        panelSize: panel,
        visibleFrame: visibleBottomDock,
        fullFrame: full,
        mode: .dock,
        showOrigin: .menuBar,
        mouse: CGPoint(x: 1114, y: 882),
        statusItemFrame: status,
        savedOrigin: nil,
        lastDockPoint: nil
    )
    check(abs(menuBar.x - (status.midX - 220)) < 1, "menu bar click centers on the status item")
    check(menuBar.y + panel.height <= status.minY, "menu bar panel sits under the status item")

    let offscreen = LauncherPlacement.origin(
        panelSize: panel,
        visibleFrame: visibleBottomDock,
        fullFrame: full,
        mode: .custom,
        showOrigin: .other,
        mouse: .zero,
        statusItemFrame: nil,
        savedOrigin: CGPoint(x: -400, y: 5000),
        lastDockPoint: nil
    )
    check(offscreen.x >= visibleBottomDock.minX, "custom origin is clamped on screen")
    check(offscreen.y + panel.height <= visibleBottomDock.maxY + 1, "custom origin stays in visible frame")

    print("AppPreferences launcher anchor")
    let suite = UserDefaults(suiteName: "clutterdock-test-\(UUID().uuidString)")!
    let prefs = AppPreferences(defaults: suite)
    check(prefs.launcherAnchor == .dock, "default follow Dock")
    check(prefs.customOrigin == nil, "no saved spot yet")
    prefs.customOrigin = CGPoint(x: 12, y: 34)
    check(prefs.customOrigin?.x == 12 && prefs.customOrigin?.y == 34, "custom origin round-trips")
    prefs.launcherAnchor = .custom
    let prefs2 = AppPreferences(defaults: suite)
    check(prefs2.launcherAnchor == .custom, "anchor persists")
    check(prefs2.customOrigin?.x == 12, "custom origin persists")

    try? FileManager.default.removeItem(at: dir)
    try? FileManager.default.removeItem(at: badDir)
}

@main
enum TestRunner {
    static func main() {
        MainActor.assumeIsolated { run() }
        if failures > 0 {
            print("\n\(failures) test(s) failed")
            exit(1)
        }
        print("\nAll Mac model tests passed")
    }
}
