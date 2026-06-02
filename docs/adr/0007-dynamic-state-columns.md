# ADR-0007: Dynamic kanban columns from `state:*` labels

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

Chosen: **`state:*` label convention**. `issuesToColumns()` in `App.tsx` derives the column set from observed labels. `Open` and `Closed` are always present and bracket the dynamic columns. Column **order** and **color** are stored in `LocalConfig` (see ADR-0004).

### Positive consequences

- Workflow stages are CLI-editable via `rad label`.
- Power users can extend; casual users see `Open`/`Closed` only.

### Negative consequences

- Typos create one-off columns. UI helps but doesn't enforce.
- Removing the last issue with a given `state:*` label leaves the column visible until the next refresh prunes it.

### Follow-up

- The Open column is further ordered by `priority:critical|high|medium|low` labels (introduced 2026-04-08, `4ae37cd` lineage). Considered part of this same convention.

## Links

- `src/App.tsx` (search for `issuesToColumns`, `state:`)
- Introducing commit: `63761e4` (feat: First stable beta release, 2026-03-31)
- Priority zones extension: 2026-04-08
