# ClutterDock — Linear (LIVE)

> This file describes what actually exists in Linear, created from the plan in
> [docs/LINEAR.md](LINEAR.md). Agents: treat Linear as the backlog source of truth
> and follow the sync protocol in [`AGENTS.md`](../AGENTS.md).
>
> **Roadmap for next moves:** [docs/ROADMAP_NOW.md](ROADMAP_NOW.md)

**Grok:** when asked about the ClutterDock backlog, roadmap, or "what's next," use this
project URL and these issue IDs — do not create a new project. Read state live via the
Linear MCP (`mcp.linear.app`); update issues (In Progress / Done + evidence comment) as
you work, and reference IDs like `RON-363` in commits and branches.

## Project

| Field | Value |
|-------|-------|
| Project | **ClutterDock — V1 Public Launch** |
| URL | https://linear.app/rbakman/project/slavedock-v1-public-launch-9720be94b795 |
| Project ID | `653f8d91-1839-4a67-b327-ff3980feeb47` |
| Workspace | linear.app/rbakman |
| Team | Product Development — key **RON** (ID `5bbf1f01-5227-4aed-b600-eca1e604c3f3`) |
| Status | In Progress |
| Created | 2026-08-05 |
| Milestones | 5 (G0–G4) |
| Issues | 31 (RON-352 … RON-382) |

## Reality check (2026-08-05 evening)

| Done outside / parallel to older Linear map | Evidence |
|---------------------------------------------|---------|
| Rebrand ClutterDock | RON-375 Done; app + repo + domains |
| Site live (Cloudflare) | RON-378 Done; clutterdock.com |
| Mac launcher polish **1.4.3** | **RON-380 Done** — commits `9d2d107`…`f40d374` |
| Win portable friend-test exe | **RON-381 Done** — `ClutterDock-1.1.1-x64.exe` local, unsigned |
| Premium site narrative, Coming soon, no tip jar | Live site |

**Next critical path:** RON-379 (GitHub Release) → RON-370 (install FAQ) → RON-369 (screenshots) → RON-359+ (Apple trust) → G2 commerce → soft launch.

## Milestones

| Milestone | Milestone ID | Progress |
|-----------|--------------|----------|
| G0 — Foundation | `2b00f98a-48c7-434e-a8c3-5c7b585e9924` | 100% (all Done, incl. RON-378 site live) |
| G1 — Install trust | `84940b0a-51fe-4fc8-8f4e-cfb8a9b99a0c` | ~5% (docs + local Win exe; no public signed release yet) |
| G2 — Pro commerce | `4071fbe3-5f04-4ad1-a4b9-14a689ba300d` | 0% |
| G3 — Product polish | `d12e2fda-8612-4c92-aa35-f8eb0072c815` | Partial (site + Mac UX; screenshots/FAQ open) |
| G4 — Growth | `7942f808-5cf9-420a-beeb-0a6d3ad608dc` | 25% (RON-375 Done) |

## G1 — Install trust (critical path)

| ID | Issue | State · Priority | Notes 2026-08-05 |
|----|-------|------------------|------------------|
| RON-359 | G1-01 Enroll Apple Developer Program ($99) | Todo · Urgent | Human; enroll when ready |
| RON-360 | G1-02 Developer ID Application cert + signed Mac build | Todo · Urgent | After RON-359 |
| RON-361 | G1-03 Notarize Mac release zip | Todo · Urgent | After RON-360 |
| RON-362 | G1-04 Windows code signing or document SmartScreen | Todo · High | **Partial:** friend-test unsigned; document SmartScreen |
| RON-363 | G1-05 Clean-machine install smoke from Releases (Mac + Win) | Todo · Urgent | **Blocked by RON-379** |
| RON-379 | G1-06 Publish clutterdock repo + release assets | Todo · Urgent | **NEXT:** tag + GitHub Release (unsigned beta OK) |

## G2 — Pro commerce

| ID | Issue | State · Priority |
|----|-------|------------------|
| RON-364 | G2-01 Choose merchant Lemon Squeezy / Gumroad / Paddle | Todo · Urgent |
| RON-365 | G2-02 Create Pro $14.99 + Multi $29 products | Todo · Urgent |
| RON-366 | G2-03 Auto-email license key on purchase (SDPRO-XXXX) | Todo · Urgent |
| RON-367 | G2-04 Wire site Unlock Pro to checkout URL | Todo · Urgent |
| RON-368 | G2-05 Optional webhook key generation | Todo · Low |

## G3 — Product polish

| ID | Issue | State |
|----|-------|-------|
| RON-369 | G3-01 Homepage screenshots / launcher GIF | Todo · High — use **real** Mac 1.4.3 UI only |
| RON-370 | G3-02 Install FAQ Gatekeeper + SmartScreen | Todo · High — **do soon** (unblocks friend installs) |
| RON-371 | G3-03 Support contact / GitHub Issues link on site | Todo · Medium |
| RON-372 | G3-04 Direct asset download links on site | Todo · Low — blocked by RON-379; site is Coming soon for now |
| RON-373 | G3-05 Terms of use for Pro license | Todo · Low |
| RON-380 | G3-06 Mac launcher polish 1.4.x | **Done** — 1.4.1–1.4.3, commits `9d2d107`…`f40d374` |
| RON-381 | G3-07 Windows friend-test portable build | **Done** — `ClutterDock-1.1.1-x64.exe` portable, unsigned |
| RON-382 | G3-08 Windows launcher UX parity with Mac 1.4 | Backlog · Low |

## G4 — Growth

| ID | Issue | State |
|----|-------|-------|
| RON-374 | G4-01 Soft launch posts | Todo · High — **blocked by RON-363** |
| RON-375 | G4-02 Rebrand decision | **Done** — ClutterDock |
| RON-376 | G4-03 Homebrew cask | Todo · Low — **blocked by RON-361** |
| RON-377 | G4-04 iCloud/OneDrive sync Pro pillar | Backlog · Low |

## Linear MCP note

If Linear MCP is not authenticated in Grok, apply updates manually from [ROADMAP_NOW.md](ROADMAP_NOW.md) or:

```bash
export LINEAR_API_KEY="lin_api_..."
# Personal key: Linear → Settings → Account → Security & access
```
