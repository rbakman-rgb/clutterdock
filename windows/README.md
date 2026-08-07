# ClutterDock for Windows

Free tray launcher that mirrors the Mac **ClutterDock** idea: group apps, files, folders, and URLs into folders; open them from a floating panel.

**Free forever.** Tips optional: [Buy Me a Coffee](https://buymeacoffee.com/chidichidovsky)

## Features (Free / Pro)

- System **tray** icon (click to open launcher)
- Global hotkey default: **Ctrl+Shift+D**
- Multiple folders + **Recents**
- Apps (`.exe` / `.lnk`), files, folders, URLs
- Search this folder; **All** folders = Pro
- Grid / list views, drag reorder, Alt+←/→ nudge
- Free: 5 folders · 20 items each · JSON-friendly workflow
- Pro: unlimited · global search · workspaces · Ctrl+Shift+1–9 stack hotkeys · custom stack images · password-protected stacks · pack export
- Open at login, welcome tips, Buy Me a Coffee
- Runs in the background (stays in tray)

See [../docs/PRICING.md](../docs/PRICING.md).

## Requirements

- **Windows 10/11** (x64) to run a packaged build  
- To develop or package from source: **Node.js 18+**

You can develop UI on macOS with `npm start` (tray + panel work; packaging for Windows is best done **on a Windows machine** or CI).

## Develop

```bash
cd windows
npm install
npm start
```

## Build Windows installers

**On a Windows PC** (recommended):

```bat
cd windows
npm install
npm run dist
```

Outputs under `windows/dist/`:

- `ClutterDock-<version>-x64.exe` — NSIS installer  
- Portable build as well (`dist:portable` or full `dist`)

From macOS, `electron-builder --win` may need extra tooling; prefer building on Windows/Parallels.

## Data location

```
%APPDATA%\clutterdock\ClutterDock\
  folders.json
  history.json
  prefs.json
```

(Electron `userData` path; exact parent folder name may be `ClutterDock` depending on Electron version.)

## Keyboard

| Keys | Action |
|------|--------|
| Ctrl+Shift+D | Open / close launcher |
| Esc | Close |
| Enter | Open selected |
| Arrows | Move selection |
| Ctrl+G | Toggle search all |
| Ctrl+Shift+1–9 | Jump to stack 1–9 (Pro) |
| Alt+← / Alt+→ | Reorder item |

## Relation to Mac app

| | Mac | Windows |
|--|-----|---------|
| Path | `ClutterDock/` (Swift) | `windows/` (Electron) |
| Chrome | Dock + menu bar | System tray |
| Config | Application Support JSON | AppData JSON |
| Donate | Same Buy Me a Coffee page | Same |

Windows now covers the same Free and Pro feature set as Mac (native file icons, workspaces, per-stack hotkeys, custom stack images, running indicators).

## License

MIT — free forever.
