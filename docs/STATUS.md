# STATUS.md

## 1. 最終更新

2026-03-06 / Claude

## 2. 現在の真実（Project Truth）

- **M1: Core ドメイン + In-memory adapter は完了**
- ドメインエンティティ、FSRS 純粋関数、ポートインターフェース、In-memory adapter が実装済み
- ユニットテスト 55 件が全通過（`bun test`）
- Core（`src/core/`）は外部パッケージに依存していないことを確認済み
- Nix flake + direnv で Bun 開発環境は準備済み
- Linter は oxlint、Formatter は oxfmt を使用（biome ではない）
- PR: https://github.com/OJII3/fenghuang/pull/2

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

| 項目 | ファイル | ステータス |
|---|---|---|
| Episode エンティティ | `src/core/domain/episode.ts` | 完了 |
| SemanticFact エンティティ | `src/core/domain/semantic-fact.ts` | 完了 |
| FSRSCard + 純粋関数 | `src/core/domain/fsrs.ts` | 完了 |
| 共有型定義 | `src/core/domain/types.ts` | 完了 |
| LLMPort | `src/ports/llm.ts` | 完了 |
| StoragePort | `src/ports/storage.ts` | 完了 |
| In-memory adapter | `src/adapters/storage/in-memory.ts` | 完了 |
| Public API | `src/index.ts` | 完了 |
| Episode テスト | `tests/core/domain/episode.test.ts` | 完了（9件） |
| SemanticFact テスト | `tests/core/domain/semantic-fact.test.ts` | 完了（6件） |
| FSRS テスト | `tests/core/domain/fsrs.test.ts` | 完了（15件） |
| In-memory adapter テスト | `tests/adapters/storage/in-memory.test.ts` | 完了（25件） |

## 5. 直近タスク（M2）

1. Segmenter の実装（LLMPort を使用したセグメント境界判定）
2. EpisodicMemory サービスの実装
3. SQLite StoragePort adapter の実装（bun:sqlite）
4. opencode LLMPort adapter の実装
5. 統合テストの作成

## 6. ブロッカー

- なし

## 7. リスクメモ

1. bun:sqlite でベクトル検索をどう実現するか要調査（R1）
2. opencode SDK の API 安定性を確認する必要あり（R2）

## 8. 再開時コンテキスト

以下の順序でドキュメントを読み込む:

1. SPEC.md（要件を把握）
2. PLAN.md（マイルストーンと現在位置を把握）
3. ARCHITECTURE.md（設計を把握）
4. RUNBOOK.md（ルールを把握）
5. STATUS.md（最新状態を把握）
