# QraftBox

**All You Need Is Diff.**

QraftBox is a local tool for viewing code changes (diffs), managing git branches, and performing AI-powered git operations -- all from your web browser.

> [Japanese / 日本語はこちら](#日本語-japanese)

## SECURITY WARNING

> **QraftBox is under active development. It is NOT production-ready.**
>
> QraftBox starts a web server on your machine. **If you expose this server to the public internet, anyone can access your code, files, and git operations.** This is a serious security risk.
>
> **Rules to keep yourself safe:**
>
> 1. **ONLY use QraftBox on your local machine** (localhost / 127.0.0.1). Do not open the port to the internet.
> 2. **If you need remote access**, use a VPN such as [Tailscale](https://tailscale.com/), [WireGuard](https://www.wireguard.com/), or [ZeroTier](https://www.zerotier.com/). These create a private encrypted network so only your devices can connect.
> 3. **NEVER expose QraftBox directly to the public internet** without proper authentication and encryption.
>
> **The developers of QraftBox assume absolutely no responsibility or liability for any damage, data loss, security breach, or any other harm resulting from the use of this software.** Use it entirely at your own risk.

## What is QraftBox?

If you write code and use git, QraftBox helps you with these everyday tasks:

- **See what changed** -- View diffs (the differences between file versions) in a clean, readable format. Choose between inline view (changes shown in one column) or side-by-side view (old version on the left, new version on the right).
- **Manage branches** -- Switch between git branches, view branch lists, and work with git worktrees (multiple working directories for the same repository).
- **AI-powered git operations** -- Use Claude Code (Anthropic's AI coding tool) to write commit messages, push code, and create pull requests with AI assistance.
- **Browse AI sessions** -- View past Claude Code sessions and their transcripts.
- **Work with multiple projects** -- Open multiple directories in tabs, just like a browser.
- **Real-time updates** -- QraftBox watches your files and updates the view automatically when files change.

## How it Works (Simple Explanation)

1. You run QraftBox on your computer. It starts a small web server.
2. You open your web browser and go to `http://localhost:7155`.
3. You see a web page where you can browse your git repositories, view diffs, and perform git operations.

That's it. Everything runs on your machine. No data is sent to external servers (except when using Claude Code AI features, which communicates with Anthropic's API).

## Requirements

You need these two tools installed on your computer:

| Tool | What it is | Install Guide |
|------|-----------|---------------|
| **Git** | Version control system (tracks changes to your code) | [Install Guide](usage/install-dependencies.md#git) |
| **Claude Code** | AI coding CLI tool by Anthropic | [Install Guide](usage/install-dependencies.md#claude-code) |

See [usage/install-dependencies.md](usage/install-dependencies.md) for step-by-step installation instructions for every operating system.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/tacogips/QraftBox.git
cd QraftBox

# Install dependencies
bun install

# Start QraftBox
bun run start
```

Then open `http://localhost:7155` in your browser.

## License

This project is licensed under the [MIT License](LICENSE).

---

---

## 日本語 (Japanese)

**All You Need Is Diff.**

QraftBox は、コードの変更（diff）を見たり、gitブランチを管理したり、AIを使ったgit操作を行うためのローカルツールです。すべてウェブブラウザから操作できます。

> [English / 英語版はこちら](#qraftbox)

## セキュリティに関する重要な警告

> **QraftBox は開発中のソフトウェアです。本番環境での利用を想定していません。**
>
> QraftBox はあなたのコンピュータ上でウェブサーバーを起動します。**このサーバーをインターネットに公開すると、誰でもあなたのコード、ファイル、git操作にアクセスできてしまいます。** これは重大なセキュリティリスクです。
>
> **安全に使うためのルール:**
>
> 1. **QraftBox はローカルマシン上でのみ使用してください**（localhost / 127.0.0.1）。ポートをインターネットに開放しないでください。
> 2. **リモートアクセスが必要な場合**は、[Tailscale](https://tailscale.com/)、[WireGuard](https://www.wireguard.com/)、[ZeroTier](https://www.zerotier.com/) などの VPN を使用してください。これらはプライベートな暗号化ネットワークを作成し、あなたのデバイスだけが接続できるようにします。
> 3. **適切な認証と暗号化なしに、QraftBox を公開インターネットに直接さらさないでください。**
>
> **QraftBox の開発者は、このソフトウェアの使用により生じたいかなる損害、データ損失、セキュリティ侵害、その他のあらゆる被害について、一切の責任を負いません。** すべて自己責任でご利用ください。

## QraftBox とは?

コードを書いて git を使っている人なら、QraftBox は日常のこんな作業を助けてくれます:

- **変更内容を見る** -- diff（ファイルのバージョン間の差分）を見やすい形式で表示します。インライン表示（1列で変更を表示）とサイドバイサイド表示（左に旧バージョン、右に新バージョン）を選べます。
- **ブランチを管理する** -- git ブランチの切り替え、ブランチ一覧の表示、git ワークツリー（同じリポジトリで複数の作業ディレクトリを持つ機能）の操作ができます。
- **AIによるgit操作** -- Claude Code（Anthropic のAIコーディングツール）を使って、コミットメッセージの作成、コードのプッシュ、プルリクエストの作成をAIの支援のもと行えます。
- **AIセッションを閲覧する** -- 過去の Claude Code セッションとそのやり取りの記録を見ることができます。
- **複数プロジェクトで作業する** -- ブラウザのタブのように、複数のディレクトリをタブで開けます。
- **リアルタイム更新** -- QraftBox はファイルを監視し、変更があると自動的に画面を更新します。

## 仕組み（かんたんな説明）

1. あなたのコンピュータで QraftBox を起動します。小さなウェブサーバーが立ち上がります。
2. ウェブブラウザを開いて `http://localhost:7155` にアクセスします。
3. git リポジトリの閲覧、diff の表示、git操作ができるウェブページが表示されます。

以上です。すべてあなたのマシン上で動きます。外部サーバーにデータは送信されません（Claude Code のAI機能を使う場合は Anthropic の API と通信します）。

## 必要なもの

以下の2つのツールをインストールする必要があります:

| ツール | 説明 | インストール方法 |
|--------|------|-----------------|
| **Git** | バージョン管理システム（コードの変更履歴を追跡します） | [インストールガイド](usage/install-dependencies.md#git-のインストール) |
| **Claude Code** | Anthropic のAIコーディング用CLIツール | [インストールガイド](usage/install-dependencies.md#claude-code-のインストール) |

各OSごとのインストール手順は [usage/install-dependencies.md](usage/install-dependencies.md) を参照してください。

## クイックスタート

```bash
# リポジトリをクローン
git clone https://github.com/tacogips/QraftBox.git
cd QraftBox

# 依存関係をインストール
bun install

# QraftBox を起動
bun run start
```

その後、ブラウザで `http://localhost:7155` を開いてください。

## ライセンス

このプロジェクトは [MIT License](LICENSE) のもとで公開されています。
