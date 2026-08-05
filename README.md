# SlaveDock

**Free** folders of apps, files, folders, and URLs — on **Mac** (Dock) and **Windows** (system tray).

No subscription. Tips optional via [Buy Me a Coffee](https://buymeacoffee.com/chidichidovsky).

| Platform | Code | Stack |
|----------|------|--------|
| macOS 14+ | `SlaveDock/` | Native Swift / SwiftUI |
| Windows 10/11 | `windows/` | Electron tray launcher |

Windows build & run: see **[windows/README.md](windows/README.md)**.

## Features (macOS)

### Launcher
- Dock icon + optional menu bar + global hotkey (⌘⇧D)
- Multiple folders with grid or list view
- **Apps, files, folders, URLs**
- Drag-and-drop + reorder
- Search in folder or **all folders** (⌘G)
- Keyboard: arrows, Return, Esc, ⌘1–9
- Running indicators
- Per-folder sort and hotkeys (⌘⇧1–9)
- **Workspaces** (switch folder sets)
- Smart folders: **Recents**, **Running**

### Settings
- Folder symbols / custom images
- Open at login
- Import/export JSON and **`.slavedock` packs**
- Cleanup missing / duplicates

### Automation
```
slavedock://open
slavedock://open?folder=Work
slavedock://add?path=/Applications/Safari.app
slavedock://add?url=https://example.com
slavedock://workspace?name=All
```

Finder: select items → **Services → Add to SlaveDock**  
(Enable once under System Settings → Keyboard → Keyboard Shortcuts → Services if needed.)

## Build & install

```bash
cd ~/Developer/SlaveDock
./scripts/build.sh
cp -R build/SlaveDock.app /Applications/
open /Applications/SlaveDock.app
```

Keep in Dock: right-click → Options → Keep in Dock.

## Data

```
~/Library/Application Support/SlaveDock/folders.json
~/Library/Application Support/SlaveDock/history.json
```

## Version

1.2.1 — full feature pack + onboarding, keyboard help, reliable reorder
