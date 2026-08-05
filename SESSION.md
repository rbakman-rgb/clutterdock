# SlaveDock — Session save

**Saved:** 2026-08-05  
**Status:** **Mac 1.3.0 / Windows 1.1.0 Free+Pro** — entitlements, license keys, `docs/PRICING.md`. GitHub: `rbakman-rgb/slavedock`.

---

## Where everything lives

| Role | Path |
|------|------|
| Source project | `/Users/ronald/Developer/SlaveDock` |
| **Mac** app sources | `/Users/ronald/Developer/SlaveDock/SlaveDock/` |
| **Windows** app | `/Users/ronald/Developer/SlaveDock/windows/` |
| Mac build output | `/Users/ronald/Developer/SlaveDock/build/SlaveDock.app` |
| Mac installed | `/Applications/SlaveDock.app` |
| Mac config | `~/Library/Application Support/SlaveDock/folders.json` |
| Windows config | `%APPDATA%/slavedock/SlaveDock/` (Electron userData) |
| Windows dev | `cd windows && npm install && npm start` |
| Windows package | `cd windows && npm run dist` **(on Windows)** |

---

## Product decisions (locked in)

- **Name:** SlaveDock (was briefly DockFolder)
- **Price:** Free forever
- **Tips:** [Buy Me a Coffee](https://buymeacoffee.com/chidichidovsky)
- **Icon:** User-provided light blue “hanging apps” image → `SlaveDock/Resources/AppIcon.icns`
- **Stability rule:** No Dock replacement, no private Dock APIs, Carbon hotkeys (no Accessibility for main hotkey)
- **Min OS:** macOS 14+ / Windows 10+
- **Windows:** Electron tray app (not a full native WinUI port yet)

---

## Windows (v1.0 Electron)

- Tray icon, Ctrl+Shift+D, folders, Recents, apps/files/URLs
- Search All, grid/list, reorder, packs, onboarding, Buy Me a Coffee
- Package with `npm run dist` on a Windows machine → `windows/dist/`

---

## What’s shipped (Mac v1.2.1)

### UX (1.2.1)
- First-run **welcome tips** card (Settings → “Show welcome tips again”)
- **Keyboard hints** strip + **?** / **⌘/** help sheet
- **⌥← / ⌥→** reorder + context menu Move left/right + improved drag
- Richer **empty states** with Add apps / Add URL buttons
- About tab keyboard cheat sheet

### Core
- Dock icon + optional menu bar + global hotkey (default ⌘⇧D)
- Multi-folder launcher panel (grid/list)
- Settings window (Folders, Workspaces, General, Backup, About)

### Feature-rich pack
- Items: **apps, files, folders, URLs**
- Search in folder + **global search** (⌘G / “All”)
- Drag reorder, sort modes, running indicators
- Smart folders: **Recents**, **Running**
- **Workspaces** (subset of folders)
- **Per-folder hotkeys** ⌘⇧1–9
- Custom folder SF Symbol or image
- Launch history → Recents
- Import/export JSON + **`.slavedock` packs**
- URL scheme: `slavedock://open`, `add`, `workspace`, …
- Finder Services: “Add to SlaveDock”
- Donate button → chidichidovsky

### Config
- Versioned `folders.json` (v3)
- Migrates older DockFolder/SlaveDock data when present

---

## Rebuild / reinstall

```bash
cd ~/Developer/SlaveDock
./scripts/build.sh
cp -R build/SlaveDock.app /Applications/
open /Applications/SlaveDock.app
```

---

## Intentionally not done yet

- Apple notarization / Developer ID ($99) for Gatekeeper-clean distribution
- GitHub Releases + public repo
- Sparkle auto-update
- iCloud sync
- Custom hotkey *recorder* (presets only today)
- Homebrew cask

---

## Good next sessions (pick one)

1. **Ship free public build** — GitHub repo, Releases zip, README polish, notarize if you have a developer account  
2. **UX harden** — reorder drag reliability, first-run tips, Services enablement guide  
3. **More power** — per-app hotkeys, schedule/contexts, badge counts  
4. **Polish only** — animations, empty states, About keyboard cheat sheet  

---

## Key source map

```
SlaveDock/
  SlaveDockApp.swift, AppDelegate.swift
  Models/   DockItem, AppFolder, FolderStore, AppPreferences, LaunchHistory, AppSupport
  Services/ Launch, Icons, HotKey, Running, LoginItem, URLScheme
  Views/    LauncherView, SettingsView
  Helpers/  PanelController
  Resources/AppIcon.icns
scripts/build.sh
```

---

## Resume prompt (paste into a new agent chat)

```
Continue SlaveDock at ~/Developer/SlaveDock.
Read SESSION.md and README.md first.
App is free, icon is custom AppIcon.icns, donate is buymeacoffee.com/chidichidovsky.
Installed at /Applications/SlaveDock.app. Rebuild with ./scripts/build.sh.
Do not replace the system Dock. Prefer stable public APIs.
```
