# ADR-0010: Docker-based reproducible release build

- **Status:** Accepted
- **Date:** 2026-04-01
- **Deciders:** Mikołaj
- **Tags:** build, release

## Context

`pnpm tauri build` on the developer's machine produces artifacts that link against whatever glibc / GTK / webkit2gtk versions are installed locally. The release artifacts (.deb, .rpm, AppImage) need to run on a wide range of distros, which means linking against an older, stable baseline — not bleeding-edge Arch / NixOS libs.

## Decision drivers

- AppImage and `.deb`/`.rpm` consumers expect Debian Bookworm-era libraries.
- Developer machines (CachyOS, NixOS, macOS) won't match.
- Solo project — must be one command.

## Considered options

1. Build locally; users handle library mismatches.
2. Build only on GitHub runners (Ubuntu 22.04).
3. Local reproducible build inside a Debian Bookworm Docker image (`Dockerfile.build`), mounted with cargo registry, pnpm store, and target dir for incremental rebuilds.

## Decision outcome

Chosen: **Docker reproducible build** for local validation, **GitHub runners** for the canonical release artifacts. `make build` invokes the Docker image; release artifacts ultimately come from the workflow on tag push.

### Positive consequences

- Local `make build` produces artifacts that match what users will install.
- Hot caches mounted into the container — second build is fast.

### Negative consequences

- Requires Docker. macOS dev still builds DMGs via GitHub runners (no local equivalent).
- `Dockerfile.build` must track system dep changes (webkit2gtk version etc.).

### Follow-up

- If WebKitGTK / GTK ABI changes break Bookworm builds, bump base image to Trixie (record as new ADR or supersede).

## Links

- `Makefile` (`docker-image`, `build` targets)
- `Dockerfile.build`
- `.github/workflows/release.yml`
- Introducing commit: 2026-04-01 (feat: Build automation)
