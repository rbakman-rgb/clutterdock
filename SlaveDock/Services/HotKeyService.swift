import AppKit
import Carbon
import Foundation

/// Registers multiple global hotkeys via Carbon (no Accessibility permission).
final class HotKeyService {
    struct Binding {
        let id: UInt32
        let keyCode: UInt32
        let modifiers: UInt32
        let handler: () -> Void
    }

    private var hotKeyRefs: [UInt32: EventHotKeyRef] = [:]
    private var eventHandler: EventHandlerRef?
    private var handlers: [UInt32: () -> Void] = [:]
    private let signature: OSType = 0x534C5644 // 'SLVD'
    private var nextID: UInt32 = 1

    /// Replace all bindings.
    func setBindings(_ bindings: [(keyCode: UInt32, modifiers: UInt32, handler: () -> Void)]) {
        unregisterAll()
        installHandlerIfNeeded()
        for b in bindings {
            let id = nextID
            nextID += 1
            register(id: id, keyCode: b.keyCode, modifiers: b.modifiers, handler: b.handler)
        }
    }

    /// Convenience: main launcher + folder hotkeys
    func update(
        mainEnabled: Bool,
        mainPreset: HotkeyPreset,
        mainHandler: @escaping () -> Void,
        folderBindings: [(FolderHotkey, () -> Void)]
    ) {
        var list: [(UInt32, UInt32, () -> Void)] = []
        if mainEnabled {
            list.append((mainPreset.keyCode, carbonModifiers(for: mainPreset), mainHandler))
        }
        for (fk, handler) in folderBindings {
            guard let code = fk.keyCode else { continue }
            list.append((code, fk.carbonModifiers, handler))
        }
        setBindings(list.map { (keyCode: $0.0, modifiers: $0.1, handler: $0.2) })
    }

    func unregister() {
        unregisterAll()
    }

    private func unregisterAll() {
        for (_, ref) in hotKeyRefs {
            UnregisterEventHotKey(ref)
        }
        hotKeyRefs.removeAll()
        handlers.removeAll()
        if let eventHandler {
            RemoveEventHandler(eventHandler)
            self.eventHandler = nil
        }
    }

    private func carbonModifiers(for preset: HotkeyPreset) -> UInt32 {
        switch preset {
        case .commandShiftD, .commandShiftSpace:
            return UInt32(cmdKey | shiftKey)
        case .optionSpace:
            return UInt32(optionKey)
        case .controlCommandF:
            return UInt32(controlKey | cmdKey)
        }
    }

    private func installHandlerIfNeeded() {
        guard eventHandler == nil else { return }
        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        let userData = Unmanaged.passUnretained(self).toOpaque()
        let status = InstallEventHandler(
            GetApplicationEventTarget(),
            { (_, event, userData) -> OSStatus in
                guard let userData, let event else { return noErr }
                let service = Unmanaged<HotKeyService>.fromOpaque(userData).takeUnretainedValue()
                var hkID = EventHotKeyID()
                GetEventParameter(
                    event,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &hkID
                )
                if let handler = service.handlers[hkID.id] {
                    DispatchQueue.main.async { handler() }
                }
                return noErr
            },
            1,
            &eventType,
            userData,
            &eventHandler
        )
        if status != noErr {
            NSLog("SlaveDock: InstallEventHandler failed (\(status))")
        }
    }

    private func register(id: UInt32, keyCode: UInt32, modifiers: UInt32, handler: @escaping () -> Void) {
        handlers[id] = handler
        let hotKeyID = EventHotKeyID(signature: signature, id: id)
        var ref: EventHotKeyRef?
        let status = RegisterEventHotKey(
            keyCode,
            modifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &ref
        )
        if status == noErr, let ref {
            hotKeyRefs[id] = ref
        } else {
            NSLog("SlaveDock: RegisterEventHotKey failed id=\(id) status=\(status)")
            handlers[id] = nil
        }
    }
}
