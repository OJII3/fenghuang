# PLAN.md

## 1. 方針

- Hexagonal Architecture を厳守し、Core は外部依存を持たない
- MVP ファーストで段階的に機能を追加する
- 各マイルストーンで動作するテストを維持する
- ドキュメントとコードを同期して更新する

## 2. マイルストーン

### M1: Core ドメイン + In-memory adapter

成果物:

- Episode, SemanticFact, FSRSCard のドメインエンティティ
- FSRS 純粋関数（retrievability 計算、パラメータ更新）
- LLMPort, StoragePort のインターフェース定義
- In-memory StoragePort adapter
- ドメインエンティティと FSRS のユニットテスト

完了条件:

- `bun test` で全テスト通過
- Core が外部依存を一切 import していない

### M2: Segmenter + SQLite adapter + opencode LLM adapter

成果物:

- Segmenter（LLMPort を使用してセグメント境界を判定）
- EpisodicMemory サービス（エピソードの保存・取得）
- SQLite StoragePort adapter（bun:sqlite）
- opencode LLMPort adapter
- 統合テスト

完了条件:

- メッセージを追加すると適切にセグメンテーションされる
- SQLite にエピソードが永続化される
- opencode 経由で LLM 呼び出しが動作する

### M3: 意味記憶統合パイプライン

成果物:

- ConsolidationPipeline（エピソード → 意味記憶の変換）
- SemanticMemory サービス（事実の保存・検索・更新）
- LLM による事実抽出・カテゴリ分類
- 統合アクション（New, Reinforce, Update, Invalidate）

完了条件:

- エピソードから事実が自動抽出される
- 既存事実との重複チェック・更新が動作する

### M4: ハイブリッド検索 + Public API

成果物:

- Retrieval サービス（ハイブリッド検索 + RRF + FSRS リランキング）
- `createFenghuang()` Public API
- エンドツーエンドテスト

完了条件:

- 受け入れ条件（SPEC.md）を全て満たす

## 3. リスクレジスタ

| ID  | リスク                                | 影響                       | 対策                                                   |
| --- | ------------------------------------- | -------------------------- | ------------------------------------------------------ |
| R1  | bun:sqlite でベクトル検索ができない   | ハイブリッド検索が実装不可 | sqlite-vss 拡張 or アプリ側でベクトル計算              |
| R2  | opencode SDK の API が不安定          | adapter 実装が壊れる       | Port で隔離しているため adapter 差し替えで対応         |
| R3  | FSRS パラメータのチューニングが難しい | 記憶の減衰が不自然         | plast-mem のデフォルト値を参考に、後から調整可能にする |
| R4  | LLM のセグメンテーション精度が低い    | エピソード粒度が不適切     | プロンプトの改善 + 閾値のチューニング                  |

## 4. 完了定義（DoD）

- 全テストが通過する
- TypeScript strict mode でエラーがない
- oxlint + oxfmt が通る
- ドキュメント（docs/）が最新の実装と一致する
