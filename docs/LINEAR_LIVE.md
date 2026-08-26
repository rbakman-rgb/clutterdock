# ClutterDock — Linear (LIVE)

> Linear is the backlog source of truth. Agents: follow [`AGENTS.md`](../AGENTS.md).
> **Roadmap:** [docs/ROADMAP_NOW.md](ROADMAP_NOW.md)

**Project:** [ClutterDock — V1 Public Launch](https://linear.app/rbakman/project/clutterdock-v1-public-launch-9720be94b795)  
**ID:** `653f8d91-1839-4a67-b327-ff3980feeb47` · **Team:** RON  
**Last full sync:** 2026-08-06 (Grok Linear MCP)

---

## Reality check (2026-08-26)

| Area | Status |
|------|--------|
| Brand / repo / domains | ClutterDock · public `rbakman-rgb/clutterdock` · clutterdock.com |
| Mac app | **1.4.9** (Dock-icon drops via CFBundleDocumentTypes — verify on a real Mac) |
| Windows | **1.3.0** — glitch fixes, 20-feature upgrade pass, motion polish, search-to-add; 40/40 e2e + 21/21 stress native |
| GitHub Release | Tag **v1.4.9** live with Mac zip, NSIS setup, portable, `latest.yml` (auto-update feed) |
| Marketing site | Live with downloads; `/dl/*` points at v1.4.9 — **worker redeploy pending** (site-deploy workflow needs `CLOUDFLARE_API_TOKEN` secret, else `npx wrangler deploy` manually) |
| Merchant / checkout | Lemon Squeezy chosen + site wired (RON-364 Done); products/auto-email/checkout URL still open (RON-365/366/367) |
| Apple Developer | Enrolled + Developer ID build (RON-359/360 Done); **notarization open** (RON-361) |
| Releases from cloud agents | Push `release/vX.Y.Z` — the Release workflow creates the tag + release itself (tags can't be pushed from cloud sessions) |

---

## Done (evidence in Linear comments)

| ID | Title |
|----|--------|
| RON-352…358, 378 | G0 Foundation |
| RON-379 | Publish clutterdock repo + release assets |
| RON-370 | Install FAQ Gatekeeper + SmartScreen |
| RON-371 | Support / Issues path |
| RON-375 | Rebrand to ClutterDock |
| RON-380 | Mac launcher polish 1.4.x |
| RON-381 | Windows friend-test portable |
| RON-410 | G3-09 Drag-and-drop stacks |
| RON-411 | G3-10 Hero app-burst animation |
| RON-412 | G3-11 Site Coming soon policy |
| RON-369 | Real Mac screenshots on site (`website/assets/screenshots/`) |
| RON-415 | Manual SDPRO key ops — `docs/KEY_OPS.md` |
| RON-363 | Mac smoke from GitHub Release (Win still needs a Windows machine) |
| RON-507 | G3-35 Optional install register + download hops (site `/dl/*` live; app UI on PR branch `ron-507-install-register`) |

---

## Open — next

### G1 Install trust
| ID | State | Notes |
|----|--------|--------|
| RON-359 | Todo · Urgent | Enroll Apple Developer $99 |
| RON-360 | Todo · Urgent | blocked by 359 |
| RON-361 | Todo · Urgent | blocked by 360 |
| RON-362 | Todo · High | Partial: SmartScreen FAQ; signing open |
| RON-363 | Done · Mac | Win portable smoke still manual on a PC |

### G2 Pro commerce (do not start until ready to sell)
| ID | State | Notes |
|----|--------|--------|
| RON-364 | Todo · Urgent | Choose merchant |
| RON-365 | Todo · Urgent | blocked by 364 |
| RON-366 | Todo · Urgent | blocked by 365 |
| RON-367 | Todo · Urgent | blocked by 365 |
| RON-368 | Todo · Low | webhook optional |
| RON-415 | Done | `docs/KEY_OPS.md` |

### G3 Product polish
| ID | State | Notes |
|----|--------|--------|
| RON-369 | Done | Real launcher + settings PNGs on site |
| RON-372 | Todo · Medium | Re-enable site downloads when ready |
| RON-373 | Todo · Low | Pro terms |
| RON-382 | Backlog | Win UX parity |
| RON-413 | Backlog | Sparkle (after 361) |
| RON-414 | Backlog | Hotkey recorder |

### G4 Growth
| ID | State | Notes |
|----|--------|--------|
| RON-374 | In Progress · High | Soft launch parent. Kit in `docs/CAMPAIGN.md`. Posts not sent. |
| RON-502 | Todo · High | X thread + Grok Bot X operator |
| RON-503 | Todo · High | Reddit path (karma, then one post / sub) |
| RON-504 | Todo · Medium | Real 12–20s demo clip |
| RON-505 | Backlog · Low | Product Hunt / Show HN; blocked by 361+365 |
| RON-376 | Todo · Low | Homebrew; blocked by 361 |
| RON-377 | Backlog | iCloud sync |

---

## Critical path (honest)

1. **When ready to distribute cleanly:** RON-359 → 360 → 361 (Apple)  
2. **When ready to sell:** RON-364 → 365 → 366 → 367  
3. **Anytime product polish:** RON-369 screenshots  
4. **When ready for public free downloads:** RON-372 (site CTAs) + optional RON-363 smoke  
5. Soft launch RON-374 — kit ready (`docs/CAMPAIGN.md`); Ronald still has to post. Pro sale and Product Hunt wait on merchant + signing.
