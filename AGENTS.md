# ClutterDock — Agent instructions

Read `SESSION.md` first for project layout, build commands, and product decisions.
Constraints: no Dock replacement / private Dock APIs; free core stays usable (never paywall launch).

## Self-sufficiency rule (Ronald's standing instruction)

Exhaust every avenue you can act on yourself before handing a step back to
Ronald — a permission error on one path is not a blocker. Enumerate what your
credentials CAN do and build the bridge from there. Precedent: the Claude cloud
environment cannot push tags or dispatch workflows (403), but it can push
branches including workflow files — so releases are cut by pushing
`release/vX.Y.Z`, which the Release workflow turns into the tag + GitHub
Release itself. Only hand back steps that genuinely require Ronald's own
accounts or hardware (Cloudflare `wrangler login`, real-Mac / real-Windows
smoke tests), and when you do, give exact copy-paste commands, never
descriptions.

## Linear sync (do this every session)

Linear is the **source of truth for the backlog**. Git is code. Keep them in sync using the Linear MCP (`mcp.linear.app`).

- **Project:** ClutterDock — V1 Public Launch — https://linear.app/rbakman/project/clutterdock-v1-public-launch-9720be94b795
- **Team:** RON · **Milestones:** G0 — Foundation · G1 — Install trust · G2 — Pro commerce · G3 — Product polish · G4 — Growth

Protocol:

1. **Session start:** list the project's In Progress / Todo issues so you know where work stands.
2. **Starting a task:** move its issue to **In Progress**. If no issue exists, create one on team RON in the right milestone, titled `G#-## Short name` (continue the numbering).
3. **Finishing a task:** move the issue to **Done** and add a comment with evidence — commit hash, release/PR link, or file paths touched.
4. **Commits/branches:** reference the issue ID (e.g. `RON-363`) in commit messages and branch names.
5. **Discovered work / bugs:** create an issue immediately (milestone by area, Backlog state if not near-term) rather than keeping a local TODO.
6. **Session end:** make sure nothing you shipped is still sitting in Todo/In Progress.

If the Linear MCP is not authenticated, say so and continue working — Ronald completes OAuth via `/mcp` in Grok.

### Issue map (synced 2026-08-06)

| Milestone | Issues | State |
|-----------|--------|-------|
| G0 — Foundation | RON-352 … RON-358, RON-378 | **Done** |
| G1 — Install trust | RON-359…363 Todo · **RON-379 Done** (public repo + Releases) | Trust path open |
| G2 — Pro commerce | RON-364…368, RON-415 | **Todo** — merchant not set up; do not start until ready to sell |
| G3 — Product polish | RON-369,372,373 open · **370,371,380,381,410–412 Done** · 382/413/414 Backlog | Site Coming soon |
| G4 — Growth | RON-374 Todo · **375 Done** · 376 Todo · 377 Backlog | Soft launch after smoke |

Dependencies: RON-360←359 · RON-361←360 · RON-365←364 · RON-366/367←365 · RON-374←363 · RON-376←361 · RON-413←361.  
**RON-372** = re-enable site downloads when ready (assets already on Releases).  
Full table: `docs/LINEAR_LIVE.md`.

## Cursor Cloud specific instructions

This repo has three products; the cloud VM is **Linux**, so scope differs by product:

- **macOS app** (`ClutterDock/`, Swift/SwiftUI) — **cannot be built or run on Linux** (needs macOS + Xcode; CI builds it on `macos-15`). Skip it here.
- **Windows app** (`windows/`, Electron) — runs on Linux for dev. Deps are npm (`windows/package.json`); the startup update script installs them.
- **Website** (`website/` static assets + root `wrangler.toml` Cloudflare Worker, entry `scripts/site-worker.mjs`) — runs via Wrangler. There is **no root `package.json`**; run Wrangler with `npx` (it downloads on first use).

Run commands (all standard commands live in `README.md`, `windows/README.md`, and `windows/package.json` scripts / `.github/workflows/ci.yml`):

- Windows app dev: `cd windows && DISPLAY=:1 CLUTTER_DOCK_NO_UPDATE=1 npm start -- --no-sandbox`. It is a tray app that auto-opens the launcher panel on first run. On Linux, `--no-sandbox` is required and the `bus.cc`/DBus and `viz_main_impl`/GPU errors in the log are **benign** (no system tray/GPU in the container); the app still works. `CLUTTER_DOCK_NO_UPDATE=1` skips the background auto-update check. Local dev data persists to `~/.config/ClutterDock/ClutterDock/folders.json`.
- Windows tests/lint: `cd windows && npm test` (license + store unit tests) and syntax lint via `for f in src/*.js src/renderer/*.js scripts/*.js; do node --check "$f"; done`. `npm test` does **not** need a license secret (a dev fallback is used); the "corrupt folders.json" load error printed during `test-store.js` is an intentional test case, not a failure.
- Website dev: from repo root `npx --yes wrangler@latest dev --port 8787 --local`, then browse `http://localhost:8787`. On localhost the worker serves assets directly (200); the non-canonical-host → `clutterdock.com` 301 redirect only fires for real hosts. Cloudflare Assets 307-redirects `/page.html` → `/page` (extensionless), which is expected. Website "tests" are the link-check in `.github/workflows/ci.yml` (`site` job).
