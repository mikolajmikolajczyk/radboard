# ADR-0003: Polling-based sync against the local Radicle node

- **Status:** Accepted
- **Date:** 2026-03-31
- **Deciders:** Mikołaj
- **Tags:** sync, backend, frontend

## Context

radboard reads issues, patches, and notifications from the local Radicle storage. Radicle COBs can change from background `rad sync`, the user's CLI, or other clients. The UI must reflect those changes without forcing manual refresh.

## Decision drivers

- Radicle has no built-in subscription API for COB changes.
- Local storage is cheap to re-read; polling is acceptable for desktop cadence.
- Solo-user desktop app, not a high-throughput service.

## Considered options

1. File-system watcher on the COB store, debounced.
2. IPC event when the user runs `rad` CLI (out of scope — we don't control the CLI).
3. Fixed-interval polling per data class.

## Decision outcome

Chosen: **fixed-interval polling** with two cadences:

- **30 s** — notifications (inbox badge needs to feel reactive).
- **60 s** — issues, patches (heavier reads, lower urgency).

Cadence is hardcoded in `App.tsx`; not user-configurable.

### Positive consequences

- Simple, deterministic, no platform-specific watcher code.
- Sync continues even if external tools mutate the store.

### Negative consequences

- Up to 60 s lag for issue/patch changes made outside the app.
- Wakes CPU on idle. Acceptable for desktop; revisit if battery becomes a complaint.

### Follow-up

- If Radicle ships a change-notification API, supersede this ADR with an event-driven design.

## Links

- `src/App.tsx`
- Introducing commit: `63761e4` (feat: First stable beta release, 2026-03-31)
