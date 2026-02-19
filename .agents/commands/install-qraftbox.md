---
allowed-tools: Bash
description: Install or update QraftBox using the official install script
argument-hint: "[--npm] [--version X.X.X] [--install-dir /path] [--uninstall]"
---

## Install QraftBox Command

Install, update, or uninstall QraftBox on the local machine using the official installer script.

### Current Context

- OS: !`uname -s`
- Architecture: !`uname -m`
- Current QraftBox version (if installed): !`qraftbox --version 2>/dev/null || echo "not installed"`
- Install location (if installed): !`which qraftbox 2>/dev/null || echo "not found"`

### Arguments Received

$ARGUMENTS

---

## Instructions

### Step 1: Parse Arguments

Parse `$ARGUMENTS` for options:

| Option | Description | Default |
|--------|-------------|---------|
| `--npm` | Install via npm instead of binary download (installs Bun if needed) | binary download |
| `--version <X.X.X>` | Install a specific version | latest |
| `--install-dir <path>` | Directory to install binary | `~/.local/bin` |
| `--uninstall` | Remove QraftBox and all installed files | - |

If no arguments are provided, run a default binary install (latest version to `~/.local/bin`).

### Step 2: Execute Installation

Run the install script with the appropriate flags.

**Default install (binary download)**:
```bash
curl -fsSL https://raw.githubusercontent.com/tacogips/QraftBox/main/install.sh | bash
```

**Install via npm**:
```bash
curl -fsSL https://raw.githubusercontent.com/tacogips/QraftBox/main/install.sh | bash -s -- --npm
```

**Specific version**:
```bash
curl -fsSL https://raw.githubusercontent.com/tacogips/QraftBox/main/install.sh | bash -s -- --version X.X.X
```

**Custom install directory**:
```bash
curl -fsSL https://raw.githubusercontent.com/tacogips/QraftBox/main/install.sh | bash -s -- --install-dir /path/to/dir
```

**Uninstall**:
```bash
curl -fsSL https://raw.githubusercontent.com/tacogips/QraftBox/main/install.sh | bash -s -- --uninstall
```

Multiple flags can be combined:
```bash
curl -fsSL https://raw.githubusercontent.com/tacogips/QraftBox/main/install.sh | bash -s -- --npm --version 0.0.1
```

### Step 3: Verify Installation

After installation completes (skip for uninstall):

```bash
# Verify the binary is available
qraftbox --version

# Show install location
which qraftbox
```

### Step 4: Report Results

Display a summary:

```
## QraftBox Installation Result

- Action: install / update / uninstall
- Method: binary / npm
- Version: X.X.X
- Location: /path/to/qraftbox
- Status: success / failed

### Next Steps
- Run `qraftbox` to start the server (default: http://localhost:7144)
- Run `qraftbox --open` to start and open browser automatically
- Run `qraftbox --help` for all options
```

---

## Usage Examples

```
/install-qraftbox
# Default install (latest binary to ~/.local/bin)

/install-qraftbox --npm
# Install via npm (installs Bun if needed)

/install-qraftbox --version 0.0.1
# Install a specific version

/install-qraftbox --install-dir /usr/local/bin
# Install to a custom directory

/install-qraftbox --uninstall
# Remove QraftBox and all installed files
```

---

## Prerequisites

- **curl**: Required to download the installer
- **Git**: Required for QraftBox operation
- **Claude Code** (optional): Required for AI features ([install guide](https://docs.anthropic.com/en/docs/claude-code/overview))

## Notes

- The installer automatically detects your OS (macOS / Linux) and architecture (x64 / arm64)
- Binary installs include everything needed; no runtime dependencies required
- npm installs require Bun (the installer will install Bun automatically if needed)
- The installer adds `~/.local/bin` to your PATH if not already present
- Uninstall removes the binary, client assets, and PATH entries added by the installer
