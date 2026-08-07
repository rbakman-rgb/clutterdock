# ClutterDock

**Folders of apps, files, folders, and URLs** — on your **Mac Dock** or **Windows tray**.

[Download](https://github.com/rbakman-rgb/clutterdock/releases/latest) · [Website](https://clutterdock.com/) · [Pricing](https://clutterdock.com/pricing) · [Buy Me a Coffee](https://buymeacoffee.com/chidichidovsky)

**Free forever** for daily use. **Pro** is an optional **one-time** unlock (no subscription).

| Platform | Stack | Version |
|----------|--------|---------|
| macOS 14+ | Native Swift / SwiftUI | **1.4.6** |
| Windows 10/11 | Electron tray launcher | **1.2.0** |

---

## Install

### macOS

1. Download **`ClutterDock-*-mac.zip`** from [Releases](https://github.com/rbakman-rgb/clutterdock/releases/latest)
2. Unzip → drag **ClutterDock.app** to **Applications**
3. First launch: **right-click → Open** (build is ad-hoc signed until Apple Developer ID notarization)
4. Optional: right-click Dock icon → Options → **Keep in Dock**
5. Hotkey default: **⌘⇧D**

### Windows

1. Download the installer or portable **`.exe`** from [Releases](https://github.com/rbakman-rgb/clutterdock/releases/latest)
2. Run it and find **ClutterDock** in the system tray
3. Hotkey default: **Ctrl+Shift+D**

---

## Free vs Pro

| | Free | Pro (~$14.99 once) |
|--|------|---------------------|
| Folders | Up to **5** | Unlimited |
| Items per folder | Up to **20** | Unlimited |
| Search all folders | — | Yes |
| Workspaces | — | Yes |
| Per-folder hotkeys | — | Yes |
| Custom folder images | — | Yes |
| `.clutterdock` pack export | — | Yes |
| Password-protected stacks | — | Yes |
| Core launcher, Recents, JSON backup | Yes | Yes |

Activate Pro: **Settings → Pro** (same key on Mac + Windows).  
Details: [docs/PRICING.md](docs/PRICING.md) · [pricing page](https://clutterdock.com/pricing)

---

## Features

- Dock (Mac) / tray (Windows) launcher + global hotkey  
- Apps, files, folders, URLs · grid or list · drag reorder  
- Smart folders: **Recents**, **Running**  
- Workspaces, global search, per-folder hotkeys (Pro)  
- Import/export JSON; pack export (Pro)  
- URL scheme: `clutterdock://open`, `add`, `workspace`, …  
- Finder Service: **Add to ClutterDock** (Mac)

---

## Build from source

### macOS

```bash
./scripts/build.sh              # native arch (dev)
./scripts/build.sh universal    # Intel + Apple Silicon
./scripts/package-mac.sh        # → dist/ClutterDock-<ver>-mac.zip
cp -R build/ClutterDock.app /Applications/
```

### Windows

```bash
cd windows
npm install
npm start          # dev
npm run dist       # installer + portable (run on Windows)
```

See [windows/README.md](windows/README.md).

### Release automation

Push a tag `vX.Y.Z` → GitHub Actions builds Mac + Windows and publishes a Release.  
Ship notes: [docs/SHIP.md](docs/SHIP.md)

---

## Data (local only)

```
macOS:    ~/Library/Application Support/ClutterDock/
Windows:  %APPDATA%/clutterdock/ClutterDock/
```

No account. No cloud required. [Privacy](https://clutterdock.com/privacy.html)

---

## License

MIT — see [LICENSE](LICENSE).

Not affiliated with Apple or Microsoft.
