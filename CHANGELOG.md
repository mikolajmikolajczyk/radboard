# Changelog
## v0.8.4 — 2026-06-10

### Bug Fixes

- expand _PATCH var in shell arithmetic
- show all descendants of nested epics in list view

### Features

- add Epics filter to hide pure subtasks

## v0.8.3 — 2026-06-10

### Bug Fixes

- use host network for docker build and run

## v0.8.2 — 2026-06-09

### Bug Fixes

- bundle Noto Color Emoji and extend font stack (f7cd467)

## v0.8.1 — 2026-06-09

### Features

- show priority badge per issue (9521e78)

## v0.8.0 — 2026-06-09

### Bug Fixes

- add resize handles with proper cursors on frameless window (7689e4d)
- rows are divs with role=button to avoid nested <button>

### Features

- ctrl-k repo switcher with fuzzy search (6c0ccfb)
- fuzzy search, fixed-height scroll, and alphabetical sort for repo pickers
- 🌱 badge for good-first-issue labeled issues (e58cc48)
- most-wanted toggle in open column (295533b)

### Refactor

- right-align good-first-issue leaf next to epic pill
- migrate to radicle crate 0.24 (fcdd6f4)

## v0.7.4 — 2026-06-09

### Bug Fixes

- single id badge + greener edit button in detail header

### Features

- persist list pane width and tweak list visuals

## v0.7.3 — 2026-06-09

### Bug Fixes

- wrap card pills instead of overflowing border (9d2b4ce)
- preserve special-prefix labels when editing chip set

### Features

- redesign list with fixed columns and per-row chip stack

## v0.7.2 — 2026-06-09

### Bug Fixes

- skip auto-labels for non-delegate issue creation

## v0.7.1 — 2026-06-09

### Bug Fixes

- surface backend errors when creating an issue

## v0.7.0 — 2026-06-09

### Features

- worktree + patch sync, with merge blocked on conflicts (bbff429)
- link patches to issues via commit messages (3f444c0)
- periodic sync of active repo (8cc8f01)
- epics — parent/child issue grouping (c48c125)

### docs

- WSL launch flags and AUR install instructions

## v0.5.2 — 2026-06-03

### Bug Fixes

- restore file ownership after docker step so git can write

## v0.5.1 — 2026-06-03

### Bug Fixes

- annotated tags in release/rerelease so signed-tag config works
- verify AUR host keys against published fingerprints before trusting them

### Features

- AUR radboard-bin package + auto-publish workflow

## v0.5.0 — 2026-06-03

### Bug Fixes

- replace removed nodePackages.pnpm with pnpm_10
- prefer branch-prefix over HEAD match in worktree patch lookup (9375787)
- enable window dragging from custom topbar
- milestone view shows terminal status, not lingering state:* label
- Create patch — load existing commits, allow rewriting non-HEAD with dirty worktree (6f60cdc)

### Features

- markdown preview toggle in issue editor and comments (f2fc5db)
- copyable issue id badge across kanban, issues, milestones, detail (bbebfc3)
- persist discovered state:* columns; closed issues always land in Closed (e5bdc64)
- issue assignee support (26df223)
- filter kanban by label (d5a750d)
- blocked / blocks visual indicators (d8b85ae)

### docs

- bootstrap contributor documentation
- expand coverage of milestones, worktrees, banned users, first-run, env vars

## v0.4.0 — 2026-04-21

### Features

- When opening radboard - last opened board should appear
- Worktree view allow creating patches from worktrees
- Create new issue from the issue list view
- Improve worktree creation: branch selection, error handling, and deferred editor launch
- Milestones support

## v0.3.0 — 2026-04-08

### Bug Fixes

- Use cache while reading/writing COBs

### Features

- Priority zones in the Open column

## v0.2.0 — 2026-04-08

### Bug Fixes

- [5637d5c] Editing issue brings popup from alpha version
- Dev mode works correctly again.
- Clickin on inbox items now switches into correct view

### Features

- Redesign "Create patch" and "Update patch" modals
- Closing issue asks for close status now
- Modifying COBs notify node now.

## v0.1.2 — 2026-04-01

### Bug Fixes

- CI artifact paths
- CI artifact paths, update README
- Fixed release for nix
- custom-protocol feature for nix run, macOS dmg artifact path
- CI artifact paths (target/ not src-tauri/target/)

## v0.1.1 — 2026-04-01

### Features

- First stable beta release
- Build automation


