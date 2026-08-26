# ClutterDock — Session save

**Saved:** 2026-08-26  
**Status:** **Public unsigned beta v1.4.9** — Mac **1.4.9** (Dock-icon drops) + Win **1.3.0** (glitch fixes, 20-feature upgrade pass, motion polish, search-to-add; 40/40 e2e + 21/21 stress on real Windows). Release live with auto-update feed; site downloads point at v1.4.9 (worker redeploy pending). Pro keys manual until Lemon Squeezy products/checkout go live (RON-365/366/367). Notarization (RON-361) still open.  
**2026-08-26:** Cloud agents cut releases by pushing `release/vX.Y.Z` (tag pushes are blocked from cloud sessions; the Release workflow creates the tag itself). Windows E2E (`npm run e2e`) + stress (`npm run stress`) suites live in `windows/scripts/`; e2e runs in CI. Panel debug tracing: `CLUTTER_DOCK_DEBUG=1`.  
**2026-08-10:** Ronald is already an Apple Developer (RON-359 Done). No Developer ID Application cert in this Mac's keychain yet (`security find-identity` empty for codesigning beyond ad-hoc) — RON-360 is create/install cert + signed build, then RON-361 notarize. Merchant pick: **Lemon Squeezy** (RON-364).  
**2026-08-07 full-app audit + round 2 shipped (RON-417…425).** License fix + secret rotation; Windows Electron-33 fixes; Pro parity; CI tests. Password stacks **RON-473** on main.  
**URLs:** https://github.com/rbakman-rgb/clutterdock · https://clutterdock.com/ (**live** — Cloudflare Workers; clutterdock.app + www 301 → clutterdock.com)  
**Roadmap:** [docs/ROADMAP_NOW.md](docs/ROADMAP_NOW.md) · Linear map [docs/LINEAR_LIVE.md](docs/LINEAR_LIVE.md)  
**Backlog:** [Linear — ClutterDock V1](https://linear.app/rbakman/project/clutterdock-v1-public-launch-9720be94b795) (full sync 2026-08-06 · `docs/LINEAR_LIVE.md` · protocol in `AGENTS.md`)

---

## Where everything lives

| Role | Path |
|------|------|
| Source project | `/Users/ronald/Developer/ClutterDock` |
| **Mac** app sources | `/Users/ronald/Developer/ClutterDock/ClutterDock/` |
| **Windows** app | `/Users/ronald/Developer/ClutterDock/windows/` |
| Mac build output | `/Users/ronald/Developer/ClutterDock/build/ClutterDock.app` |
| Mac installed | `/Applications/ClutterDock.app` |
| Mac config | `~/Library/Application Support/ClutterDock/folders.json` (migrates from `SlaveDock` / `DockFolder`) |
| Windows config | `%APPDATA%/clutterdock/ClutterDock/` (Electron userData; migrates legacy `SlaveDock`) |
| Windows dev | `cd windows && npm install && npm start` |
| Windows package | `cd windows && npm run dist` **(on Windows)** |

---

## Product decisions (locked in)

- **Name:** **ClutterDock** (formerly SlaveDock; briefly DockFolder)
- **Domains owned:** clutterdock.com · clutterdock.app — **site live** on Cloudflare Workers (worker `clutterdock-site`, account rbakman@gmail.com; deploy `npx wrangler@latest deploy`); .app and www hosts 301 → clutterdock.com
- **GitHub repo:** `rbakman-rgb/clutterdock` (canonical)
- **Price:** Free forever
- **Tips:** [Buy Me a Coffee](https://buymeacoffee.com/chidichidovsky)
- **Icon:** User-provided light blue “hanging apps” image → `ClutterDock/Resources/AppIcon.icns`
- **Stability rule:** No Dock replacement, no private Dock APIs, Carbon hotkeys (no Accessibility for main hotkey)
- **Min OS:** macOS 14+ / Windows 10+
- **Windows:** Electron tray app (not a full native WinUI port yet)
- **License keys:** still `SDPRO-…` (unchanged crypto; works across rebrand)

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
- Import/export JSON + **`.clutterdock` packs**
- URL scheme: `clutterdock://open`, `add`, `workspace`, …
- Finder Services: “Add to ClutterDock”
- Donate button → chidichidovsky

### Config
- Versioned `folders.json` (v3)
- Migrates older DockFolder/ClutterDock data when present

---

## Rebuild / reinstall

```bash
cd ~/Developer/ClutterDock
./scripts/build.sh
cp -R build/ClutterDock.app /Applications/
open /Applications/ClutterDock.app
```

---

## Intentionally not done yet

- Apple notarization / Developer ID ($99) for Gatekeeper-clean distribution
- Lemon Squeezy / Gumroad / Paddle auto-checkout + key email
- Sparkle auto-update
- iCloud sync
- Custom hotkey *recorder* (presets only today)
- Homebrew cask

---

## Good next sessions (priority order)

1. **RON-359+** — Apple Developer enroll → sign → notarize  
2. **RON-363** — Windows smoke from Releases (Mac smoke done)  
3. **RON-372** — Re-enable site download CTAs when ready  
4. **G2** — Merchant + Pro checkout when ready to sell  
5. **Soft launch (RON-374)** — campaign kit is in `docs/CAMPAIGN.md`. Record a real clip, then X + Reddit. Grok Bot briefs in `docs/campaign/GROK_BOT.md`. Do not sell Pro until Lemon Squeezy is live.  

---

## Key source map

```
ClutterDock/
  ClutterDockApp.swift, AppDelegate.swift
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
Continue ClutterDock at ~/Developer/ClutterDock.
Read SESSION.md and README.md first.
Product name is ClutterDock (was SlaveDock). Domains: clutterdock.com / clutterdock.app.
GitHub repo: rbakman-rgb/clutterdock.
Backlog is in Linear (project slug slavedock-v1-public-launch, team RON). Use the Linear
MCP: check In Progress/Todo before starting, and keep issues updated as you work —
protocol and issue map are in AGENTS.md.
App is free, icon is custom AppIcon.icns, donate is buymeacoffee.com/chidichidovsky.
Installed at /Applications/ClutterDock.app. Rebuild with ./scripts/build.sh.
Do not replace the system Dock. Prefer stable public APIs.
```
