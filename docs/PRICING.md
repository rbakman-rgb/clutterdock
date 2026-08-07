# ClutterDock Free & Pro

**Positioning:** Free forever for daily Dock/tray folders. Pro is a **one-time unlock** for power users (unlimited stacks, workspaces, per-stack hotkeys, global search, custom images, pack export). Cross-platform license (Mac + Windows).

Tips still welcome: [Buy Me a Coffee](https://buymeacoffee.com/chidichidovsky)

---

## Pricing (target)

| Tier | Price | Includes |
|------|--------|----------|
| **Free** | $0 | Core launcher, limits below |
| **Pro** | **$14.99** one-time (intro **$11.99** ok) | Unlimited + Pro features |
| **Pro Multi** | **$29** | Up to 5 devices / household |
| Coffee | Optional | Free users who want to tip |

**No subscription** until cloud sync ships.

Payment later: Lemon Squeezy / Gumroad / Paddle → deliver license key.

---

## Free limits

| Limit | Free | Pro |
|-------|------|-----|
| Normal folders | **5** | Unlimited |
| Items per folder | **20** | Unlimited |
| Global search (all folders) | No | Yes |
| Workspaces | No (single “All”) | Yes |
| Per-folder hotkeys | No | Yes |
| Custom folder images | No | Yes |
| Launch history (Recents) | Last **15** | Last **40** |
| Pack export `.clutterdock` | No | Yes |
| Password-protected stacks | No | Yes |
| JSON backup export | Yes | Yes |
| Core hotkey, Recents, Running, drag/drop | Yes | Yes |

---

## Pro pillars

1. **Scale** — unlimited folders & items  
2. **Context** — workspaces  
3. **Speed** — global search, per-folder hotkeys  
4. **Identity** — custom folder images  
5. **Later** — iCloud/OneDrive sync, multi-device polish  

---

## License keys

Format: `SDPRO-XXXX-YYYY-ZZZZ`

- Generated offline with `scripts/generate-license.swift` or `windows/scripts/generate-license.js`  
- Validated offline (HMAC) — no account required  
- Same key works on **Mac and Windows**  
- Activate: **Settings → Pro**
- Seller runbook (manual fulfillment): [KEY_OPS.md](KEY_OPS.md)

A dev/test unlock key exists but only works in development builds (never in shipped
releases) — see [KEY_OPS.md](KEY_OPS.md).

The generator secret lives outside the repo (`scripts/private/`, gitignored) — never
publish it or commit it.

---

## Upgrade UX

- Soft limits with clear copy: “Free includes 5 folders. Upgrade to Pro for unlimited.”  
- Buttons open **Settings → Pro**  
- Never block launching apps already added  

---

## Naming note

Public product remains **ClutterDock Free / ClutterDock Pro** for now (GitHub + installs).  
Future rebrand candidates: Dockpack, Stackly, NestDock, AppStash — see SESSION / product notes.

---

## Implementation map

| Platform | Code |
|----------|------|
| Shared rules | This doc |
| Mac | `LicenseManager.swift`, `FeatureGate.swift` |
| Windows | `src/license.js`, gates in `store.js` / UI |

---

## Password-protected stacks (Pro)

A stack can be locked with a password. Its items are **encrypted at rest**
(PBKDF2-HMAC-SHA256, 200k iterations → AES-256-GCM), so `folders.json` holds
only ciphertext — locking is not just a UI gate. Locked stacks are hidden from
global search and show a lock symbol until unlocked for the session.

The format is identical on Mac and Windows (`scripts/test-interop.sh` proves a
stack locked on one platform opens on the other), so `.clutterdock` packs stay
portable and export sealed.

**There is no recovery path.** A forgotten password means the items in that
stack are unreadable — by design, there is no backdoor. Say so plainly in any
support reply.
