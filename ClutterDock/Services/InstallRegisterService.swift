import Foundation

/// Optional, opt-in "count this install" ping — RON-507.
/// Sends at most four fields: platform, app version, the random install UUID,
/// and an email the user typed themselves. Never stacks, paths, or machine
/// info. Nothing is ever sent unless the user explicitly opts in.
enum InstallRegisterService {
    static let endpoint = URL(string: "https://clutterdock.com/api/register")!

    /// Pure so tests can prove exactly which fields leave the machine.
    static func payload(email: String?, os: String, appVersion: String, installId: String) -> [String: String] {
        var fields = ["os": os, "appVersion": appVersion, "installId": installId]
        let trimmed = email?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmed.isEmpty { fields["email"] = trimmed }
        return fields
    }

    static func register(email: String?, installId: String, completion: @escaping (Bool) -> Void) {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
        let fields = payload(email: email, os: "mac", appVersion: version, installId: installId)
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15
        request.httpBody = try? JSONSerialization.data(withJSONObject: fields)
        URLSession.shared.dataTask(with: request) { _, response, error in
            let ok = error == nil
                && ((response as? HTTPURLResponse).map { (200...299).contains($0.statusCode) } ?? false)
            DispatchQueue.main.async { completion(ok) }
        }.resume()
    }
}
