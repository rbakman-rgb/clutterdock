import SwiftUI

@main
struct SlaveDockApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            SettingsView(
                store: appDelegate.store,
                preferences: appDelegate.preferences,
                history: appDelegate.history
            )
            .frame(minWidth: 640, minHeight: 480)
        }
    }
}
