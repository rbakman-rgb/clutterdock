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
