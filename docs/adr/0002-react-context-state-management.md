# ADR-0002: React Context as the only state management

- **Status:** Accepted
- **Date:** 2026-03-31
- **Deciders:** Mikołaj
- **Tags:** frontend, state

## Context

radboard is a single-window desktop app with seven views and shared cross-view state (current repo, issues, patches, notifications, terminal sessions). Frontend frameworks for this kind of state range from Redux/Zustand/Jotai to plain Context + `useState`.

## Decision drivers

- Single process, single window — no SSR, no network state hydration.
- Backend (Tauri) holds the canonical state; frontend is a view that polls and dispatches commands.
- One developer; minimize cognitive overhead and dep count.

## Considered options

1. Redux Toolkit
2. Zustand / Jotai
3. React Context + local `useState` only

## Decision outcome

Chosen: **Context + `useState`**. `App.tsx` is the central orchestrator (~1200 lines): it owns all polling timers, builds `RepoContext` / `ActionsContext` / `TerminalContext`, and routes between views.

### Positive consequences

- Zero state-library dependency or boilerplate.
- All sync logic lives in one file — easy to audit polling and refresh flows.

### Negative consequences

- `App.tsx` is large. Splitting it without re-introducing a state library is the open tradeoff.
- Re-render scope is whatever the context provides; granular subscriptions need manual `useMemo` discipline.

### Follow-up

- If `App.tsx` exceeds tolerance, prefer splitting into context-owning sub-modules over adopting Redux/Zustand.

## Links

- `src/App.tsx`
- Introducing commit: `63761e4` (feat: First stable beta release, 2026-03-31)
