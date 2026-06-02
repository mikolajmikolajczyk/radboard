# ADR-0011: Worktrees are siblings of the main clone; local repos discovered by shallow `$HOME` scan

- **Status:** Accepted
- **Date:** 2026-03-31
- **Deciders:** Mikołaj
- **Tags:** worktrees, filesystem

## Context

radboard wraps `git worktree` so a user can review or author a patch in an isolated checkout without touching their main clone. Two things must be decided:

1. **Where do worktrees live on disk?**
2. **How does the app find the local clone for a given Radicle repo (RID)?**

Both choices are user-visible because they determine where files end up on the filesystem and what setup the user must do.

## Decision drivers

- A new worktree should be findable next to the main clone, not buried in `~/.cache` or inside `.git/worktrees`.
- The user should not have to register each repo in app settings; if they already cloned it, the app should find it.
- Cross-platform — no symlink tricks, no platform-specific paths.

## Considered options

1. Store worktrees inside `.git/worktrees/<branch>` (git default). User can't `cd` into them naturally.
2. Store worktrees under a radboard-managed directory (`~/.local/share/radboard/worktrees/<rid>/<branch>`). User loses filesystem locality with their main clone.
3. Store worktrees as **siblings** of the main clone: `<parent-of-main-repo>/<branch_name>`.
4. For discovery: explicit per-repo config vs. filesystem scan.

## Decision outcome

Chosen:

- **Worktrees live as siblings of the main clone.** `create_patch_worktree()` runs `git worktree add -b <branch_name> <parent(main_repo)>/<branch_name> [source_branch]`. The user can `cd ../<branch>` from the main clone.
- **Local clone discovery via shallow `$HOME` scan.** `find_local_repo(rid)` walks `$HOME` one level deep, reading `.git/config` and matching the embedded RID string. First match wins; user can override via settings.

### Positive consequences

- The user's `~/src/foo` and `~/src/foo-bugfix-xyz` sit next to each other naturally.
- Zero setup: clone with `rad clone …` under any subdirectory of `$HOME` and the app finds it.
- Removing the worktree is a normal `git worktree remove` — radboard doesn't own the directory.

### Negative consequences

- Repos cloned outside `$HOME` (or more than one level deep) won't be auto-discovered; the user has to set the path manually.
- `find_local_repo` is O(directories at depth 1) on startup per repo. Acceptable for typical `~/src` layouts; slow if `$HOME` has hundreds of top-level dirs.
- Two worktrees with the same `branch_name` for different RIDs would collide if the user keeps both repos in the same parent directory.

### Follow-up

- `commit_and_create_patch` injects a temporary `GIT_EDITOR` shell script to non-interactively supply the patch message before `git push rad HEAD:refs/patches`. Tied to this layout; if worktree layout changes, revisit that flow too.
- If shallow scan becomes a hot spot, cache `$HOME` directory listings between repo lookups.

## Links

- `src-tauri/src/commands/worktrees.rs` (`find_local_repo`, `create_patch_worktree`, `commit_and_create_patch`)
- Introducing commit: `63761e4` (feat: First stable beta release, 2026-03-31)
- Worktree creation improvements: 2026-04-21 (`66952d5` feat: Improve worktree creation)
