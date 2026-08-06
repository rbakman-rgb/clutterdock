# ClutterDock — Agent instructions

Read `SESSION.md` first for project layout, build commands, and product decisions.
Constraints: no Dock replacement / private Dock APIs; free core stays usable (never paywall launch).

## Linear sync (do this every session)

Linear is the **source of truth for the backlog**. Git is code. Keep them in sync using the Linear MCP (`mcp.linear.app`).

- **Project:** ClutterDock — V1 Public Launch — https://linear.app/rbakman/project/slavedock-v1-public-launch-9720be94b795
- **Team:** RON · **Milestones:** G0 — Foundation · G1 — Install trust · G2 — Pro commerce · G3 — Product polish · G4 — Growth

Protocol:

1. **Session start:** list the project's In Progress / Todo issues so you know where work stands.
2. **Starting a task:** move its issue to **In Progress**. If no issue exists, create one on team RON in the right milestone, titled `G#-## Short name` (continue the numbering).
3. **Finishing a task:** move the issue to **Done** and add a comment with evidence — commit hash, release/PR link, or file paths touched.
4. **Commits/branches:** reference the issue ID (e.g. `RON-363`) in commit messages and branch names.
5. **Discovered work / bugs:** create an issue immediately (milestone by area, Backlog state if not near-term) rather than keeping a local TODO.
6. **Session end:** make sure nothing you shipped is still sitting in Todo/In Progress.

If the Linear MCP is not authenticated, say so and continue working — Ronald completes OAuth via `/mcp` in Grok.

### Issue map (created 2026-08-05)

| Milestone | Issues | State |
|-----------|--------|-------|
| G0 — Foundation | RON-352 … RON-358, RON-378 | Done (incl. site live on Cloudflare) |
| G1 — Install trust | RON-359 … RON-363, RON-379 | Todo (mostly Urgent) |
| G2 — Pro commerce | RON-364 … RON-368 | Todo (mostly Urgent) |
| G3 — Product polish | RON-369 … RON-373, RON-380–382 | Todo (380/381 Done; 382 Backlog) |
| G4 — Growth | RON-374 … RON-377 | Todo / Backlog (RON-375 rebrand Done) |

Dependencies already in Linear: RON-374 (soft launch) blocked by RON-363 (clean-machine smoke); RON-376 (Homebrew cask) blocked by RON-361 (notarization); RON-363 and RON-372 blocked by RON-379 (publish clutterdock repo + releases — repo is currently private with no releases).
Full title-by-title table with project/milestone IDs: `docs/LINEAR_LIVE.md` (also `docs/LINEAR.md`).
