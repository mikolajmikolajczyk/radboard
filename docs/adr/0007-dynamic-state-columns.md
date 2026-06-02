# ADR-0007: Label-driven view conventions (`state:*`, `priority:*`, `milestone:*`)

- **Status:** Accepted
- **Date:** 2026-03-31
- **Deciders:** Mikołaj
- **Tags:** kanban, ux

## Context

Different projects want different workflow stages (`triage`, `in-progress`, `review`, `blocked`, etc.). Hardcoding columns forces every user into the same shape. A schema for columns lives nowhere in Radicle.

## Decision drivers

- Use Radicle's existing primitives (labels) instead of inventing a parallel system.
- Lets users add/rename columns by labelling — no app update required.
- `Open` and `Closed` are universal — never user-defined.

## Considered options

1. Hardcoded column set per app version.
2. Per-board column list stored in `LocalConfig`, independent of issue labels.
3. Convention: labels matching `state:*` create dynamic columns; issue moves into a column by gaining/losing the label.

## Decision outcome

Chosen: **label-prefix conventions** across the app. The frontend parses several reserved prefixes:

- **`state:*`** — drives kanban column membership. `issuesToColumns()` in `App.tsx` derives the column set from observed labels. `Open` and `Closed` are always present and bracket the dynamic columns. Column **order** and **color** are stored in `LocalConfig` (see ADR-0004).
- **`priority:critical|high|medium|low`** — only these four values; orders the Open column.
- **`milestone:*`** (prefix **configurable** via `milestonePrefix` in `LocalConfig`, default `"milestone:"`) — groups issues into milestones with progress bars. Semver values (`v1.0.0`) sort ascending; numeric prefixes (`0-alpha`) are stripped + title-cased for display; everything else alphabetical. See `src/components/milestones/MilestonesView.tsx`.
- **Cosmetic label variants** — a small allow-list (`refactor`, `dedup`, `inconsistency` at the time of writing) maps to CSS classes for badge styling. Unknown labels get default styling, no warning. See `src/App.tsx` (`labelVariant` map).

### Positive consequences

- Workflow stages, priorities, and milestones are CLI-editable via `rad label`.
- Power users can extend; casual users see only `Open`/`Closed` and unstyled labels.
- One convention, multiple views.

### Negative consequences

- Typos create one-off columns / milestones. UI helps but doesn't enforce.
- Removing the last issue with a given `state:*` label leaves the column visible until the next refresh prunes it.
- The cosmetic variant allow-list lives in code; adding a new badge style needs a code change.

### Follow-up

- The Open column priority ordering was introduced 2026-04-08 (`4ae37cd` lineage).
- Milestones were introduced 2026-04-21 (commit `76eed94`). Considered part of this same convention — if the milestone prefix needs to vary per *board*, store it inside the home repo config blob (see ADR-0004) rather than splitting it out.

## Links

- `src/App.tsx` (search for `issuesToColumns`, `state:`)
- Introducing commit: `63761e4` (feat: First stable beta release, 2026-03-31)
- Priority zones extension: 2026-04-08
