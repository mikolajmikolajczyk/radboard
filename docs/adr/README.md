# Architecture Decision Records

Load-bearing decisions for radboard. One ADR per decision, written as a snapshot of why a choice was made at the time. Use [`template.md`](template.md) for new ADRs.

## Index

| # | Title | Date |
|---|-------|------|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | 2026-06-02 |
| [0002](0002-react-context-state-management.md) | React Context as the only state management | 2026-03-31 |
| [0003](0003-polling-based-sync.md) | Polling-based sync against the local Radicle node | 2026-03-31 |
| [0004](0004-home-repo-rid-as-config-root.md) | Home repo RID as single source of truth for board config | 2026-03-31 |
| [0005](0005-pty-terminal.md) | Full PTY terminal via `portable-pty` + xterm.js | 2026-03-31 |
| [0006](0006-patch-issue-linking-via-hex7.md) | Link patches to issues via 7-char hex prefix in title | 2026-03-31 |
| [0007](0007-dynamic-state-columns.md) | Dynamic kanban columns from `state:*` labels | 2026-03-31 |
| [0008](0008-radicle-canonical-github-mirror.md) | Radicle is canonical; GitHub mirror exists only for CI runners | 2026-04-01 |
| [0009](0009-version-sync-via-makefile.md) | Three version manifests synchronized via Makefile | 2026-04-01 |
| [0010](0010-docker-reproducible-build.md) | Docker-based reproducible release build | 2026-04-01 |

## How to add an ADR

1. Copy [`template.md`](template.md) to `NNNN-kebab-title.md` using the next number.
2. Set **Date** to the day the decision was *first made in code* (introducing commit / patch), not the day the ADR was written. Today's date is only correct for the meta-ADR 0001.
3. ADRs are numbered chronologically by introduction date. New ADRs always get the next number (no mid-sequence inserts). If a back-dated ADR ends up out of order with an earlier one, renumber via `git mv` (rename to temp names first to avoid collisions) and update every cross-reference in this README, AGENTS.md, CLAUDE.md, architecture.md, and engineering-workflow.md.
4. Add an index row above.

When you make a non-trivial architectural change, write or supersede an ADR in the same patch.
