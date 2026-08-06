# ClutterDock updates

## How it works

| Platform | Mechanism | User action |
|----------|-----------|-------------|
| **macOS** | Checks GitHub Releases API | Prompt → download zip → replace app in Applications |
| **Windows (NSIS install)** | `electron-updater` + `latest.yml` on release | Download in-app → restart to install |
| **Windows (portable)** | Same check may fail silently / open releases page | Download new portable manually |

Release assets must include:

- `ClutterDock-*-mac.zip`
- `ClutterDock-*-x64.exe` (NSIS)
- `latest.yml` (+ `.blockmap` if present) for Windows auto-update

CI (`.github/workflows/release.yml`) uploads these when you push a `v*` tag.

## Mac behavior

- **Automatic:** ~8s after launch if “Check for updates automatically” is on  
- **Manual:** Settings → Updates → **Check for Updates…** · Dock menu  
- Opens the mac zip (or releases page) — does **not** replace the running `.app` (safe without Sparkle/notarization)

Later: Sparkle 2 + Developer ID for silent replace.

## Windows behavior

- Prefer **NSIS installer** from Releases  
- `electron-updater` reads `latest.yml` from the latest GitHub release  
- User can decline download; on complete, “Restart now” applies update  

## Shipping a new version

1. Bump version in `ClutterDock/Info.plist` and `windows/package.json`  
2. `git tag vX.Y.Z && git push origin vX.Y.Z`  
3. Wait for Release workflow  
4. Confirm release has mac zip + exe + `latest.yml`  
5. Existing users get a prompt on next check  

## Testing

- Mac: Settings → Check for Updates (with a higher tag published)  
- Windows: install NSIS build, publish newer version, Check for Updates  
- Dev: `CLUTTER_DOCK_NO_UPDATE=1` skips background check on Windows  
