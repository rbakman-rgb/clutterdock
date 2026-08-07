#!/usr/bin/env swift
// Prints the on-screen window IDs owned by a given app, so screenshots can target
// exactly one window (`screencapture -l<id>`) instead of grabbing the whole desktop.
//   swift scripts/capture-window.swift ClutterDock
import CoreGraphics
import Foundation

let appName = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "ClutterDock"

guard let windows = CGWindowListCopyWindowInfo(
    [.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID
) as? [[String: Any]] else {
    fputs("Could not read the window list\n", stderr)
    exit(1)
}

var found = false
for w in windows {
    guard let owner = w[kCGWindowOwnerName as String] as? String, owner == appName,
          let id = w[kCGWindowNumber as String] as? Int else { continue }
    let bounds = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let width = bounds["Width"] as? Double ?? 0
    let height = bounds["Height"] as? Double ?? 0
    // Skip tiny helper windows (status item shadows, tooltips)
    guard width > 100, height > 100 else { continue }
    let title = w[kCGWindowName as String] as? String ?? ""
    print("\(id)\t\(Int(width))x\(Int(height))\t\(title)")
    found = true
}

if !found {
    fputs("No on-screen windows found for \"\(appName)\"\n", stderr)
    exit(2)
}
