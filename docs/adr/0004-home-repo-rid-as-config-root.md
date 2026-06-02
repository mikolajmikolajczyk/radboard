# ADR-0004: Home repo RID as single source of truth for board config

- **Status:** Accepted
- **Date:** 2026-03-31
- **Deciders:** Mikołaj
- **Tags:** config, multi-repo

## Context

radboard tracks issues across multiple Radicle repos but presents a single kanban board. Board state — column order, column colors, banned users, etc. — must persist. Two natural homes: per-repo (config inside each tracked repo) or central (one designated "home" repo).

## Decision drivers

- The board is the user's view, not a property of any single repo.
- Per-repo config would force conflict resolution across repos and re-key every config write.
- Storing in plain local files (outside Radicle) loses the config when moving machines.

## Considered options

1. Per-repo config blob stored in each repo's COB store.
2. Local-only config (Tauri app data dir) — no replication.
3. Designated "home repo" RID; all board config persists locally but is keyed/scoped by that RID.

## Decision outcome

Chosen: **home repo RID** stored in `LocalConfig` (Tauri app data). The home RID is the only piece of identity needed; column order, colors, banned users hang off it. Changing the home repo resets board layout.

### Positive consequences

- Single config blob, single read on startup.
- No per-repo schema versioning required.
- Switching home repo is a single setting change.

### Negative consequences

- Board layout doesn't follow the user across machines unless they re-set the home RID. Acceptable for now.
- Two users on the same home RID would have independent boards.

### Follow-up

- If multi-machine sync becomes desired, store `LocalConfig` *inside* the home repo as a private COB and supersede this ADR.

## Links

- `src-tauri/src/types.rs` (`LocalConfig`)
- `src-tauri/src/commands/config.rs`
- Introducing commit: `63761e4` (feat: First stable beta release, 2026-03-31)
