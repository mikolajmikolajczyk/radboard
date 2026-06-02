# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-06-02
- **Deciders:** Mikołaj
- **Tags:** meta

## Context

radboard already embeds several non-obvious structural choices (polling cadence, patch↔issue linking by hex prefix, home repo RID as config root, PTY terminal, triple version manifest). Without written rationale, future contributors — and future me — will rediscover these by reverse-engineering code or repeat past mistakes.

## Decision

Keep one ADR per load-bearing decision under `docs/adr/`. Number chronologically by the date the decision first landed in the codebase. Reference introducing commits in **Links**. Use [`template.md`](template.md).

## Consequences

### Positive

- New contributors get the "why" without spelunking git history.
- Changing a decision means superseding an ADR, not just editing code.

### Negative

- Slight write overhead per architectural change.
- ADRs go stale if not maintained — kept in sync via the engineering workflow doc.

## Links

- [`docs/adr/README.md`](README.md)
- [`docs/engineering-workflow.md`](../engineering-workflow.md)
