import Foundation

// Cross-platform check helper for password-protected stacks.
//   InteropLock encrypt <password>            -> prints the lock payload as JSON
//   InteropLock decrypt <password> <payload>  -> prints the decrypted items as JSON
// Paired with windows/scripts/interop-lock.js so both implementations must agree.

let fixtureItems = [
    DockItem(kind: .url, path: "https://example.com/one", name: "One"),
    DockItem(kind: .url, path: "https://example.com/two", name: "Two"),
]

@main
enum InteropLock {
    static func main() {
        let args = Array(CommandLine.arguments.dropFirst())
        guard args.count >= 2 else {
            fputs("usage: InteropLock encrypt|decrypt <password> [payload]\n", stderr)
            exit(2)
        }
        let mode = args[0]
        let password = args[1]

        do {
            switch mode {
            case "encrypt":
                let lock = try StackLock.lock(items: fixtureItems, password: password)
                let data = try JSONEncoder().encode(lock)
                print(String(data: data, encoding: .utf8)!)

            case "decrypt":
                guard args.count >= 3, let raw = args[2].data(using: .utf8) else {
                    fputs("missing payload\n", stderr)
                    exit(2)
                }
                let lock = try JSONDecoder().decode(FolderLock.self, from: raw)
                let items = try StackLock.unlock(lock, password: password)
                // Compare on the fields both platforms share (ids are regenerated)
                let simple = items.map { ["kind": $0.kind.rawValue, "path": $0.path, "name": $0.name] }
                let out = try JSONSerialization.data(
                    withJSONObject: simple, options: [.sortedKeys, .withoutEscapingSlashes])
                print(String(data: out, encoding: .utf8)!)

            default:
                fputs("unknown mode \(mode)\n", stderr)
                exit(2)
            }
        } catch {
            fputs("error: \(error)\n", stderr)
            exit(1)
        }
    }
}
