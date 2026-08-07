import AppKit

/// Secure password entry for locking / unlocking a stack.
///
/// Uses NSAlert + NSSecureTextField rather than a SwiftUI sheet so the field is
/// a real secure input (no plaintext in the view hierarchy, no autofill leaks),
/// and so it works from menus and the panel alike.
enum PasswordPrompt {
    /// Asks for an existing password. Returns nil if the user cancels.
    @MainActor
    static func ask(stackName: String) -> String? {
        let alert = NSAlert()
        alert.messageText = "Unlock “\(stackName)”"
        alert.informativeText = "Enter the password for this stack."
        alert.addButton(withTitle: "Unlock")
        alert.addButton(withTitle: "Cancel")

        let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.placeholderString = "Password"
        alert.accessoryView = field
        alert.window.initialFirstResponder = field

        guard alert.runModal() == .alertFirstButtonReturn else { return nil }
        let value = field.stringValue
        return value.isEmpty ? nil : value
    }

    /// Asks for a new password twice and warns that it can't be recovered.
    @MainActor
    static func askNew(stackName: String) -> String? {
        let alert = NSAlert()
        alert.messageText = "Lock “\(stackName)”"
        alert.informativeText = """
        This stack’s items will be encrypted on this Mac and hidden until you enter this password.

        There is no way to recover the contents if you forget it.
        """
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Lock")
        alert.addButton(withTitle: "Cancel")

        let container = NSView(frame: NSRect(x: 0, y: 0, width: 260, height: 56))
        let password = NSSecureTextField(frame: NSRect(x: 0, y: 30, width: 260, height: 24))
        password.placeholderString = "Password"
        let confirm = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        confirm.placeholderString = "Confirm password"
        container.addSubview(password)
        container.addSubview(confirm)
        alert.accessoryView = container
        alert.window.initialFirstResponder = password

        guard alert.runModal() == .alertFirstButtonReturn else { return nil }

        let value = password.stringValue
        guard !value.isEmpty else {
            report("Enter a password.")
            return nil
        }
        guard value == confirm.stringValue else {
            report("Those passwords didn’t match.")
            return nil
        }
        return value
    }

    @MainActor
    private static func report(_ message: String) {
        let alert = NSAlert()
        alert.messageText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }
}
