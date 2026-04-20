# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is radboard

Desktop Kanban board for Radicle repositories. Built with Tauri 2 (Rust backend) + React 19 (TypeScript frontend). Manages issues, patches, worktrees, notifications, and file browsing across multiple Radicle repos.

## Commands

```bash
pnpm dev              # Vite dev server (port 1420)
pnpm tauri dev        # Full dev environment with hot-reload
pnpm build            # Build frontend (tsc + vite build)
make build            # Docker-based production build
make release          # Tag release, bump versions, push to origin + rad
```

No test suite or linter configured.

## Architecture

### Frontend (`src/`)

**App.tsx** is the central orchestrator (~1200 lines). Manages all app state, repo switching, data polling (60s issues/patches, 30s notifications), and view routing.

Seven main views rendered via tab system: `kanban`, `issues`, `patches`, `worktrees`, `files`, `inbox`, `patch-files`.

State management: React Context (`RepoContext`, `ActionsContext`, `TerminalContext`) + local useState. No external state library.

Key data flow: raw issues from Radicle → `issuesToColumns()` in App.tsx → Kanban columns. Dynamic columns created from `state:*` labels. Priority zones order the Open column (critical → high → medium → low).

Components organized by feature under `src/components/` (kanban, issues, patches, files, worktrees, terminal, inbox, settings, welcome, shared).

### Backend (`src-tauri/`)

- **lib.rs** — Tauri app setup, registers 40+ commands, manages PtyRegistry for terminal sessions
- **commands/** — One file per domain: issues, patches, files, worktrees, notifications, terminal, config, identity
- **types.rs** — All serializable data types shared with frontend (LocalConfig, IssueData, PatchData, CommentData, etc.)
- **helpers.rs** — Radicle profile access, author alias resolution, reaction aggregation, comment thread building

Backend talks to Radicle via the `radicle` crate (v0.21). All Radicle operations go through helpers.rs for profile/node access.

### Config

LocalConfig (persisted via Tauri commands) stores: home repo RID, column order/colors, banned users. The home repo RID is the source of truth — board config lives in one repo, not per-repo.

### Key patterns

- Patches linked to issues via 7-char hex prefix matching in titles
- Comments support threading (replies) and emoji reactions
- Worktree management wraps git worktrees for patch-based development
- Terminal uses portable-pty crate with xterm.js frontend
- Window has no native decorations (custom title bar)
