# ADR-0008: Radicle is canonical; GitHub mirror exists only for CI runners

- **Status:** Accepted
- **Date:** 2026-04-01
- **Deciders:** Mikołaj
- **Tags:** release, ci

## Context

radboard is a Radicle client. The right place for its source is Radicle. But Radicle has no hosted CI; GitHub does. Binaries for AppImage / .deb / .rpm / .dmg are needed each release.

## Decision drivers

- Radicle must be the canonical history — patches and issues live there.
- GitHub Actions runners (Linux + macOS) are free for public repos and cover the build matrix.
- No GitHub PRs are accepted; the mirror is read-only from the outside.

## Considered options

1. GitHub canonical, mirror to Radicle.
2. Self-hosted CI on the VPS, no GitHub at all.
3. Radicle canonical, dual-push to GitHub for CI only.

## Decision outcome

Chosen: **dual-push**. `make release` pushes `master` and tags to both `origin` (GitHub) and `rad` (Radicle). `.github/workflows/release.yml` triggers on `v*` tags and builds artifacts. Contribution flow remains Radicle-native (patches, issues).

### Positive consequences

- Get GitHub's free macOS + Linux runners without buying into PR workflows.
- README and contributing instructions stay pointed at Radicle.

### Negative consequences

- Two remotes to keep in sync — Makefile enforces this; manual pushes will skew.
- GitHub mirror invites drive-by PRs that must be redirected to Radicle patches.

### Follow-up

- If Radicle-native CI becomes viable, retire the GitHub mirror entirely.

## Links

- `Makefile` (`release`, `rerelease` targets)
- `.github/workflows/release.yml`
- Introducing commit: 2026-04-01 (feat: Build automation)
