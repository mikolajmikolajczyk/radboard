# ADR-0006: Link patches to issues via 7-char hex prefix in title

- **Status:** Accepted
- **Date:** 2026-03-31
- **Deciders:** Mikołaj
- **Tags:** sync, ux

## Context

Radicle patches and issues are independent COBs. Both have 56-char hex IDs. The kanban view wants to surface "this issue has open patches" without forcing the user to maintain explicit references in a separate index.

## Decision drivers

- Radicle has no native patch↔issue relation field.
- Users already paste short hashes into commit messages and titles.
- The linkage must survive editing and round-trip through `rad` CLI users.

## Considered options

1. Maintain a per-board index COB recording explicit links.
2. Parse issue/patch references from a structured custom field added on top.
3. Convention: include the issue ID's 7-char prefix anywhere in the patch title or description; scan for the regex `[0-9a-f]{7}` on the frontend.

## Decision outcome

Chosen: **7-char hex prefix scan**. On every refresh, frontend regex-matches each patch's title and description for `/[0-9a-f]{7}/gi` and builds an inverted index `issueId → patches[]`.

### Positive consequences

- Zero schema changes; works with any Radicle client.
- Cheap on the frontend; matches O(patches × matches/patch).
- Authors who *don't* link don't pay any cost.

### Negative consequences

- Collisions theoretically possible (1 in 2²⁸). In practice none observed.
- Linkage is implicit — a user editing a title can silently break the link.
- Any 7 hex chars in a title looks like a link, including coincidental tokens.

### Follow-up

- If Radicle ships native patch↔issue relations, supersede this ADR and migrate.

## Links

- `src/App.tsx` (search for `HEX7`)
- Introducing commit: `63761e4` (feat: First stable beta release, 2026-03-31)
