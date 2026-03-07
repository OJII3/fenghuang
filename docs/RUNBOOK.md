# RUNBOOK.md

## 1. 目的

本書は fenghuang の開発・運用における不変ルールと手順を定義する。一度読んだら常に従うこと。

## 2. 不変ルール

1. Core（src/core/）は外部パッケージを import してはならない
2. Adapter は必ず対応する Port interface を実装する
3. Port の変更は Core と全 Adapter に影響するため、慎重に行う
4. テストは in-memory adapter を使い、外部依存なしで実行可能にする
5. 全てのパブリック関数に型注釈を付ける
6. `bun test` が通らない状態でコミットしない
7. `nr check`（oxlint + oxfmt + tsc）が通らない状態でコミットしない
8. ドキュメント（docs/）は実装と同期して更新する
9. 秘密情報（API キー等）をコミットしない
10. main ブランチに直接 push しない（PR 経由）

## 3. 実行手順

### 3.1 開発環境セットアップ

1. Nix flake + direnv で Bun が自動的に利用可能になる
2. `bun install` で依存パッケージをインストール
3. LLM プロバイダーパッケージをインストール（利用するプロバイダーに応じて選択）

### 3.1.1 LLM プロバイダーのセットアップ

fenghuang はライブラリとして提供されるため、LLM プロバイダーは利用者が選択・インストールする。VercelAIAdapter の `model`（チャット用）と `embeddingModel`（埋め込み用）は独立して設定可能。

**OpenCode + Ollama 構成（推奨）**

```bash
bun add ai-sdk-provider-opencode-sdk ollama-ai-provider-v2
```

- OpenCode: ローカルまたはリモートの LLM に統一的にアクセス。事前に `opencode` サーバーを起動しておく
- Ollama: ローカルで埋め込みモデルを実行。事前に `ollama pull nomic-embed-text` 等でモデルを取得しておく

**OpenAI 構成**

```bash
bun add @ai-sdk/openai
```

- 環境変数 `OPENAI_API_KEY` を設定

**Anthropic 構成**

```bash
bun add @ai-sdk/anthropic
```

- 環境変数 `ANTHROPIC_API_KEY` を設定

詳細な構成例は ARCHITECTURE.md §3.1 を参照。

### 3.2 開発時コマンド

| コマンド       | 説明                          |
| -------------- | ----------------------------- |
| `bun test`     | テスト実行                    |
| `bun build`    | ビルド                        |
| `nr lint`      | oxlint                        |
| `nr lint:fix`  | oxlint（自動修正）            |
| `nr fmt`       | oxfmt（フォーマット）         |
| `nr fmt:check` | oxfmt（チェックのみ、CI用）   |
| `nr check`     | oxlint + oxfmt + tsc --noEmit |

### 3.3 ブランチ運用

1. main から作業ブランチを作成
2. こまめにコミット
3. 作業完了後に push + PR 作成

## 4. 変更管理

| 変更内容                                   | 更新するドキュメント    |
| ------------------------------------------ | ----------------------- |
| 仕様変更（要件の追加・変更）               | SPEC.md                 |
| マイルストーン完了・計画変更               | PLAN.md                 |
| アーキテクチャ変更（Port, モジュール構成） | ARCHITECTURE.md         |
| 運用ルール変更                             | RUNBOOK.md（本書）      |
| 進捗更新・ステータス変更                   | STATUS.md               |
| 上記全て                                   | CLAUDE.md（要約を反映） |

## 5. 失敗時対応

| 状況             | 対応                                                   |
| ---------------- | ------------------------------------------------------ |
| テスト失敗       | エラーログを確認し、根本原因を特定。修正後に再テスト   |
| LLM 呼び出し失敗 | adapter のログを確認。API キー・エンドポイントを確認   |
| SQLite エラー    | マイグレーション状態を確認。必要ならDBを再作成         |
| 型エラー         | Port interface の変更が Adapter に反映されているか確認 |

## 6. セキュリティ運用

- API キーは環境変数で管理し、.env ファイルは .gitignore に追加
- ユーザーデータ（記憶）はローカル SQLite に保存し、外部送信しない（LLM 呼び出しを除く）
