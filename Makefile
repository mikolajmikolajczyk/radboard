.PHONY: build docker-image release rerelease flatpak upload

# Read current version from package.json
CURRENT_VERSION := $(shell grep '"version"' package.json | head -1 | sed 's/.*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')

# Next version for 'release' target (auto-bump patch unless VERSION is provided)
ifndef VERSION
  _MAJOR := $(word 1,$(subst ., ,$(CURRENT_VERSION)))
  _MINOR := $(word 2,$(subst ., ,$(CURRENT_VERSION)))
  _PATCH := $(word 3,$(subst ., ,$(CURRENT_VERSION)))
  VERSION := $(_MAJOR).$(_MINOR).$(shell echo $$(($(_PATCH) + 1)))
endif

# Docker build configuration
BUILDER_IMAGE  := radboard-builder
DOCKER_TARGET  := $(CURDIR)/.docker-target
CARGO_REGISTRY := $(HOME)/.cargo/registry
PNPM_STORE     := $(HOME)/.local/share/pnpm/store

BUNDLE := $(CURDIR)/target/release/bundle

docker-image:
	docker build --network=host -f Dockerfile.build -t $(BUILDER_IMAGE) .

build: docker-image
	mkdir -p $(DOCKER_TARGET) $(CARGO_REGISTRY) $(PNPM_STORE)
	docker run --rm --network=host \
	  -v $(CURDIR):/src \
	  -v $(DOCKER_TARGET):/src/target \
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
	git-cliff --tag "v$(VERSION)" -o CHANGELOG.md
	git add CHANGELOG.md
	git commit -m "release: v$(VERSION)"
	git tag -a "v$(VERSION)" -m "v$(VERSION)"
	git push origin master --tags
	git push rad master --tags

# Re-tag and force-push the current version without bumping (for fixing a bad release)
rerelease:
	@echo "Re-releasing v$(CURRENT_VERSION)..."
	git tag -f -a "v$(CURRENT_VERSION)" -m "v$(CURRENT_VERSION)"
	git push --force origin "refs/tags/v$(CURRENT_VERSION)"
	git push --force rad "refs/tags/v$(CURRENT_VERSION)"

flatpak: build
	flatpak-builder --force-clean build-dir org.mikolajczyk.radboard.yml
	@echo "Flatpak built in build-dir/"

# Upload AppImage to dl.mikolajczyk.org
VPS     := mikolaj@89.47.51.21
SSH_KEY := ~/.ssh/id_ed25519_yubikey

upload:
	@echo "Uploading v$(CURRENT_VERSION) artifacts to $(VPS)..."
	@# Copy with stable names (no version in filename) so site URLs never change
	scp -i $(SSH_KEY) \
	  "$(BUNDLE)/appimage/radboard_$(CURRENT_VERSION)_amd64.AppImage" \
	  $(VPS):/tmp/radboard-x86_64.AppImage
	scp -i $(SSH_KEY) \
	  "$(BUNDLE)/deb/radboard_$(CURRENT_VERSION)_amd64.deb" \
	  $(VPS):/tmp/radboard-amd64.deb
	scp -i $(SSH_KEY) \
	  "$(BUNDLE)/rpm/radboard-$(CURRENT_VERSION)-1.x86_64.rpm" \
	  $(VPS):/tmp/radboard-x86_64.rpm
	@if [ -f "$(BUNDLE)/dmg/radboard-aarch64.dmg" ]; then \
	  scp -i $(SSH_KEY) "$(BUNDLE)/dmg/radboard-aarch64.dmg" $(VPS):/tmp/radboard-aarch64.dmg; \
	  ssh -i $(SSH_KEY) $(VPS) "sudo release-upload radboard v$(CURRENT_VERSION) \
	    /tmp/radboard-x86_64.AppImage \
	    /tmp/radboard-amd64.deb \
	    /tmp/radboard-x86_64.rpm \
	    /tmp/radboard-aarch64.dmg && \
	    rm /tmp/radboard-x86_64.AppImage /tmp/radboard-amd64.deb /tmp/radboard-x86_64.rpm /tmp/radboard-aarch64.dmg"; \
	else \
	  ssh -i $(SSH_KEY) $(VPS) "sudo release-upload radboard v$(CURRENT_VERSION) \
	    /tmp/radboard-x86_64.AppImage \
	    /tmp/radboard-amd64.deb \
	    /tmp/radboard-x86_64.rpm && \
	    rm /tmp/radboard-x86_64.AppImage /tmp/radboard-amd64.deb /tmp/radboard-x86_64.rpm"; \
	fi
