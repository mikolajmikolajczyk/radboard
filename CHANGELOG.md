# Changelog
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


