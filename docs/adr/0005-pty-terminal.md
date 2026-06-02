# ADR-0005: Full PTY terminal via `portable-pty` + xterm.js

- **Status:** Accepted
- **Date:** 2026-03-31
- **Deciders:** Mikołaj
- **Tags:** terminal, backend

## Context

Patch review and worktree workflows need a real shell — running `rad`, editors, `git diff`, build commands. A "stdout viewer" or command runner is not enough; interactive TUI programs must work (vim, htop, etc.).

## Decision drivers

- Must support full TTY semantics (raw mode, alternate screen, resize signals).
- Must run multiple sessions in parallel (one per repo / per worktree).
- Stay within Tauri's IPC model — no extra daemon.

## Considered options

1. Spawn `bash -c "<cmd>"` and stream stdout/stderr only.
2. Embed a JS-only emulator with a fake shell.
3. Real PTY: `portable-pty` (Rust) backend + xterm.js (frontend) bridged over Tauri events.

## Decision outcome

Chosen: **portable-pty + xterm.js**. Backend keeps a `PtyRegistry` (`Arc<Mutex<HashMap<id, PtySession>>>`); frontend renders xterm.js and round-trips bytes through Tauri commands (`pty_spawn`, `pty_write`, `pty_resize`, `pty_kill`).

### Positive consequences

- Real shells, real TUIs, accurate resize.
- Cross-platform via `portable-pty`.

### Negative consequences

- Bytes flow through IPC for every keystroke and output chunk — measurable overhead on heavy output.
- Sessions are process-scoped; killing radboard kills all PTYs.

### Follow-up

- If IPC throughput becomes a bottleneck, batch reads on the backend before emitting.

## Links

- `src-tauri/src/commands/terminal.rs`
- `src/components/terminal/`
- Introducing commit: `63761e4` (feat: First stable beta release, 2026-03-31)
