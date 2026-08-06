#!/usr/bin/env swift
import AppKit

// Generates a simple folder+grid icon for ClutterDock
let sizes: [Int] = [16, 32, 64, 128, 256, 512, 1024]
let outDir = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : FileManager.default.currentDirectoryPath + "/icon.iconset"

try? FileManager.default.removeItem(atPath: outDir)
try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

func drawIcon(size: CGFloat) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()

    let rect = NSRect(x: 0, y: 0, width: size, height: size)
    let radius = size * 0.22

    // Background gradient
    let path = NSBezierPath(roundedRect: rect.insetBy(dx: size * 0.04, dy: size * 0.04), xRadius: radius, yRadius: radius)
    let gradient = NSGradient(colors: [
        NSColor(calibratedRed: 0.25, green: 0.48, blue: 0.96, alpha: 1),
        NSColor(calibratedRed: 0.14, green: 0.28, blue: 0.78, alpha: 1)
    ])!
    gradient.draw(in: path, angle: -90)

    // Inner plate
    let inset = size * 0.18
    let plate = NSRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
    let platePath = NSBezierPath(roundedRect: plate, xRadius: size * 0.1, yRadius: size * 0.1)
    NSColor.white.withAlphaComponent(0.92).setFill()
    platePath.fill()

    // 2x2 grid of app squares
    let gap = size * 0.05
    let cell = (plate.width - gap * 3) / 2
    let colors: [NSColor] = [
        NSColor(calibratedRed: 1.0, green: 0.42, blue: 0.38, alpha: 1),
        NSColor(calibratedRed: 0.35, green: 0.78, blue: 0.55, alpha: 1),
        NSColor(calibratedRed: 1.0, green: 0.72, blue: 0.28, alpha: 1),
        NSColor(calibratedRed: 0.45, green: 0.55, blue: 0.98, alpha: 1)
    ]
    var i = 0
    for row in 0..<2 {
        for col in 0..<2 {
            let x = plate.minX + gap + CGFloat(col) * (cell + gap)
            let y = plate.maxY - gap - cell - CGFloat(row) * (cell + gap)
            let cellRect = NSRect(x: x, y: y, width: cell, height: cell)
            let cellPath = NSBezierPath(roundedRect: cellRect, xRadius: cell * 0.22, yRadius: cell * 0.22)
            colors[i].setFill()
            cellPath.fill()
            i += 1
        }
    }

    image.unlockFocus()
    return image
}

func savePNG(_ image: NSImage, path: String) {
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else { return }
    try? png.write(to: URL(fileURLWithPath: path))
}

for size in sizes {
    let img = drawIcon(size: CGFloat(size))
    savePNG(img, path: "\(outDir)/icon_\(size)x\(size).png")
    if size <= 512 {
        let img2 = drawIcon(size: CGFloat(size * 2))
        savePNG(img2, path: "\(outDir)/icon_\(size)x\(size)@2x.png")
    }
}

// iconutil expects specific names
let rename: [(String, String)] = [
    ("icon_16x16.png", "icon_16x16.png"),
    ("icon_16x16@2x.png", "icon_32x32.png"), // will also write proper @2x
    ("icon_32x32.png", "icon_32x32.png"),
    ("icon_32x32@2x.png", "icon_32x32@2x.png"),
    ("icon_128x128.png", "icon_128x128.png"),
    ("icon_128x128@2x.png", "icon_128x128@2x.png"),
    ("icon_256x256.png", "icon_256x256.png"),
    ("icon_256x256@2x.png", "icon_256x256@2x.png"),
    ("icon_512x512.png", "icon_512x512.png"),
    ("icon_512x512@2x.png", "icon_512x512@2x.png"),
]

// Rebuild iconset with Apple naming
let iconset = (outDir as NSString).deletingLastPathComponent + "/AppIcon.iconset"
try? FileManager.default.removeItem(atPath: iconset)
try FileManager.default.createDirectory(atPath: iconset, withIntermediateDirectories: true)

func copy(_ from: String, _ to: String) {
    let src = "\(outDir)/\(from)"
    let dst = "\(iconset)/\(to)"
    if FileManager.default.fileExists(atPath: src) {
        try? FileManager.default.copyItem(atPath: src, toPath: dst)
    }
}

copy("icon_16x16.png", "icon_16x16.png")
copy("icon_32x32.png", "icon_16x16@2x.png")
copy("icon_32x32.png", "icon_32x32.png")
copy("icon_64x64.png", "icon_32x32@2x.png")
copy("icon_128x128.png", "icon_128x128.png")
copy("icon_256x256.png", "icon_128x128@2x.png")
copy("icon_256x256.png", "icon_256x256.png")
copy("icon_512x512.png", "icon_256x256@2x.png")
copy("icon_512x512.png", "icon_512x512.png")
copy("icon_1024x1024.png", "icon_512x512@2x.png")

print("Iconset written to \(iconset)")
