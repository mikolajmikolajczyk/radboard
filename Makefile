.PHONY: build docker-image release mirror flatpak upload

# Read current version from package.json
CURRENT_VERSION := $(shell grep '"version"' package.json | head -1 | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')

# Auto-bump patch unless VERSION is provided
ifndef VERSION
  MAJOR := $(word 1,$(subst ., ,$(CURRENT_VERSION)))
  MINOR := $(word 2,$(subst ., ,$(CURRENT_VERSION)))
  PATCH := $(word 3,$(subst ., ,$(CURRENT_VERSION)))
  VERSION := $(MAJOR).$(MINOR).$(shell echo $$(($(PATCH) + 1)))
endif

# Docker build configuration
BUILDER_IMAGE  := radboard-builder
DOCKER_TARGET  := $(CURDIR)/.docker-target
CARGO_REGISTRY := $(HOME)/.cargo/registry
PNPM_STORE     := $(HOME)/.local/share/pnpm/store

# AppImage output path (inside .docker-target/)
APPIMAGE := $(DOCKER_TARGET)/release/bundle/appimage/radboard_$(VERSION)_amd64.AppImage

docker-image:
	docker build -f Dockerfile.build -t $(BUILDER_IMAGE) .

build: docker-image
	mkdir -p $(DOCKER_TARGET) $(CARGO_REGISTRY) $(PNPM_STORE)
	docker run --rm \
	  -v $(CURDIR):/src \
	  -v $(DOCKER_TARGET):/src/src-tauri/target \
	  -v $(CARGO_REGISTRY):/root/.cargo/registry \
	  -v $(PNPM_STORE):/root/.local/share/pnpm/store \
	  -w /src \
	  $(BUILDER_IMAGE) \
	  bash -c 'CI=true pnpm install --frozen-lockfile && pnpm tauri build'

release:
	@echo "Bumping version: $(CURRENT_VERSION) → $(VERSION)"
	sed -i 's/"version": "$(CURRENT_VERSION)"/"version": "$(VERSION)"/' package.json
	sed -i 's/"version": "$(CURRENT_VERSION)"/"version": "$(VERSION)"/' src-tauri/tauri.conf.json
	sed -i 's/^version = "$(CURRENT_VERSION)"/version = "$(VERSION)"/' src-tauri/Cargo.toml
	git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
	git commit -m "release: v$(VERSION)"
	git tag "v$(VERSION)"
	@echo "Tagged v$(VERSION). Building..."
	$(MAKE) build VERSION=$(VERSION)
	@echo "Release v$(VERSION) complete."

# Mirror main branch + tags to GitHub (for CI)
mirror:
	git push github main --tags

flatpak: build
	flatpak-builder --force-clean build-dir org.mikolajczyk.radboard.yml
	@echo "Flatpak built in build-dir/"

# Upload AppImage to dl.mikolajczyk.org
VPS     := mikolaj@89.47.51.21
SSH_KEY := ~/.ssh/id_ed25519_yubikey

upload:
	@test -f "$(APPIMAGE)" || (echo "AppImage not found: $(APPIMAGE)" && echo "Run 'make release' or 'make build' first." && exit 1)
	scp -i $(SSH_KEY) "$(APPIMAGE)" $(VPS):/tmp/radboard-x86_64.AppImage
	ssh -i $(SSH_KEY) $(VPS) "sudo release-upload radboard v$(VERSION) /tmp/radboard-x86_64.AppImage && rm /tmp/radboard-x86_64.AppImage"
