# ClutterDock — Linear project plan

**Workspace:** [linear.app/rbakman](https://linear.app/rbakman)  
**Team:** RON (same as Massage Key BYC, Nearward, Exposure)  
**Project name (create as):** **ClutterDock — V1 Public Launch**

This matches how your other products use Linear:

| Pattern (from your repos) | ClutterDock application |
|---------------------------|------------------------|
| One **project** per product wave | Single project for V1 public launch |
| **Milestones** = gates / phases | G0–G4 below |
| **Issues** = numbered work with evidence | `SD-…` titles; RON team IDs auto-assigned |
| Linear = source of truth for *what work exists* | Git = code; site = marketing; Linear = backlog |
| Cross-link GitHub + docs both ways | Description + issue bodies link repo/site/SHIP |
| Priority P0 / P1 / P2 | Same language as Massage Key waves |

**Code:** https://github.com/rbakman-rgb/clutterdock  
**Site:** https://rbakman-rgb.github.io/clutterdock/  
**Local:** `/Users/ronald/Developer/ClutterDock`

---

## ✅ Created in Linear (2026-08-05)

**Project:** https://linear.app/rbakman/project/slavedock-v1-public-launch-9720be94b795 — status In Progress, 26 issues seeded. Agents: follow the **Linear sync protocol in `AGENTS.md`** (update issues as you work).

| ID | Issue | State |
|----|-------|-------|
| RON-352 | G0-01 Native Mac launcher Free core | Done |
| RON-353 | G0-02 Windows Electron tray Free core | Done |
| RON-354 | G0-03 Free/Pro entitlements + offline license keys | Done |
| RON-355 | G0-04 Marketing site GitHub Pages | Done |
| RON-356 | G0-05 Release CI Mac zip + Windows exe | Done |
| RON-357 | G0-06 App update checks Mac + Windows | Done |
| RON-358 | G0-07 Public GitHub + release assets | Done |
| RON-359 | G1-01 Enroll Apple Developer Program ($99) | Todo · Urgent |
| RON-360 | G1-02 Developer ID cert + signed Mac build | Todo · Urgent |
| RON-361 | G1-03 Notarize Mac release zip | Todo · Urgent |
| RON-362 | G1-04 Windows code signing / SmartScreen doc | Todo · High |
| RON-363 | G1-05 Clean-machine install smoke (Mac + Win) | Todo · Urgent |
| RON-364 | G2-01 Choose merchant | Todo · Urgent |
| RON-365 | G2-02 Create Pro $14.99 + Multi $29 products | Todo · Urgent |
| RON-366 | G2-03 Auto-email license key on purchase | Todo · Urgent |
| RON-367 | G2-04 Wire site Unlock Pro to checkout | Todo · Urgent |
| RON-368 | G2-05 Optional webhook key generation | Todo · Low |
| RON-369 | G3-01 Homepage screenshots / launcher GIF | Todo · High |
| RON-370 | G3-02 Install FAQ Gatekeeper + SmartScreen | Todo · High |
| RON-371 | G3-03 Support contact / Issues link on site | Todo · Medium |
| RON-372 | G3-04 Direct asset download links on site | Todo · Low |
| RON-373 | G3-05 Terms of use for Pro license | Todo · Low |
| RON-374 | G4-01 Soft launch posts (blocked by RON-363) | Todo · High |
| RON-375 | G4-02 Rebrand decision | Todo · Medium |
| RON-376 | G4-03 Homebrew cask (blocked by RON-361) | Todo · Low |
| RON-377 | G4-04 iCloud/OneDrive sync Pro pillar | Backlog · Low |

---

## Project description (paste into Linear)

```
ClutterDock — folders of apps, files, folders, and URLs on Mac Dock & Windows tray.

Free forever core · Pro one-time unlock · Coffee tips optional.

Repo: https://github.com/rbakman-rgb/clutterdock
Site: https://rbakman-rgb.github.io/clutterdock/
Pricing: https://rbakman-rgb.github.io/clutterdock/pricing.html
Local: ~/Developer/ClutterDock

Sources of truth:
- Product backlog & status → this Linear project
- Code → GitHub main + tags
- Ship ops → docs/SHIP.md, docs/PRICING.md, docs/UPDATES.md
- Session handoff → SESSION.md

Constraints:
- No Dock replacement / private Dock APIs
- Free core stays usable (do not paywall launch)
- Mac unsigned until Developer ID + notarization
```

**Suggested project status:** In Progress  
**Target:** Soft public launch complete (notarized Mac optional stretch)

---

## Milestones (gates)

| Milestone | Goal |
|-----------|------|
| **G0 — Foundation** | Repo, site, Free/Pro, CI releases, updates — *mostly done* |
| **G1 — Install trust** | Clean install for strangers (Gatekeeper / SmartScreen) |
| **G2 — Pro commerce** | Real checkout → license key delivery |
| **G3 — Product polish** | Screenshots, install FAQ, support path |
| **G4 — Growth** | Soft launch posts, optional Homebrew / rebrand decision |

---

## Issues to create

### G0 — Foundation (many Done)

| Title | Priority | State | Notes |
|-------|----------|-------|-------|
| G0-01 Native Mac launcher (Swift) Free core | P0 | **Done** | Dock, folders, hotkey, Recents |
| G0-02 Windows Electron tray app Free core | P0 | **Done** | Tray, Ctrl+Shift+D |
| G0-03 Free/Pro entitlements + offline license keys | P0 | **Done** | FeatureGate, Settings → Pro |
| G0-04 Marketing site (GitHub Pages) | P0 | **Done** | rbakman-rgb.github.io/clutterdock |
| G0-05 Release CI (Mac zip + Windows exe) | P0 | **Done** | Tag `v*` workflow |
| G0-06 App update checks (Mac GH API + Win electron-updater) | P1 | **Done** | docs/UPDATES.md |
| G0-07 GitHub public repo + v1.3.0 release assets | P0 | **Done** | |

### G1 — Install trust

| Title | Priority | State |
|-------|----------|-------|
| G1-01 Enroll Apple Developer Program | P0 | Todo |
| G1-02 Developer ID Application cert + signed Mac build | P0 | Todo |
| G1-03 Notarize Mac release zip | P0 | Todo |
| G1-04 Windows code signing (or document SmartScreen) | P1 | Todo |
| G1-05 Clean-machine install smoke (Mac + Win from Releases) | P0 | Todo |

### G2 — Pro commerce

| Title | Priority | State |
|-------|----------|-------|
| G2-01 Choose merchant (Lemon Squeezy / Gumroad / Paddle) | P0 | Todo |
| G2-02 Create Pro $14.99 product + Multi $29 | P0 | Todo |
| G2-03 Auto-email license key on purchase | P0 | Todo |
| G2-04 Wire site “Unlock Pro” to checkout URL | P0 | Todo |
| G2-05 Optional: webhook → key generation service | P2 | Todo |

### G3 — Polish

| Title | Priority | State |
|-------|----------|-------|
| G3-01 Homepage screenshots / short GIF of launcher | P1 | Todo |
| G3-02 Install FAQ: Gatekeeper + SmartScreen | P1 | Todo |
| G3-03 Support contact / GitHub Issues link on site | P1 | Todo |
| G3-04 Direct download links (asset URLs, not only /latest page) | P2 | Todo |
| G3-05 Terms of use for Pro license | P2 | Todo |

### G4 — Growth

| Title | Priority | State |
|-------|----------|-------|
| G4-01 Soft launch post (r/macapps, r/windowsapps, X) | P1 | Todo |
| G4-02 Rebrand decision (keep ClutterDock vs Dockpack/Stackly) | P2 | Todo |
| G4-03 Homebrew cask (after notarization) | P2 | Todo |
| G4-04 iCloud / OneDrive sync (Pro pillar) | P2 | Backlog |

---

## How to create in Linear (when MCP/API works)

### Option A — Linear UI (fast)

1. Open https://linear.app/rbakman  
2. **Projects → New project** → name **ClutterDock — V1 Public Launch**  
3. Paste project description above  
4. Add milestones G0–G4  
5. Create issues from the tables (mark G0 as Done)

### Option B — API script

```bash
export LINEAR_API_KEY="lin_api_..."   # Linear → Settings → API → Personal API keys
node scripts/linear-seed-clutterdock.mjs
```

### Option C — Grok Linear MCP

1. Linear MCP is **enabled** in `~/.grok/config.toml`  
2. Restart Grok / complete OAuth for `https://mcp.linear.app/mcp`  
3. Ask: *“Create the ClutterDock Linear project from docs/LINEAR.md”*

---

## Your historical setup (analysis)

From Massage Key BYC, Nearward, Orbit, Exposure:

1. **Team RON** owns product issues (`RON-#`).  
2. **Project name** = product + wave (`Massage Key BYC — V1 Foundation & Launch`, `Nearward`).  
3. **Milestones** map to phases/gates; issues use `G#-##` or task IDs in titles.  
4. **Linear is backlog authority**; Slack summarizes; Git holds code.  
5. **Done means evidence** (links to commits, releases, docs).  
6. **MCP** is configured but was often **disabled until OAuth** — same blocker as Massage Key PENDING-SLACK-LINEAR notes.

ClutterDock should follow that: one project, gate milestones, ship evidence in issue comments.
