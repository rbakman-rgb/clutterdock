# ClutterDock — Agent instructions

Read `SESSION.md` first for project layout, build commands, and product decisions.
Constraints: no Dock replacement / private Dock APIs; free core stays usable (never paywall launch).

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

## Design explorations

Launcher UI/UX directions (**RON-488**): `docs/design-options/` — local review gallery, not shipped to clutterdock.com. Serve with `python3 -m http.server 8765 --directory docs/design-options`.
