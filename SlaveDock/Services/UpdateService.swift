import Foundation
import AppKit

/// Checks GitHub Releases for a newer version and offers download.
/// Full Sparkle in-app replace can layer on later after Developer ID notarization.
@MainActor
enum UpdateService {
    static let githubOwner = "rbakman-rgb"
    static let githubRepo = "slavedock"
    static let releasesURL = URL(string: "https://github.com/\(githubOwner)/\(githubRepo)/releases/latest")!
    static let apiLatestURL = URL(string: "https://api.github.com/repos/\(githubOwner)/\(githubRepo)/releases/latest")!

    struct ReleaseInfo {
        let tagName: String
        let version: String
        let htmlURL: URL
        let notes: String?
        let macAssetURL: URL?
    }

    enum CheckResult {
        case upToDate(current: String)
        case updateAvailable(ReleaseInfo)
        case failed(String)
    }

    static var currentVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    static var currentBuild: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
    }

    /// Semantic-ish compare: "1.3.0" vs "v1.4.0"
    static func isRemoteNewer(_ remoteTag: String, than local: String) -> Bool {
        let r = parseVersion(remoteTag)
        let l = parseVersion(local)
        for i in 0..<max(r.count, l.count) {
            let rv = i < r.count ? r[i] : 0
            let lv = i < l.count ? l[i] : 0
            if rv != lv { return rv > lv }
        }
        return false
    }

    private static func parseVersion(_ raw: String) -> [Int] {
        let cleaned = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "^v", with: "", options: .regularExpression)
        let core = cleaned.split(separator: "-").first.map(String.init) ?? cleaned
        return core.split(separator: ".").compactMap { Int($0.filter(\.isNumber)) }
    }

    static func check(completion: @escaping (CheckResult) -> Void) {
        var request = URLRequest(url: apiLatestURL)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("SlaveDock/\(currentVersion)", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 15

        URLSession.shared.dataTask(with: request) { data, response, error in
            Task { @MainActor in
                if let error {
                    completion(.failed(error.localizedDescription))
                    return
                }
                guard let data,
                      let http = response as? HTTPURLResponse,
                      (200...299).contains(http.statusCode) else {
                    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                    completion(.failed("Couldn’t reach update server (HTTP \(code))."))
                    return
                }

                guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let tag = json["tag_name"] as? String else {
                    completion(.failed("Unexpected response from GitHub."))
                    return
                }

                let html = (json["html_url"] as? String).flatMap(URL.init(string:)) ?? releasesURL
                let body = json["body"] as? String
                var macURL: URL?
                if let assets = json["assets"] as? [[String: Any]] {
                    for asset in assets {
                        guard let name = asset["name"] as? String,
                              name.lowercased().contains("mac"),
                              name.lowercased().hasSuffix(".zip"),
                              let urlStr = asset["browser_download_url"] as? String,
                              let url = URL(string: urlStr) else { continue }
                        macURL = url
                        break
                    }
                }

                let info = ReleaseInfo(
                    tagName: tag,
                    version: tag,
                    htmlURL: html,
                    notes: body,
                    macAssetURL: macURL
                )

                if isRemoteNewer(tag, than: currentVersion) {
                    completion(.updateAvailable(info))
                } else {
                    completion(.upToDate(current: currentVersion))
                }
            }
        }.resume()
    }

    /// User-facing check (alerts).
    static func checkAndPrompt(interactive: Bool) {
        check { result in
            switch result {
            case .upToDate(let current):
                guard interactive else { return }
                let alert = NSAlert()
                alert.messageText = "You’re up to date"
                alert.informativeText = "SlaveDock \(current) is the latest release."
                alert.alertStyle = .informational
                alert.addButton(withTitle: "OK")
                alert.runModal()

            case .updateAvailable(let info):
                let alert = NSAlert()
                alert.messageText = "Update available"
                alert.informativeText = """
                SlaveDock \(info.tagName) is ready (you have \(currentVersion)).

                Download the new build, replace the app in Applications, and reopen SlaveDock.
                Your folders and Pro license stay on this Mac.
                """
                alert.alertStyle = .informational
                alert.addButton(withTitle: "Download Update")
                alert.addButton(withTitle: "Later")
                let response = alert.runModal()
                if response == .alertFirstButtonReturn {
                    if let asset = info.macAssetURL {
                        NSWorkspace.shared.open(asset)
                    } else {
                        NSWorkspace.shared.open(info.htmlURL)
                    }
                }

            case .failed(let message):
                guard interactive else { return }
                let alert = NSAlert()
                alert.messageText = "Couldn’t check for updates"
                alert.informativeText = message
                alert.alertStyle = .warning
                alert.addButton(withTitle: "OK")
                alert.addButton(withTitle: "Open Releases")
                if alert.runModal() == .alertSecondButtonReturn {
                    NSWorkspace.shared.open(releasesURL)
                }
            }
        }
    }
}
