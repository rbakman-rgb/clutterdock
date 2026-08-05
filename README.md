# SlaveDock

Folders of apps, files, folders, and URLs — on **Mac** (Dock) and **Windows** (system tray).

**Free forever** for daily use · **Pro** one-time unlock for power features · Tips optional via [Buy Me a Coffee](https://buymeacoffee.com/chidichidovsky).

| Platform | Code | Stack |
|----------|------|--------|
| macOS 14+ | `SlaveDock/` | Native Swift / SwiftUI · **v1.3.0** Free/Pro |
| Windows 10/11 | `windows/` | Electron tray · **v1.1.0** Free/Pro |

Windows: **[windows/README.md](windows/README.md)** · Pricing: **[docs/PRICING.md](docs/PRICING.md)**

## Free vs Pro

| | Free | Pro |
|--|------|-----|
| Folders | Up to **5** | Unlimited |
| Items per folder | Up to **20** | Unlimited |
| Search all folders | — | Yes |
| Workspaces | — | Yes |
| Per-folder hotkeys | — | Yes |
| Custom images / themes | — | Yes |
| `.slavedock` pack export | — | Yes |
| Core launcher, Recents, JSON backup | Yes | Yes |

Activate Pro: **Settings → Pro** (same license key on Mac + Windows).

Test unlock: `SDPRO-TEST-UNLOCK-2026`  
Generate keys: `swift scripts/generate-license.swift A1B2`

Target price: **~$14.99** one-time (payment store next).

## Features (macOS)

### Launcher
- Dock icon + optional menu bar + global hotkey (⌘⇧D)
- Multiple folders with grid or list view
- **Apps, files, folders, URLs**
- Drag-and-drop + reorder
- Search in folder; **search all** (Pro, ⌘G)
- Keyboard: arrows, Return, Esc, ⌘1–9
- Running indicators
- Per-folder hotkeys (Pro)
- **Workspaces** (Pro)
- Smart folders: **Recents**, **Running**

### Settings
- Folder symbols / custom images (Pro)
- Open at login
- Free/Pro license tab
- JSON backup (free) · pack export (Pro)
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

- **Mac 1.3.0** — Free/Pro entitlements, license keys, upgrade UX  
- **Windows 1.1.0** — matching Free/Pro gates
