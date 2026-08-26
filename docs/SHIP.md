# Shipping ClutterDock

## Public URLs

| What | URL |
|------|-----|
| Repo | https://github.com/rbakman-rgb/clutterdock |
| Releases | https://github.com/rbakman-rgb/clutterdock/releases |
| Website | https://clutterdock.com/ |
| Pricing | https://clutterdock.com/pricing.html |

## Release checklist

### Every version

1. Bump version in:
   - `ClutterDock/Info.plist` (`CFBundleShortVersionString` + `CFBundleVersion`)
   - `windows/package.json` `version` (when shipping Windows)
   - README version blurb
2. `git commit` + `git tag vX.Y.Z` + `git push origin main --tags`
   - From a cloud agent session (tag pushes blocked): push `release/vX.Y.Z` instead — the Release workflow derives the tag, creates it at the built commit, and deletes the branch after publishing
3. GitHub Actions **Release** workflow builds Mac zip + Windows exe and publishes the release
4. Confirm download links on the website still match the latest tag pattern

### Manual Mac-only package (this machine)

```bash
./scripts/package-mac.sh
# → dist/ClutterDock-<version>-mac.zip
gh release create vX.Y.Z dist/ClutterDock-*-mac.zip --generate-notes
```

### First-time GitHub Pages

1. Repo **Settings → Pages → Source**: GitHub Actions  
2. Push to `main` (or run **Deploy website** workflow)  
3. Site: `https://clutterdock.com/`

### Make the product public

```bash
gh repo edit rbakman-rgb/clutterdock --visibility public
```

## Shipped 2026-08-26 (v1.4.9 / Win 1.3.0 unsigned beta)

| Item | Evidence |
|------|----------|
| Release **v1.4.9** | https://github.com/rbakman-rgb/clutterdock/releases/tag/v1.4.9 |
| Windows | `ClutterDock-1.3.0-x64-setup.exe` — glitch fixes (dialog/focus/toggle races, taskbar-click flicker), 20 design & functionality upgrades (pin-open, import wizard, hotkey recorder, multi-select, Send to, Alt+drag-out, Ctrl+C/V CF_HDROP, frecency search, Most Used, custom data folder + backups, stack colors, placement modes, jump-list stacks), motion pass, search-to-add installed-app index. Acrylic OFF by default (opt-in — Windows re-composites it visibly on re-show) |
| Mac | `ClutterDock-1.4.9-mac.zip` — Dock icon accepts dropped apps/files (CFBundleDocumentTypes; verify drop on a real Mac) |
| Tests | 40/40 e2e + 21/21 stress on real Windows; unit + e2e re-verified in CI container (CF_HDROP check is Windows-only) |
| Site | `/dl/mac` + `/dl/win` point at v1.4.9 assets — redeploy worker after release assets publish |
| Debug | Panel event tracing behind `CLUTTER_DOCK_DEBUG=1` |

## Shipped 2026-08-10 (v1.4.7 / Win 1.2.1 unsigned beta)

| Item | Evidence |
|------|----------|
| Release **v1.4.7** | https://github.com/rbakman-rgb/clutterdock/releases/tag/v1.4.7 |
| Mac | `ClutterDock-1.4.7-mac.zip` — license fix, audit round 2, password-protected stacks, Pro polish |
| Windows | `ClutterDock-1.2.1-x64.exe` (CI on tag; smoke on a PC still open) |
| Tests | Mac model suite + Windows store/license + stack-lock interop green locally |
| Apple Developer | Enrolled (RON-359). No Developer ID cert on this Mac yet — still ad-hoc signed |
| Merchant | **Lemon Squeezy recommended** (RON-364) — MoR + license keys for one-time Pro |

## Shipped 2026-08-07 (v1.4.5 unsigned beta)

| Item | Evidence |
|------|----------|
| Release **v1.4.5** | https://github.com/rbakman-rgb/clutterdock/releases/tag/v1.4.5 |
| Mac | `ClutterDock-1.4.5-mac.zip` (smoked: install → launcher + settings) |
| Windows | `ClutterDock-1.1.3-x64.exe` (CI artifact; smoke on a PC still open) |
| Screenshots | https://clutterdock.com/ — real launcher + settings |
| Key ops | `docs/KEY_OPS.md` |

## Shipped 2026-08-06 (unsigned public beta)

| Item | Evidence |
|------|----------|
| Public repo | https://github.com/rbakman-rgb/clutterdock |
| Release **v1.4.3** | Mac universal zip + Win 1.1.1 exe (superseded by v1.4.5) |
| Install FAQ | https://clutterdock.com/install |

## Still manual / blocked without accounts

| Item | Why | Owner action |
|------|-----|----------------|
| **Apple notarization** (RON-359→361) | No Developer ID cert on this Mac | Enroll Apple Developer ($99), create Developer ID Application cert, sign + notarize zip, re-release |
| **Windows signing** (RON-362) | No Authenticode cert | Buy cert / Azure Trusted Signing, or keep SmartScreen FAQ |
| **Pro checkout** (RON-364→367) | No merchant | Lemon Squeezy / Gumroad / Paddle product + auto key email; wire Unlock Pro |
| **Real screenshots** (RON-369) | Done 2026-08-07 | `website/assets/screenshots/launcher.png` + `settings.png` on site |
| **Clean-machine smoke** (RON-363) | Partial / Mac | Smoke from GitHub Release zip on this Mac; Windows needs a Win machine |
| **Soft launch posts** (RON-374) | Kit 2026-08-21 | `docs/CAMPAIGN.md` — not posted yet |
| **Homebrew cask** (RON-376) | After notarization | |
| **Sparkle auto-update** | Not ticketed | After notarization |
| **Linear sync** | MCP OAuth | Mark RON-379/370/372 Done in Linear UI |

## License keys (seller side)

Full runbook: [KEY_OPS.md](KEY_OPS.md) (RON-415).

```bash
swift scripts/generate-license.swift A1B2 CUST
```

- Format: `SDPRO-XXXX-YYYY-ZZZZ`
- Do not publish the HMAC secret in marketing copy (it lives in app source for offline validation — standard offline-key tradeoff)
- Test key for development only: see `docs/PRICING.md` (not for customers)

## Gatekeeper note (unsigned Mac builds)

Until notarized:

1. Unzip ClutterDock  
2. Drag to Applications  
3. **Right-click → Open** the first time (or System Settings → Privacy & Security → Open Anyway)

## Windows note

Preferred path: tag a release and let CI build on `windows-latest`.  
Local: run `npm run dist` **on a Windows machine**.
