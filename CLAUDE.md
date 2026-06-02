# CLAUDE.md

Read [`AGENTS.md`](AGENTS.md) first. This file is a pointer.

## Documentation map

- [`AGENTS.md`](AGENTS.md) — repo-specific gotchas; start here.
- [`docs/architecture.md`](docs/architecture.md) — components, data flow, runtime layout.
- [`docs/engineering-workflow.md`](docs/engineering-workflow.md) — dev setup, verification, release.
- [`docs/adr/`](docs/adr/) — load-bearing architecture decisions.

## Architecture decisions

- [ADR-0001](docs/adr/0001-record-architecture-decisions.md) — Record architecture decisions (meta).
- [ADR-0002](docs/adr/0002-react-context-state-management.md) — React Context only; no Redux/Zustand.
- [ADR-0003](docs/adr/0003-polling-based-sync.md) — Polling: 60 s issues/patches, 30 s notifications.
- [ADR-0004](docs/adr/0004-home-repo-rid-as-config-root.md) — Home repo RID is the single source of truth for board config.
- [ADR-0005](docs/adr/0005-pty-terminal.md) — Full PTY via `portable-pty` + xterm.js.
- [ADR-0006](docs/adr/0006-patch-issue-linking-via-hex7.md) — Patches link to issues by 7-char hex prefix in title.
- [ADR-0007](docs/adr/0007-dynamic-state-columns.md) — Label conventions: `state:*`, `priority:*`, `milestone:*` (configurable prefix), cosmetic variants.
- [ADR-0008](docs/adr/0008-radicle-canonical-github-mirror.md) — Radicle canonical; GitHub mirror is CI-only.
- [ADR-0009](docs/adr/0009-version-sync-via-makefile.md) — Three version manifests synced via `make release`.
- [ADR-0010](docs/adr/0010-docker-reproducible-build.md) — Docker-based reproducible release build.
- [ADR-0011](docs/adr/0011-worktree-sibling-layout.md) — Worktrees are siblings of the main clone; local repos via shallow `$HOME` scan.

## Quick reminders

- Contribution = Radicle **patch**, not GitHub PR. GitHub is a CI mirror.
- `App.tsx` is intentionally one big orchestrator. Don't introduce Redux/Zustand to "fix" it.
- Polling cadence is hardcoded. Don't make it configurable without an ADR.
- Bump versions only via `make release` — three files must stay in sync.
- Never edit `CHANGELOG.md` by hand; `git-cliff` regenerates it.
- Conventional Commits required for changelog inclusion.
- On non-NixOS + NVIDIA, skip `nix develop` and use system `pnpm` + `rustup`.
- Milestone label prefix is **configurable** (`LocalConfig.milestonePrefix`) — don't hardcode `"milestone:"`.
- `find_local_repo` only scans `$HOME` one level deep — repos elsewhere need a manual path.
- Banned users have a **scope** (`all` / `issues` / `comments`); treat as enum, not boolean.
