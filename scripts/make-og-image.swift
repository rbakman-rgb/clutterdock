#!/usr/bin/env swift
// Renders website/assets/og-card.png (1200x630) — the social share card.
// Re-run after rebranding or tagline changes: swift scripts/make-og-image.swift
import AppKit

let size = NSSize(width: 1200, height: 630)
let scriptDir = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
let root = scriptDir.deletingLastPathComponent()
let iconURL = root.appendingPathComponent("website/assets/icon-256.png")
let outURL = root.appendingPathComponent("website/assets/og-card.png")

guard let icon = NSImage(contentsOf: iconURL) else {
    fputs("Missing icon at \(iconURL.path)\n", stderr)
    exit(1)
}

let image = NSImage(size: size)
image.lockFocus()

// Background: site palette (#070a10 with a soft radial glow like the hero)
NSColor(calibratedRed: 0x07 / 255, green: 0x0A / 255, blue: 0x10 / 255, alpha: 1).setFill()
NSRect(origin: .zero, size: size).fill()

let glow = NSGradient(colors: [
    NSColor(calibratedRed: 0x6E / 255, green: 0xC0 / 255, blue: 0xFF / 255, alpha: 0.18),
    NSColor(calibratedRed: 0x6E / 255, green: 0xC0 / 255, blue: 0xFF / 255, alpha: 0.0),
])
glow?.draw(in: NSBezierPath(ovalIn: NSRect(x: 40, y: 90, width: 560, height: 560)),
           relativeCenterPosition: .zero)

// Icon on the left
let iconRect = NSRect(x: 110, y: (size.height - 300) / 2, width: 300, height: 300)
NSGraphicsContext.current?.imageInterpolation = .high
icon.draw(in: iconRect)

// Text block on the right
func draw(_ text: String, at point: NSPoint, size fontSize: CGFloat, weight: NSFont.Weight, color: NSColor, kern: CGFloat = 0) {
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: fontSize, weight: weight),
        .foregroundColor: color,
        .kern: kern,
    ]
    NSAttributedString(string: text, attributes: attrs).draw(at: point)
}

let text = NSColor(calibratedRed: 0xF3 / 255, green: 0xF6 / 255, blue: 0xFB / 255, alpha: 1)
let muted = NSColor(calibratedRed: 0x9A / 255, green: 0xA7 / 255, blue: 0xBB / 255, alpha: 1)
let accent = NSColor(calibratedRed: 0x6E / 255, green: 0xC0 / 255, blue: 0xFF / 255, alpha: 1)

draw("ClutterDock", at: NSPoint(x: 480, y: 350), size: 84, weight: .bold, color: text)
draw("Folders of apps, files & links —", at: NSPoint(x: 484, y: 280), size: 40, weight: .medium, color: muted)
draw("on your Mac Dock or Windows tray", at: NSPoint(x: 484, y: 228), size: 40, weight: .medium, color: muted)
draw("Free forever · Pro is a one-time unlock", at: NSPoint(x: 484, y: 140), size: 30, weight: .regular, color: accent)
draw("clutterdock.com", at: NSPoint(x: 484, y: 84), size: 26, weight: .semibold, color: muted)

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else {
    fputs("Failed to render PNG\n", stderr)
    exit(1)
}
try! png.write(to: outURL)
print("Wrote \(outURL.path) (\(png.count / 1024) KB)")
