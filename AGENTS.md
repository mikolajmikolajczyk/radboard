# AGENTS.md

Repo-specific gotchas for humans and coding agents. Generic software-engineering advice is out of scope — read it elsewhere.

## Repo shape

- Tauri 2 (Rust) backend + React 19 (TypeScript) frontend.
- Single window, seven views (`kanban`, `issues`, `patches`, `worktrees`, `files`, `inbox`, `patch-files`).
- Backend talks to a local Radicle node via the `radicle` crate (v0.21).
- Solo project; canonical repo on Radicle, GitHub is a CI-only mirror (see [ADR-0008](docs/adr/0008-radicle-canonical-github-mirror.md)).

Full layout: [`docs/architecture.md`](docs/architecture.md).

## Local dev

```bash
nix develop              # provides node 22, pnpm 10, rust stable, tauri deps
pnpm install             # first time
pnpm tauri dev
```

On non-NixOS + NVIDIA the nix devShell breaks WebKitGTK with `EGL_BAD_PARAMETER`. Use system-installed `pnpm` and `rustup` instead.

## Verification before submitting a patch

```bash
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
```

No tests, no linter. CI builds release artifacts only.

## Patch / branch / release conventions

- Contribution = Radicle **patch**, not GitHub PR.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `release:`). `git-cliff` ignores non-conforming commits.
- Releases via `make release` (bumps three version files atomically; see [ADR-0009](docs/adr/0009-version-sync-via-makefile.md)).
- Tag push triggers `.github/workflows/release.yml`; artifacts SCP to project VPS.
- `master` is the working branch; no enforced feature-branch convention.

## Component quirks

- **`src/App.tsx`** is ~1200 lines and owns *all* polling, repo switching, and tab routing. This is intentional ([ADR-0002](docs/adr/0002-react-context-state-management.md)). Don't split it by introducing Redux/Zustand — split by extracting context-owning sub-modules.
- **Polling cadence is hardcoded**: 60 s issues/patches, 30 s notifications ([ADR-0003](docs/adr/0003-polling-based-sync.md)). Not user-configurable.
- **Patches link to issues via 7-char hex prefix** in the patch title or description. Regex `/[0-9a-f]{7}/gi` ([ADR-0006](docs/adr/0006-patch-issue-linking-via-hex7.md)). Coincidental hex tokens *will* create false links.
- **Board config** (column order, colors, banned users, milestone prefix, inbox page size) is keyed off the **home repo RID** stored in `LocalConfig`, not per-repo. Changing the home repo resets layout. See [ADR-0004](docs/adr/0004-home-repo-rid-as-config-root.md).
- **No native title bar** (`decorations: false` in `tauri.conf.json`). `WindowControls` component renders min/max/close.
- **Terminal** is a real PTY (`portable-pty` + `xterm.js`) bridged over Tauri IPC ([ADR-0005](docs/adr/0005-pty-terminal.md)). Backend keeps an `Arc<Mutex<HashMap<id, PtySession>>>`; killing the app kills all sessions.
- **All backend commands** live under `src-tauri/src/commands/` (one file per domain). Shared types in `src-tauri/src/types.rs`. Radicle / profile / alias logic in `src-tauri/src/helpers.rs`.

## Label conventions ([ADR-0007](docs/adr/0007-dynamic-state-columns.md))

Several label prefixes are reserved and parsed by the frontend:

- **`state:*`** — kanban column membership. `Open` and `Closed` are always present and bracket the dynamic columns.
- **`priority:critical|high|medium|low`** — only these four values; sub-orders the Open column. Anything else is ignored.
- **`milestone:*`** — milestone grouping with progress bars. **The prefix is configurable** via `LocalConfig.milestonePrefix` (default `"milestone:"`). Semver values sort ascending; numeric-prefixed values get title-cased; everything else alphabetical.
- **Cosmetic variants** — a hardcoded allow-list in `src/App.tsx` maps a few label texts (`refactor`, `dedup`, `inconsistency`) to CSS classes for badge styling. Unknown labels render with default style. Adding a new badge style needs a code change.

## Worktrees ([ADR-0011](docs/adr/0011-worktree-sibling-layout.md))

- Worktrees are created as **siblings of the main clone**: `<parent(main_repo)>/<branch_name>`. Not inside `.git/worktrees/`, not under a radboard-managed dir.
- `find_local_repo(rid)` discovers the main clone by **shallow scanning `$HOME`** (one level deep), matching the RID string inside each `.git/config`. First match wins; user can override in settings. Repos cloned outside `$HOME` or deeper than one level need a manual path.
- `commit_and_create_patch` writes a temp file with the patch message and injects `GIT_EDITOR=<script>` so the `git push rad HEAD:refs/patches` is non-interactive. If you touch this flow, preserve that pattern.

## Banned users

`LocalConfig.banned` entries each carry a **scope**: `'all'`, `'issues'`, or `'comments'`. Scope is enforced at render/filter time in the frontend — `'all'` hides their issues *and* comments, `'issues'` only hides their issues, `'comments'` only filters comment threads. New filter call sites must check scope; don't silently treat banned as boolean.

## First-run flow

A user with a fresh install lands in `src/components/welcome/` and steps through:

1. **NoIdentity** — `rad auth` must have been run; the app shows the exact command and aborts if no profile is found at `$RAD_HOME` (default `~/.radicle`).
2. **RepoPicker** — lists repos visible to the Radicle profile; for each, `find_local_repo()` pre-fills the local path.
3. **EditorPicker** — preset editors (VS Code, Zed, Neovim, …) plus a custom field. Selected editor is auto-launched after `create_patch_worktree()`.

Reproduce this flow when changing identity, repo, or editor handling.

## Environment variables the backend reads

- **`RAD_HOME`** — Radicle profile location (default `~/.radicle`). Required.
- **`GSETTINGS_SCHEMA_DIR`** — set *by* the app on Unix (`check_gsettings()` workaround) when the GTK file picker schema isn't on the standard path. NixOS workaround; don't unset.
- **`GIT_EDITOR`** — set *by* the app inside `commit_and_create_patch` for non-interactive patch creation.

No compile-time feature flags. Build is monolithic.

## Comments and reactions

- Replies are full nested comment objects (`RawCommentData.replies`), not refs. Depth is unbounded; rendering recurses.
- Reactions are flat per comment: `emoji → [authors]`. No per-author dedup needed; same emoji-author pair is stored once.

## Files you must not edit by hand

- `CHANGELOG.md` — regenerated by `git-cliff` (`cliff.toml`) on each release.
- `Cargo.lock`, `flake.lock`, `pnpm-lock.yaml` — managed by their tools.
- The three version strings (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`) — bump via `make release`, not by hand ([ADR-0009](docs/adr/0009-version-sync-via-makefile.md)).

## Architecture decisions

Load-bearing decisions are documented under [`docs/adr/`](docs/adr/). When you change one of the topics covered there, write or supersede the corresponding ADR in the same patch. List of areas requiring an ADR: see [`docs/engineering-workflow.md`](docs/engineering-workflow.md#architectural-changes--write-an-adr).

## Code ownership

Solo project. Sole maintainer and ADR decider: **Mikołaj**.
