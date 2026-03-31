{
  description = "radboard — Kanban board for Radicle";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, fenix }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        rust = fenix.packages.${system}.stable.toolchain;

        # Tauri system dependencies (shared between devShell and package)
        tauriDeps = with pkgs; [
          # Required by Tauri
          openssl

          # WebKit / GTK (Linux)
          at-spi2-atk
          atkmm
          cairo
          gdk-pixbuf
          glib
          gtk3
          harfbuzz
          librsvg
          libsoup_3
          pango
          webkitgtk_4_1
          xdotool

          # Additional Linux deps
          libayatana-appindicator

          # GSettings schemas — required by GTK file picker
          gsettings-desktop-schemas
        ];

        # Rust toolchain
        rustDeps = [ rust ];

        # Node / frontend deps
        nodeDeps = with pkgs; [
          nodejs_22
          nodePackages.pnpm
        ];

        # Extra tools needed for bundling (AppImage needs xdg-open)
        bundleDeps = with pkgs; [
          xdg-utils
        ];

        # --- Package build ---

        pnpmDeps = pkgs.pnpm_9.fetchDeps {
          pname = "radboard-frontend";
          version = "0.1.0";
          src = ./.;
          hash = ""; # nix build will tell you the correct hash on first run
        };

        frontend = pkgs.stdenv.mkDerivation {
          pname = "radboard-frontend";
          version = "0.1.0";
          src = ./.;

          nativeBuildInputs = with pkgs; [
            nodejs_22
            pnpm_9
            pnpm_9.configHook
          ];

          inherit pnpmDeps;

          buildPhase = ''
            runHook preBuild
            pnpm build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            cp -r dist $out
            runHook postInstall
          '';
        };

        radboard = pkgs.rustPlatform.buildRustPackage {
          pname = "radboard";
          version = "0.1.0";
          src = ./.;

          cargoLock.lockFile = ./Cargo.lock;

          buildAndTestSubdir = "src-tauri";

          postPatch = ''
            substituteInPlace src-tauri/tauri.conf.json \
              --replace-fail '"beforeBuildCommand": "pnpm build"' '"beforeBuildCommand": ""'
          '';

          preBuild = ''
            cp -r ${frontend} dist
          '';

          nativeBuildInputs = with pkgs; [
            pkg-config
            wrapGAppsHook3
            nodejs_22
            pnpm_9
          ];

          buildInputs = tauriDeps;

          postInstall = ''
            install -Dm644 ${./packaging/radboard.desktop} $out/share/applications/radboard.desktop
            install -Dm644 ${./src-tauri/icons/icon.png} $out/share/icons/hicolor/256x256/apps/radboard.png
          '';

          # wrapGAppsHook3 handles GSettings, GTK, WebKitGTK wrapping
          preFixup = ''
            gappsWrapperArgs+=(
              --set WEBKIT_DISABLE_COMPOSITING_MODE 1
            )
          '';
        };
      in
      {
        packages.default = radboard;

        devShells.default = pkgs.mkShell {
          buildInputs = tauriDeps ++ rustDeps ++ nodeDeps ++ bundleDeps ++ [ pkgs.pkg-config ];

          # Required for Tauri to find system libraries
          PKG_CONFIG_PATH = with pkgs; lib.makeSearchPathOutput "dev" "lib/pkgconfig" tauriDeps;

          LD_LIBRARY_PATH = with pkgs; lib.makeLibraryPath tauriDeps;

          shellHook = ''
            export WEBKIT_DISABLE_COMPOSITING_MODE=1
            export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS"

            echo "Tauri + React dev environment"
            echo "  node: $(node --version)"
            echo "  pnpm: $(pnpm --version)"
            echo "  rust: $(rustc --version)"
            echo ""
            echo "First-time setup:  pnpm install"
            echo "Run:               pnpm tauri dev"
          '';
        };
      }
    );
}
