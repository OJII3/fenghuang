# STATUS.md

## 1. 最終更新

2026-03-06 / Claude

## 2. 現在の真実（Project Truth）

- **M3: ConsolidationPipeline + SemanticMemory は完了**
- M1 の Core ドメイン + In-memory adapter、M2 の Segmenter + EpisodicMemory + SQLite + Vercel AI adapter に加え、意味記憶統合パイプラインが実装済み
- テスト 175 件が全通過（`bun test`）
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
5. LLM MVP: Vercel AI SDK adapter
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
| SQLite テスト         | `tests/adapters/storage/sqlite.test.ts`      | 完了（30件） |
| Segmenter             | `src/core/segmenter.ts`                      | 完了         |
| Segmenter テスト      | `tests/core/segmenter.test.ts`               | 完了（17件） |
| EpisodicMemory        | `src/core/episodic.ts`                       | 完了         |
| EpisodicMemory テスト | `tests/core/episodic.test.ts`                | 完了（16件） |
| 統合テスト            | `tests/integration/segmenter-sqlite.test.ts` | 完了（6件）  |
| Public API 更新       | `src/index.ts`                               | 完了         |
| Vercel AI LLM adapter | `src/adapters/llm/vercel-ai.ts`              | 完了         |
| Vercel AI テスト      | `tests/adapters/llm/vercel-ai.test.ts`       | 完了（18件） |
| Public API テスト     | `tests/index.test.ts`                        | 完了（1件）  |

### M2 設計上の決定

1. **Vercel AI adapter**: `generateText` + `embed` をネイティブ使用。`chatStructured` はプロンプトベース JSON + `schema.parse()` でバリデーション
2. **SQLite 検索**: M2 では LIKE 検索で実装。FTS5 は M4（ハイブリッド検索）で導入予定
3. **EpisodicMemory**: `StoragePort` のみに依存（`LLMPort` は不要）
4. **Segmenter のフロー**: `addMessage()` → キュー追加 → 閾値チェック → LLM でセグメント判定 → Episode 生成・保存

## 6. M3 成果物

| 項目                         | ファイル                             | ステータス   |
| ---------------------------- | ------------------------------------ | ------------ |
| SemanticMemory サービス      | `src/core/semantic-memory.ts`        | 完了         |
| ConsolidationPipeline        | `src/core/consolidation.ts`          | 完了         |
| Public API 更新              | `src/index.ts`                       | 完了         |
| SemanticMemory テスト        | `tests/core/semantic-memory.test.ts` | 完了（13件） |
| ConsolidationPipeline テスト | `tests/core/consolidation.test.ts`   | 完了（19件） |

### M3 設計上の決定

1. **ConsolidationPipeline**: `LLMPort.chatStructured()` で 1 エピソードにつき 1 回 LLM 呼び出し。既存事実一覧をプロンプトに含め、LLM にアクション（New/Reinforce/Update/Invalidate）を決定させる
2. **SemanticMemory**: `StoragePort` のみに依存する薄いサービス（`EpisodicMemory` と同じ DI パターン）
3. **スキーマバリデーション**: Segmenter と同じ `Schema<T>` パターンを使用。アクション別に `existingFactId` の必須チェックを実施
4. **逐次処理**: エピソード間で事実の状態が変わるため、各エピソードを逐次処理し、毎回既存事実を再取得

## 6.5 直近タスク（M4）

1. Retrieval サービスの実装（エピソード + セマンティック統合検索、RRF リランキング）
2. FTS5 による全文検索の導入
3. ハイブリッド検索（ベクトル + テキスト）の実装

## 7. ブロッカー

- なし

## 8. リスクメモ

1. bun:sqlite でベクトル検索をどう実現するか要調査（R1）

## 8.5 セキュリティレビュー指摘事項（PR #6 レビューで検出、既存コードベース対象）

| 優先度  | 項目                                                                                          |
| ------- | --------------------------------------------------------------------------------------------- |
| WARNING | ID ベースのストレージ操作（`getEpisodeById` 等）に userId 検証がなくテナント分離が不完全      |
| WARNING | `saveEpisode`/`saveFact` で引数 userId とエンティティ userId の不一致を検証していない         |
| WARNING | Segmenter のプロンプトで `</conversation>` タグのエスケープが未実装（インジェクションリスク） |
| WARNING | SQLite から解析した JSON（messages, embedding）の構造検証が不足                               |
| WARNING | `parseJson` のエラーメッセージに生データ（最大100文字）が含まれ漏洩リスクあり                 |
| INFO    | LLM API 呼び出しのレート制限・コスト制御が未実装                                              |
| INFO    | InMemoryStorageAdapter の search limit バリデーションが SQLite と不統一                       |
| INFO    | `cleanJsonResponse` ユーティリティの直接テスト（`utils.test.ts`）が未作成                     |

## 9. 再開時コンテキスト

以下の順序でドキュメントを読み込む:

1. SPEC.md（要件を把握）
2. PLAN.md（マイルストーンと現在位置を把握）
3. ARCHITECTURE.md（設計を把握）
4. RUNBOOK.md（ルールを把握）
5. STATUS.md（最新状態を把握）
