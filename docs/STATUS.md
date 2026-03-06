# STATUS.md

## 1. 最終更新

2026-03-06 / Claude

## 2. 現在の真実（Project Truth）

- **M2: Segmenter + EpisodicMemory + SQLite adapter + opencode adapter + Vercel AI adapter は完了**
- M1 の Core ドメイン + In-memory adapter に加え、Core サービスと外部 adapter が実装済み
- テスト 114 件が全通過（`bun test`）
- `nr check`（oxlint + oxfmt + tsc --noEmit）がパス
- Core（`src/core/`）は外部パッケージに依存していないことを確認済み
- Nix flake + direnv で Bun 開発環境は準備済み
- Linter は oxlint、Formatter は oxfmt を使用（biome ではない）

## 2.5 PR レビュー基盤

- `/review-pr` コマンドで 5 つの専門エージェント（アーキテクチャ、コード品質、テストカバレッジ、セキュリティ、ドキュメント）による PR レビューが実行可能
- エージェント定義: `.claude/agents/`
- PR: https://github.com/OJII3/fenghuang/pull/3

## 3. 確定済み方針

1. Hexagonal Architecture（Ports & Adapters）を採用
2. ライブラリとして提供（HTTP サーバーなし）
3. エピソード記憶 + 意味記憶の両方を実装
4. Storage MVP: SQLite（bun:sqlite）
5. LLM MVP: opencode adapter
6. plast-mem の FSRS / イベントセグメンテーション設計を参考にする

## 4. M1 成果物

| 項目                      | ファイル                                   | ステータス   |
| ------------------------- | ------------------------------------------ | ------------ |
| Episode エンティティ      | `src/core/domain/episode.ts`               | 完了         |
| SemanticFact エンティティ | `src/core/domain/semantic-fact.ts`         | 完了         |
| FSRSCard + 純粋関数       | `src/core/domain/fsrs.ts`                  | 完了         |
| 共有型定義                | `src/core/domain/types.ts`                 | 完了         |
| LLMPort                   | `src/ports/llm.ts`                         | 完了         |
| StoragePort               | `src/ports/storage.ts`                     | 完了         |
| In-memory adapter         | `src/adapters/storage/in-memory.ts`        | 完了         |
| Public API                | `src/index.ts`                             | 完了         |
| Episode テスト            | `tests/core/domain/episode.test.ts`        | 完了（9件）  |
| SemanticFact テスト       | `tests/core/domain/semantic-fact.test.ts`  | 完了（6件）  |
| FSRS テスト               | `tests/core/domain/fsrs.test.ts`           | 完了（15件） |
| In-memory adapter テスト  | `tests/adapters/storage/in-memory.test.ts` | 完了（25件） |

## 5. M2 成果物

| 項目                  | ファイル                                     | ステータス   |
| --------------------- | -------------------------------------------- | ------------ |
| SQLite StoragePort    | `src/adapters/storage/sqlite.ts`             | 完了         |
| SQLite テスト         | `tests/adapters/storage/sqlite.test.ts`      | 完了（27件） |
| Segmenter             | `src/core/segmenter.ts`                      | 完了         |
| Segmenter テスト      | `tests/core/segmenter.test.ts`               | 完了（11件） |
| EpisodicMemory        | `src/core/episodic.ts`                       | 完了         |
| EpisodicMemory テスト | `tests/core/episodic.test.ts`                | 完了（15件） |
| opencode LLM adapter  | `src/adapters/llm/opencode.ts`               | 完了         |
| 統合テスト            | `tests/integration/segmenter-sqlite.test.ts` | 完了（6件）  |
| Public API 更新       | `src/index.ts`                               | 完了         |
| Vercel AI LLM adapter | `src/adapters/llm/vercel-ai.ts`              | 完了         |
| Vercel AI テスト      | `tests/adapters/llm/vercel-ai.test.ts`       | 完了（14件） |

### M2 設計上の決定

1. **Embedding**: opencode SDK に embedding API がないため、`EmbedFn` をコンストラクタ注入する設計
2. **opencode chatStructured**: SDK に `format` パラメータがないため、プロンプトで JSON 出力を指示し `schema.parse()` でバリデーション
3. **Vercel AI adapter**: `generateText` + `embed` をネイティブ使用。`chatStructured` は `generateObject` 不使用（fenghuang の `Schema<T>` は Zod ではないため、opencode と同様のプロンプトベース JSON + `schema.parse()`）
4. **SQLite 検索**: M2 では LIKE 検索で実装。FTS5 は M4（ハイブリッド検索）で導入予定
5. **EpisodicMemory**: `StoragePort` のみに依存（`LLMPort` は不要）
6. **Segmenter のフロー**: `addMessage()` → キュー追加 → 閾値チェック → LLM でセグメント判定 → Episode 生成・保存

## 6. 直近タスク（M3）

1. ConsolidationPipeline の実装（エピソード → セマンティックファクト変換）
2. SemanticMemory サービスの実装
3. Retrieval サービスの実装（エピソード + セマンティック統合検索）

## 7. ブロッカー

- なし

## 8. リスクメモ

1. bun:sqlite でベクトル検索をどう実現するか要調査（R1）
2. opencode SDK の API 安定性を確認する必要あり（R2）— M2 で `@opencode-ai/sdk@^1.2.20` を採用

## 9. 再開時コンテキスト

以下の順序でドキュメントを読み込む:

1. SPEC.md（要件を把握）
2. PLAN.md（マイルストーンと現在位置を把握）
3. ARCHITECTURE.md（設計を把握）
4. RUNBOOK.md（ルールを把握）
5. STATUS.md（最新状態を把握）
