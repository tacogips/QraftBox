# Installing Dependencies for QraftBox

QraftBox requires **Git** and **Claude Code** to be installed on your system.
This guide walks you through installing both tools on macOS, Linux, and Windows.

> [Japanese / 日本語はこちら](#日本語-japanese)

---

## Table of Contents

- [Git](#git)
  - [macOS](#git--macos)
  - [Linux](#git--linux)
  - [Windows](#git--windows)
  - [Verify Git Installation](#verify-git-installation)
- [Claude Code](#claude-code)
  - [Prerequisites](#claude-code-prerequisites)
  - [macOS](#claude-code--macos)
  - [Linux](#claude-code--linux)
  - [Windows](#claude-code--windows)
  - [Verify Claude Code Installation](#verify-claude-code-installation)
- [Japanese / 日本語はこちら](#日本語-japanese)

---

## Git

Git is a version control system that QraftBox uses to manage repositories, diffs, and worktrees.

### Git -- macOS

**Option A: Xcode Command Line Tools (Recommended)**

Open Terminal and run:

```bash
xcode-select --install
```

A dialog will appear asking you to install the tools. Click "Install" and wait for completion.

**Option B: Homebrew**

If you have [Homebrew](https://brew.sh/) installed:

```bash
brew install git
```

### Git -- Linux

**Ubuntu / Debian:**

```bash
sudo apt update
sudo apt install git
```

**Fedora:**

```bash
sudo dnf install git
```

**Arch Linux:**

```bash
sudo pacman -S git
```

### Git -- Windows

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

### Claude Code Prerequisites

Claude Code requires **Node.js version 18 or later**. Check if you already have it:

```bash
node --version
```

If you see `v18.x.x` or higher, you are ready. If not, install Node.js first:

- **macOS**: `brew install node` (via Homebrew) or download from [https://nodejs.org/](https://nodejs.org/)
- **Linux**: `sudo apt install nodejs npm` (Ubuntu/Debian) or use [NodeSource](https://github.com/nodesource/distributions)
- **Windows**: Download the installer from [https://nodejs.org/](https://nodejs.org/)

### Claude Code -- macOS

Open Terminal and run:

```bash
npm install -g @anthropic-ai/claude-code
```

### Claude Code -- Linux

Open a terminal and run:

```bash
npm install -g @anthropic-ai/claude-code
```

If you get a permission error, either:

- Use `sudo npm install -g @anthropic-ai/claude-code`, or
- Configure npm to use a user-level directory (recommended):

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
npm install -g @anthropic-ai/claude-code
```

### Claude Code -- Windows

Open Command Prompt or PowerShell and run:

```bash
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

Once both Git and Claude Code are installed, you can proceed with setting up and running QraftBox.

---

---

## 日本語 (Japanese)

QraftBox を使用するには **Git** と **Claude Code** のインストールが必要です。
このガイドでは、macOS、Linux、Windows での両ツールのインストール方法を初心者向けに説明します。

> [English / 英語版はこちら](#installing-dependencies-for-qraftbox)

### 目次

- [Git のインストール](#git-のインストール)
  - [macOS](#git----macos)
  - [Linux](#git----linux)
  - [Windows](#git----windows)
  - [Git のインストール確認](#git-のインストール確認)
- [Claude Code のインストール](#claude-code-のインストール)
  - [前提条件](#前提条件)
  - [macOS](#claude-code----macos)
  - [Linux](#claude-code----linux)
  - [Windows](#claude-code----windows)
  - [Claude Code のインストール確認](#claude-code-のインストール確認)

---

### Git のインストール

Git はバージョン管理システムです。QraftBox はリポジトリ、差分（diff）、ワークツリーの管理に Git を使用しています。

#### Git -- macOS

**方法 A: Xcode コマンドラインツール（推奨）**

ターミナルを開いて以下を実行します:

```bash
xcode-select --install
```

ダイアログが表示されるので「インストール」をクリックして完了を待ちます。

**方法 B: Homebrew**

[Homebrew](https://brew.sh/) がインストール済みの場合:

```bash
brew install git
```

#### Git -- Linux

**Ubuntu / Debian の場合:**

```bash
sudo apt update
sudo apt install git
```

**Fedora の場合:**

```bash
sudo dnf install git
```

**Arch Linux の場合:**

```bash
sudo pacman -S git
```

#### Git -- Windows

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

#### 前提条件

Claude Code には **Node.js バージョン 18 以降** が必要です。既にインストールされているか確認します:

```bash
node --version
```

`v18.x.x` 以上が表示されれば準備完了です。表示されない場合は、まず Node.js をインストールしてください:

- **macOS**: `brew install node`（Homebrew 経由）または [https://nodejs.org/](https://nodejs.org/) からダウンロード
- **Linux**: `sudo apt install nodejs npm`（Ubuntu/Debian の場合）または [NodeSource](https://github.com/nodesource/distributions) を利用
- **Windows**: [https://nodejs.org/](https://nodejs.org/) からインストーラーをダウンロード

#### Claude Code -- macOS

ターミナルを開いて以下を実行します:

```bash
npm install -g @anthropic-ai/claude-code
```

#### Claude Code -- Linux

ターミナルを開いて以下を実行します:

```bash
npm install -g @anthropic-ai/claude-code
```

パーミッションエラーが出る場合は、以下のいずれかを実行してください:

- `sudo npm install -g @anthropic-ai/claude-code` を使う、もしくは
- npm のインストール先をユーザーディレクトリに変更する（推奨）:

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
npm install -g @anthropic-ai/claude-code
```

#### Claude Code -- Windows

コマンドプロンプトまたは PowerShell を開いて以下を実行します:

```bash
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

Git と Claude Code の両方がインストールできたら、QraftBox のセットアップと実行に進むことができます。
