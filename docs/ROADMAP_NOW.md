# ClutterDock — Where we go from here

**As of:** 2026-08-06 (public beta release path)  
**Project:** [ClutterDock — V1 Public Launch](https://linear.app/rbakman/project/slavedock-v1-public-launch-9720be94b795)

---

## Where we are (honest snapshot)

| Area | Status |
|------|--------|
| **Product name / brand** | ClutterDock shipped (repo, app, site) |
| **Marketing site** | Live at clutterdock.com; downloads + install FAQ |
| **Mac app** | **v1.4.3** universal zip — launcher polish shipped |
| **Windows app** | Electron tray; **1.1.1** portable exe on Releases |
| **Public GitHub Releases** | **v1.4.3** unsigned beta (Mac zip + Win exe) |
| **Code signing** | Mac ad-hoc only · Windows unsigned (SmartScreen expected) |
| **Pro checkout** | License keys exist offline; no merchant yet |
| **Linear MCP** | Often unauthenticated in Grok — update via UI or `LINEAR_API_KEY` |

**Ship philosophy:** free core stays free; no Dock replacement; local-first.

---

## Recommended order (critical path)

### Phase A — “Friends can install without you hand-holding” (this week)

| # | Work | Linear | Why |
|---|------|--------|-----|
| A1 | Collect friend feedback (Windows portable + your Mac) | Note on RON-363 | Finds real bugs before trust spend |
| A2 | **Publish GitHub Release** on `rbakman-rgb/clutterdock` with Mac zip + Win portable (label **unsigned beta**) | **RON-379** → Done when live | Unblocks downloads & smoke |
| A3 | Site: short **Install FAQ** (Gatekeeper + SmartScreen + “unsigned for now”) | **RON-370** | Cuts support panic |
| A4 | Optional: make repo **public** if still private | part of RON-379 | Releases + trust |
| A5 | Site: real **screenshots** from Mac 1.4.3 (no fake mockups) | **RON-369** | Conversion when “Coming soon” lifts |

**Do not block A on Apple $99 or Windows cert** — friend testing and beta releases can stay unsigned with clear docs.

### Phase B — Install trust (you pay once, friction drops forever)

| # | Work | Linear | Cost / note |
|---|------|--------|-------------|
| B1 | Enroll Apple Developer Program | **RON-359** | ~$99/yr · you |
| B2 | Developer ID Application cert + signed Mac build | **RON-360** | depends B1 |
| B3 | Notarize Mac release zip | **RON-361** | depends B2 |
| B4 | Windows signing **or** formal SmartScreen doc | **RON-362** | Cert $ or Azure Trusted Signing · or doc-only short term |
| B5 | Clean-machine smoke from **GitHub Releases** | **RON-363** | blocked until A2 (RON-379) |

### Phase C — Get paid (before loud marketing)

| # | Work | Linear |
|---|------|--------|
| C1 | Pick Lemon Squeezy / Gumroad / Paddle | **RON-364** |
| C2 | Pro $14.99 + Multi $29 products | **RON-365** |
| C3 | Auto-email `SDPRO-…` keys | **RON-366** |
| C4 | Wire site Unlock Pro → checkout | **RON-367** |
| C5 | Optional webhook key gen | **RON-368** (Low) |

### Phase D — Soft launch

| # | Work | Linear | Blocked by |
|---|------|--------|------------|
| D1 | Site download buttons live (not Coming soon) | **RON-372** | RON-379 + preferably B* |
| D2 | Soft launch posts | **RON-374** | RON-363 |
| D3 | Support contact / Issues on site | **RON-371** | easy anytime |
| D4 | Terms for Pro | **RON-373** | before C public |
| D5 | Homebrew cask | **RON-376** | RON-361 |

### Later / backlog

| Work | Linear |
|------|--------|
| iCloud/OneDrive sync Pro | **RON-377** |
| Sparkle full auto-update | not ticketed yet |
| Hotkey recorder | not ticketed yet |
| Windows UX parity with Mac 1.4.x | **RON-382** (Backlog) |

---

## Suggested Linear status updates (apply in UI)

### Mark Done (with comment evidence)

| ID | Comment evidence |
|----|------------------|
| **RON-375** | Already Done — ClutterDock rebrand shipped (repo, app, domains). |
| **RON-378** | Already Done — site live Cloudflare clutterdock.com. |

### Add progress comments (stay Todo/In Progress)

| ID | Comment to add |
|----|----------------|
| **RON-379** | Repo is `rbakman-rgb/clutterdock`. Local Win portable `ClutterDock-1.1.1-x64.exe` built for friend test. **Still need:** public repo (if private), tag `v1.4.3` / `v1.1.1-win`, GitHub Release assets (Mac zip + Win portable), release notes “unsigned beta”. |
| **RON-362** | Documented SmartScreen for friend testers. Portable exe unsigned by design until cert. Partial progress — full Done when signed **or** FAQ published (RON-370). |
| **RON-369** | Site no longer uses fake before/after mock as product UI. Still need **real** Mac launcher screenshots/GIF from 1.4.3. |
| **RON-370** | Content partially explained in chat/docs; **site FAQ page section still Todo**. |

### Create new issues (team RON, project ClutterDock V1)

> **Applied 2026-08-05 (late) via Linear MCP** — all three created, plus the four progress
> comments above and the two Done confirmations:

1. **RON-380** G3-06 Mac launcher polish 1.4.x → **Done** (commits `9d2d107`…`f40d374`, v1.4.3)
2. **RON-381** G3-07 Windows friend-test portable build → **Done** (`ClutterDock-1.1.1-x64.exe`)
3. **RON-382** G3-08 Windows launcher UX parity with Mac 1.4 → **Backlog**

### Priority stack for next 3 sessions

1. **RON-379** — GitHub Release (unsigned beta OK)  
2. **RON-370** — Install FAQ on site  
3. **RON-369** — Real screenshots  
4. **RON-359** — Apple Developer enroll (when you’re ready to pay)  
5. **RON-364** — Merchant choice (when ready to sell)

---

## Agent note

If Linear MCP is authenticated, apply the table above live.  
If not: Ronald runs `/mcp` OAuth for Linear, **or**:

```bash
export LINEAR_API_KEY="lin_api_..."
# then a sync script or manual UI updates from this doc
```

Key project URL (do not recreate):  
https://linear.app/rbakman/project/slavedock-v1-public-launch-9720be94b795
