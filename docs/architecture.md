# Architecture

radboard is a single-window Tauri 2 desktop app for managing Radicle issues, patches, worktrees, notifications, and files across multiple repos. The Rust backend talks to a local Radicle node via the `radicle` crate (v0.21); the React 19 frontend polls and renders.

## Components

```
┌──────────────────────────────────────────────────────────┐
│  Frontend (React 19 + TypeScript, src/)                  │
│                                                          │
│   App.tsx ── owns polling, repo switching, view routing  │
│     │                                                    │
│     ├── RepoContext, ActionsContext, TerminalContext     │
│     │                                                    │
│     └── Views: kanban · issues · patches · worktrees ·   │
│               files · inbox · patch-files · terminal     │
│                                                          │
└────────────────────────┬─────────────────────────────────┘
                         │ Tauri IPC (commands + events)
┌────────────────────────┴─────────────────────────────────┐
│  Backend (Rust, src-tauri/)                              │
│                                                          │
│   lib.rs ── app setup, registers ~40 commands, owns      │
│             PtyRegistry for terminal sessions            │
│                                                          │
│   commands/  config · identity · issues · patches ·      │
│              files · worktrees · notifications · terminal│
│                                                          │
│   helpers.rs ── Profile access, alias resolution,        │
│                 reaction aggregation, comment threads    │
│                                                          │
└────────────────────────┬─────────────────────────────────┘
                         │ radicle crate (v0.21)
                ┌────────┴────────┐
                │ Local Radicle   │
                │ storage + node  │
                └─────────────────┘
```

## Frontend (`src/`)

- **App.tsx** — central orchestrator (~1200 lines). Owns all polling timers (issues / patches at 60 s, notifications at 30 s — see [ADR-0003](adr/0003-polling-based-sync.md)), context providers, and view routing.
- **State** — React Context + local `useState`. No Redux/Zustand. See [ADR-0002](adr/0002-react-context-state-management.md).
- **Views** — seven tab views: `kanban`, `issues`, `patches`, `worktrees`, `files`, `inbox`, `patch-files`.
- **Components** — organized by feature under `src/components/` (kanban, issues, patches, files, worktrees, terminal, inbox, settings, welcome, shared).
- **Kanban columns** — derived dynamically from `state:*` labels via `issuesToColumns()`. `Open` and `Closed` are always present. Order/colors live in `LocalConfig`. See [ADR-0007](adr/0007-dynamic-state-columns.md). The Open column is sub-ordered by `priority:critical|high|medium|low` labels.
- **Milestones** — labels matching `LocalConfig.milestonePrefix` (default `"milestone:"`) group issues into milestones with progress bars. Prefix is per-board (lives in the home repo's `LocalConfig`).
- **Cosmetic label variants** — a small allow-list maps specific label texts (`refactor`, `dedup`, `inconsistency`) to CSS badge styles.
- **Patch ↔ issue linking** — regex scan for `/[0-9a-f]{7}/gi` over patch titles and descriptions; see [ADR-0006](adr/0006-patch-issue-linking-via-hex7.md).
- **Window chrome** — `decorations: false`; a `WindowControls` component renders min/max/close.

## Backend (`src-tauri/`)

| File | Lines | Responsibility |
|------|------:|----------------|
| `lib.rs` | — | Tauri app setup, command registration, `PtyRegistry` |
| `commands/config.rs` | ~44 | Load/save `LocalConfig`, `get_rad_home` |
| `commands/identity.rs` | ~154 | Profile, alias resolution, DID lookup |
| `commands/issues.rs` | ~240 | List/get/create/edit issues, comments, reactions |
| `commands/patches.rs` | ~307 | List/get patches, reviews, reactions |
| `commands/notifications.rs` | ~247 | Per-repo + global inbox |
| `commands/files.rs` | ~340 | File browser, blame, commit log, diff |
| `commands/worktrees.rs` | ~806 | Git worktree management (largest module) |
| `commands/terminal.rs` | ~116 | PTY spawn/write/resize/kill |
| `helpers.rs` | — | Shared Profile, alias, reaction, comment-thread helpers |
| `types.rs` | — | All serde types shared with frontend (`LocalConfig`, `IssueData`, `PatchData`, `CommentData`, …) |

All Radicle operations go through `helpers.rs` for profile/node access. Async work uses `tauri::async_runtime::spawn_blocking`.

## Data flow (one refresh cycle)

1. Frontend timer fires (30 s notifications or 60 s issues/patches).
2. `App.tsx` invokes a Tauri command (`list_issues`, `list_patches`, `list_global_notifications`).
3. Backend opens the Radicle profile, reads the relevant COBs via `radicle` crate.
4. `helpers.rs` resolves author aliases, aggregates reactions, builds comment threads.
5. Backend returns serde-serializable types from `types.rs`.
6. `App.tsx` runs `issuesToColumns()` to produce the kanban model, rebuilds the patch↔issue index, and notifies context consumers.
7. Views re-render the parts they subscribe to.

## Config

`LocalConfig` (persisted via Tauri commands into the app data dir) stores:

- `home_repo_rid` — the single source of truth for board identity. See [ADR-0004](adr/0004-home-repo-rid-as-config-root.md).
- Column order and colors.
- Banned users (each with a `scope`: `'all'`, `'issues'`, or `'comments'`).
- `milestonePrefix` (default `"milestone:"`).
- `inboxPageSize` (default 50).
- Per-repo settings: local path and preferred editor.

Theme (dark/light) and zoom (80%–120%) persist to `localStorage`, *not* `LocalConfig` — they're per-machine UI preferences. Board config is **not** stored per-repo. Changing the home RID resets board layout.

## Terminal

`portable-pty` (backend) + `xterm.js` (frontend) bridged over Tauri commands. Backend keeps an `Arc<Mutex<HashMap<id, PtySession>>>`. See [ADR-0005](adr/0005-pty-terminal.md).

## Identity and first-run

The backend reads a Radicle profile from `$RAD_HOME` (default `~/.radicle`) via `commands/identity.rs`. If no profile is found, the welcome flow (`src/components/welcome/`) walks the user through three steps:

1. **NoIdentity** — instructs the user to run `rad auth`; the app polls until a profile appears.
2. **RepoPicker** — lists repos visible to the profile; `find_local_repo()` pre-fills the local path for each (see [ADR-0011](adr/0011-worktree-sibling-layout.md)).
3. **EditorPicker** — picks the editor command used to launch a worktree after creation.

`check_gsettings()` in `commands/identity.rs` sets `GSETTINGS_SCHEMA_DIR` on Unix when the GTK file picker schemas aren't on the standard path — NixOS workaround.

## Worktrees

`create_patch_worktree()` creates a sibling directory of the main clone (`<parent>/<branch_name>`) via `git worktree add`. `commit_and_create_patch()` injects a temporary `GIT_EDITOR` shell script to supply the patch message non-interactively, then runs `git push rad HEAD:refs/patches`. Discovery and layout details: [ADR-0011](adr/0011-worktree-sibling-layout.md).

## Notifications

Two scopes:

- **Per-repo** — `list_notifications` for the currently selected repo, surfaced in that repo's inbox tab.
- **Global** — `list_global_notifications` aggregates across all tracked repos; powers the global inbox view.

`NotificationData` carries `status` (`unread`/`read`), `kind` (`issue`/`patch`/`branch`/`tag`/`unknown`), and `event_kind` (e.g. `new_issue`, `comment`, `revision`). Pagination uses `inboxPageSize` (default 50).

## Files view

Tree navigation plus a blob viewer with blame, diff, and commit-log modes. The commit log lazy-loads in 50-entry pages and groups entries by day. Untracked file diffs use `git diff --no-index /dev/null <file>` (so newly-added files render the same way as tracked ones).

## Environment variables

| Var | Direction | Purpose |
|-----|-----------|---------|
| `RAD_HOME` | read | Radicle profile location (default `~/.radicle`). Required. |
| `GSETTINGS_SCHEMA_DIR` | set by app | GTK file picker schemas — Unix-only workaround (`check_gsettings`). |
| `GIT_EDITOR` | set by app | Injected by `commit_and_create_patch` for non-interactive patch creation. |

No compile-time feature flags. Build is monolithic.

## Build & release pipeline (summary)

Three version manifests (`package.json`, `tauri.conf.json`, `Cargo.toml`) are synced atomically by `make release`, which also regenerates `CHANGELOG.md` via `git-cliff` and pushes to both `origin` (GitHub) and `rad` (Radicle). See [ADR-0009](adr/0009-version-sync-via-makefile.md) and [ADR-0008](adr/0008-radicle-canonical-github-mirror.md). Local reproducible builds use a Debian Bookworm Docker image (`Dockerfile.build`, [ADR-0010](adr/0010-docker-reproducible-build.md)).

## Where to look next

- [`engineering-workflow.md`](engineering-workflow.md) — local dev, verification, release steps.
- [`adr/README.md`](adr/README.md) — the decisions behind the structure above.
- [`AGENTS.md`](../AGENTS.md) — repo-specific gotchas for contributors and coding agents.
