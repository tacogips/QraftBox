{

  description = "All You Need Is Diff";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/release-24.11";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    llm-agents.url = "github:numtide/llm-agents.nix";
  };

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-unstable,
      flake-utils,
      llm-agents,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        pkgs-unstable = import nixpkgs-unstable { inherit system; };

        playwrightBrowsers = pkgs-unstable.playwright-driver.browsers;

        devPackages = with pkgs; [
          # Bun runtime
          pkgs-unstable.bun

          # TypeScript tooling
          pkgs-unstable.typescript
          pkgs-unstable.typescript-language-server
          nodePackages.prettier

          # E2E testing (Playwright)
          playwrightBrowsers

          # Development tools
          fd
          gnused
          gh
          go-task
          nodePackages.pm2

          # LLM agents
          llm-agents.packages.${system}.agent-browser
        ];

        bun = pkgs-unstable.bun;

      in
      {
        # Installable package: wrapper that builds from source on first run
        packages.default = pkgs.writeShellScriptBin "qraftbox" ''
          set -euo pipefail
          QRAFTBOX_HOME="''${XDG_DATA_HOME:-$HOME/.local/share}/qraftbox"
          MARKER="$QRAFTBOX_HOME/.nix-source"

          if [ ! -f "$MARKER" ] || [ "$(cat "$MARKER")" != "${self}" ]; then
            echo "Setting up QraftBox..."
            rm -rf "$QRAFTBOX_HOME"
            mkdir -p "$QRAFTBOX_HOME"
            cp -r ${self}/. "$QRAFTBOX_HOME/"
            chmod -R u+w "$QRAFTBOX_HOME"

            (cd "$QRAFTBOX_HOME" && ${bun}/bin/bun install)
            (cd "$QRAFTBOX_HOME" && ${bun}/bin/bun build src/main.ts --outdir dist --target bun)
            (cd "$QRAFTBOX_HOME/client" && ${bun}/bin/bun install && ${bun}/bin/bun run build)

            echo "${self}" > "$MARKER"
            echo "QraftBox setup complete."
          fi

          cd "$QRAFTBOX_HOME"
          exec ${bun}/bin/bun run dist/main.js "$@"
        '';

        devShells.default = pkgs.mkShell {
          packages = devPackages;

          shellHook = ''
            export PLAYWRIGHT_BROWSERS_PATH="${playwrightBrowsers}"
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
            echo "TypeScript development environment ready"
            echo "Bun version: $(bun --version)"
            echo "TypeScript version: $(tsc --version)"
            echo "Task version: $(task --version 2>/dev/null || echo 'not available')"
            echo "Playwright browsers: $PLAYWRIGHT_BROWSERS_PATH"
          '';
        };
      }
    );
}
