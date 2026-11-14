# Installing Dependencies for QraftBox

QraftBox requires **Git**. For AI features, install **Claude Code** and/or **Codex CLI** depending on which model/vendor profile you use.
This guide focuses on Git and Claude Code installation on macOS, Linux, and Windows using various package managers.

> [Japanese / 日本語はこちら](#日本語-japanese)

**Official Pages:**

| Tool | Official Page |
|------|---------------|
| Git | [https://git-scm.com/](https://git-scm.com/) |
| Claude Code | [https://docs.anthropic.com/en/docs/claude-code/overview](https://docs.anthropic.com/en/docs/claude-code/overview) |

---

## Table of Contents

- [Git](#git)
  - [Homebrew (macOS / Linux)](#git--homebrew-macos--linux)
  - [Xcode Command Line Tools (macOS)](#git--xcode-command-line-tools-macos)
  - [Linux Package Managers](#git--linux-package-managers)
  - [Nix](#git--nix)
  - [Windows Package Managers](#git--windows-package-managers)
  - [Windows Installer](#git--windows-installer)
  - [Verify Git Installation](#verify-git-installation)
- [Claude Code](#claude-code)
  - [Prerequisites (Node.js)](#claude-code-prerequisites-nodejs)
  - [npm (All Platforms)](#claude-code--npm-all-platforms)
  - [Homebrew (macOS / Linux)](#claude-code--homebrew-macos--linux)
  - [Nix](#claude-code--nix)
  - [Linux Permission Fix](#claude-code--linux-permission-fix)
  - [Verify Claude Code Installation](#verify-claude-code-installation)
- [Japanese / 日本語はこちら](#日本語-japanese)

---

## Git

Git is a version control system that QraftBox uses to manage repositories, diffs, and worktrees.

Official page: [https://git-scm.com/](https://git-scm.com/)

### Git -- Homebrew (macOS / Linux)

[Homebrew](https://brew.sh/) works on both macOS and Linux.

```bash
brew install git
```

### Git -- Xcode Command Line Tools (macOS)

If you are on macOS and do not use Homebrew, you can install Git via Xcode Command Line Tools.

Open Terminal and run:

```bash
xcode-select --install
```

A dialog will appear. Click "Install" and wait for completion. Git is included automatically.

### Git -- Linux Package Managers

**Ubuntu / Debian (apt):**

```bash
sudo apt update
sudo apt install git
```

**Fedora (dnf):**

```bash
sudo dnf install git
```

**Arch Linux (pacman):**

```bash
sudo pacman -S git
```

### Git -- Nix

If you use [Nix](https://nixos.org/), you can install Git declaratively or imperatively.

**Imperative (nix-env):**

```bash
nix-env -iA nixpkgs.git
```

**Declarative (flake shell / nix-shell):**

```bash
nix-shell -p git
```

Or add `git` to your `flake.nix` `devShells` packages list.

### Git -- Windows Package Managers

**winget (built into Windows 10/11):**

```powershell
winget install --id Git.Git -e --source winget
```

**Chocolatey:**

```powershell
choco install git
```

**Scoop:**

```powershell
scoop install git
```

### Git -- Windows Installer

If you prefer not to use a package manager:

1. Download the installer from [https://git-scm.com/downloads/win](https://git-scm.com/downloads/win)
2. Run the downloaded `.exe` file
3. Follow the installer wizard -- the default options are fine for most users
4. Make sure "Git from the command line and also from 3rd-party software" is selected during setup

### Verify Git Installation

Open a terminal (or Git Bash on Windows) and run:

```bash
git --version
```

You should see output like `git version 2.x.x`. Any version 2.20 or later will work.

---

## Claude Code

Claude Code is Anthropic's CLI tool for AI-powered coding. QraftBox uses it for commit, push, and pull request operations.

Official page: [https://docs.anthropic.com/en/docs/claude-code/overview](https://docs.anthropic.com/en/docs/claude-code/overview)

### Claude Code Prerequisites (Node.js)

Claude Code requires **Node.js version 18 or later**. Check if you already have it:

```bash
node --version
```

If you see `v18.x.x` or higher, you are ready. If not, install Node.js first using one of these methods:

| Platform | Command / Link |
|----------|----------------|
| Homebrew (macOS / Linux) | `brew install node` |
| Ubuntu / Debian | `sudo apt install nodejs npm` or use [NodeSource](https://github.com/nodesource/distributions) |
| Fedora | `sudo dnf install nodejs npm` |
| Arch Linux | `sudo pacman -S nodejs npm` |
| Nix | `nix-env -iA nixpkgs.nodejs` or add `nodejs` to your flake |
| winget (Windows) | `winget install OpenJS.NodeJS.LTS` |
| Chocolatey (Windows) | `choco install nodejs-lts` |
| Scoop (Windows) | `scoop install nodejs-lts` |
| Installer (any platform) | [https://nodejs.org/](https://nodejs.org/) |

### Claude Code -- npm (All Platforms)

The primary installation method for Claude Code is npm. This works on macOS, Linux, and Windows:

```bash
npm install -g @anthropic-ai/claude-code
```

### Claude Code -- Homebrew (macOS / Linux)

If you use Homebrew, you can also install Claude Code via:

```bash
brew install claude-code
```

### Claude Code -- Nix

**Imperative (nix-env):**

```bash
nix-env -iA nixpkgs.claude-code
```

**Declarative (flake shell / nix-shell):**

```bash
nix-shell -p claude-code
```

Or add `claude-code` to your `flake.nix` `devShells` packages list.

> Note: Availability in nixpkgs may vary. If the package is not yet available, use the npm method above.

### Claude Code -- Linux Permission Fix

If you get a permission error when running `npm install -g` on Linux, you have two options:

**Option A: Use sudo**

```bash
sudo npm install -g @anthropic-ai/claude-code
```

**Option B: Change npm global directory (Recommended)**

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
npm install -g @anthropic-ai/claude-code
```

### Verify Claude Code Installation

Run the following command:

```bash
claude --version
```

You should see the version number printed. On first run, Claude Code will guide you through authentication setup.

---

## Next Steps

Once Git and your selected AI CLI are installed, you can proceed with setting up and running QraftBox.

If you plan to use OpenAI/Codex profiles, make sure the `codex` command is available in your `PATH`.

---

---

## 日本語 (Japanese)

QraftBox の実行には **Git** が必要です。AI機能を使う場合は、利用するモデル/ベンダープロファイルに応じて **Claude Code** または **Codex CLI** をインストールしてください。
このガイドでは、macOS、Linux、Windows での各種パッケージマネージャーを使った Git と Claude Code のインストール方法を初心者向けに説明します。

> [English / 英語版はこちら](#installing-dependencies-for-qraftbox)

**公式ページ:**

| ツール | 公式ページ |
|--------|-----------|
| Git | [https://git-scm.com/](https://git-scm.com/) |
| Claude Code | [https://docs.anthropic.com/en/docs/claude-code/overview](https://docs.anthropic.com/en/docs/claude-code/overview) |

### 目次

- [Git のインストール](#git-のインストール)
  - [Homebrew (macOS / Linux)](#git----homebrew-macos--linux)
  - [Xcode コマンドラインツール (macOS)](#git----xcode-コマンドラインツール-macos)
  - [Linux パッケージマネージャー](#git----linux-パッケージマネージャー)
  - [Nix](#git----nix)
  - [Windows パッケージマネージャー](#git----windows-パッケージマネージャー)
  - [Windows インストーラー](#git----windows-インストーラー)
  - [Git のインストール確認](#git-のインストール確認)
- [Claude Code のインストール](#claude-code-のインストール)
  - [前提条件 (Node.js)](#前提条件-nodejs)
  - [npm (全プラットフォーム共通)](#claude-code----npm-全プラットフォーム共通)
  - [Homebrew (macOS / Linux)](#claude-code----homebrew-macos--linux)
  - [Nix](#claude-code----nix)
  - [Linux パーミッション修正](#claude-code----linux-パーミッション修正)
  - [Claude Code のインストール確認](#claude-code-のインストール確認)

---

### Git のインストール

Git はバージョン管理システムです。QraftBox はリポジトリ、差分（diff）、ワークツリーの管理に Git を使用しています。

公式ページ: [https://git-scm.com/](https://git-scm.com/)

#### Git -- Homebrew (macOS / Linux)

[Homebrew](https://brew.sh/) は macOS と Linux の両方で使えます。

```bash
brew install git
```

#### Git -- Xcode コマンドラインツール (macOS)

macOS で Homebrew を使わない場合、Xcode コマンドラインツール経由で Git をインストールできます。

ターミナルを開いて以下を実行します:

```bash
xcode-select --install
```

ダイアログが表示されるので「インストール」をクリックして完了を待ちます。Git は自動的に含まれています。

#### Git -- Linux パッケージマネージャー

**Ubuntu / Debian (apt):**

```bash
sudo apt update
sudo apt install git
```

**Fedora (dnf):**

```bash
sudo dnf install git
```

**Arch Linux (pacman):**

```bash
sudo pacman -S git
```

#### Git -- Nix

[Nix](https://nixos.org/) を使用している場合、宣言的または命令的にインストールできます。

**命令的 (nix-env):**

```bash
nix-env -iA nixpkgs.git
```

**宣言的 (flake shell / nix-shell):**

```bash
nix-shell -p git
```

または `flake.nix` の `devShells` パッケージリストに `git` を追加してください。

#### Git -- Windows パッケージマネージャー

**winget (Windows 10/11 に標準搭載):**

```powershell
winget install --id Git.Git -e --source winget
```

**Chocolatey:**

```powershell
choco install git
```

**Scoop:**

```powershell
scoop install git
```

#### Git -- Windows インストーラー

パッケージマネージャーを使わない場合:

1. [https://git-scm.com/downloads/win](https://git-scm.com/downloads/win) からインストーラーをダウンロードします
2. ダウンロードした `.exe` ファイルを実行します
3. インストールウィザードに従います（デフォルト設定で問題ありません）
4. セットアップ中に「Git from the command line and also from 3rd-party software」が選択されていることを確認してください

#### Git のインストール確認

ターミナル（Windows の場合は Git Bash）を開いて以下を実行します:

```bash
git --version
```

`git version 2.x.x` のような出力が表示されれば成功です。バージョン 2.20 以降であれば動作します。

---

### Claude Code のインストール

Claude Code は Anthropic が提供する AI コーディング用 CLI ツールです。QraftBox はコミット、プッシュ、プルリクエスト操作に Claude Code を使用しています。

公式ページ: [https://docs.anthropic.com/en/docs/claude-code/overview](https://docs.anthropic.com/en/docs/claude-code/overview)

#### 前提条件 (Node.js)

Claude Code には **Node.js バージョン 18 以降** が必要です。既にインストールされているか確認します:

```bash
node --version
```

`v18.x.x` 以上が表示されれば準備完了です。表示されない場合は、まず Node.js をインストールしてください:

| プラットフォーム | コマンド / リンク |
|-----------------|------------------|
| Homebrew (macOS / Linux) | `brew install node` |
| Ubuntu / Debian | `sudo apt install nodejs npm` または [NodeSource](https://github.com/nodesource/distributions) を利用 |
| Fedora | `sudo dnf install nodejs npm` |
| Arch Linux | `sudo pacman -S nodejs npm` |
| Nix | `nix-env -iA nixpkgs.nodejs` またはflakeに `nodejs` を追加 |
| winget (Windows) | `winget install OpenJS.NodeJS.LTS` |
| Chocolatey (Windows) | `choco install nodejs-lts` |
| Scoop (Windows) | `scoop install nodejs-lts` |
| インストーラー (全OS) | [https://nodejs.org/](https://nodejs.org/) |

#### Claude Code -- npm (全プラットフォーム共通)

Claude Code の主要なインストール方法は npm です。macOS、Linux、Windows のいずれでも使えます:

```bash
npm install -g @anthropic-ai/claude-code
```

#### Claude Code -- Homebrew (macOS / Linux)

Homebrew を使っている場合は以下でもインストールできます:

```bash
brew install claude-code
```

#### Claude Code -- Nix

**命令的 (nix-env):**

```bash
nix-env -iA nixpkgs.claude-code
```

**宣言的 (flake shell / nix-shell):**

```bash
nix-shell -p claude-code
```

または `flake.nix` の `devShells` パッケージリストに `claude-code` を追加してください。

> 注意: nixpkgs での提供状況は変動する場合があります。パッケージが利用できない場合は、上記の npm による方法を使用してください。

#### Claude Code -- Linux パーミッション修正

Linux で `npm install -g` 実行時にパーミッションエラーが出る場合、2つの方法があります:

**方法 A: sudo を使う**

```bash
sudo npm install -g @anthropic-ai/claude-code
```

**方法 B: npm のグローバルディレクトリを変更する（推奨）**

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
npm install -g @anthropic-ai/claude-code
```

#### Claude Code のインストール確認

以下のコマンドを実行します:

```bash
claude --version
```

バージョン番号が表示されれば成功です。初回起動時に Claude Code が認証設定のガイドを表示します。

---

### 次のステップ

Git と利用するAI CLIの準備ができたら、QraftBox のセットアップと実行に進むことができます。

OpenAI/Codex プロファイルを使用する場合は、`codex` コマンドが `PATH` から実行できる状態にしてください。
