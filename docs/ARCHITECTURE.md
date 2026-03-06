# ARCHITECTURE.md

## 1. 位置づけ

- 要件の正本は SPEC.md
- 運用方針の正本は RUNBOOK.md
- 本書はアーキテクチャ設計の正本であり、実装はこれに準拠する

## 2. 設計原則

- **Hexagonal Architecture（Ports & Adapters）**: Core は外部依存を一切持たず、Port（interface）のみに依存する
- **KISS**: 最小限の抽象化で動作するコードを書く
- **YAGNI**: 今必要ない機能は作らない
- **DI（依存性注入）**: 組み立ては呼び出し側が行う

## 3. システム境界

```
┌─────────────────────────────────────────────┐
│                  Core Domain                 │
│                                              │
│  Segmenter → EpisodicMemory → FSRS          │
│              ConsolidationPipeline           │
│              SemanticMemory                  │
│              Retrieval                       │
│                                              │
│  依存するのは Port（interface）だけ          │
└──────────┬──────────────────┬───────────────┘
           │                  │
      LLMPort             StoragePort
      (interface)         (interface)
           │                  │
    ┌──────┴──────┐    ┌──────┴──────┐
    │  Adapters   │    │  Adapters   │
    ├─────────────┤    ├─────────────┤
    │ Vercel AI   │    │ SQLite      │
    │ (Anthropic) │    │ (Postgres)  │
    │             │    │ in-memory   │
    └─────────────┘    └─────────────┘

() = 将来追加予定
```

## 4. ディレクトリ構成

```
src/
├── core/                    # Core Domain（外部依存なし）
│   ├── domain/
│   │   ├── episode.ts       # Episode エンティティ
│   │   ├── semantic-fact.ts # SemanticFact エンティティ
│   │   ├── fsrs.ts          # FSRS 純粋関数
│   │   ├── types.ts         # 共有型定義
│   │   └── utils.ts         # ドメインユーティリティ（XML エスケープ等）
│   ├── segmenter.ts         # イベントセグメンテーション
│   ├── episodic.ts          # エピソード記憶サービス
│   ├── consolidation.ts     # 意味記憶統合パイプライン
│   ├── semantic-memory.ts   # 意味記憶サービス
│   └── retrieval.ts         # 記憶検索サービス
│
├── ports/                   # Port（Interface 定義）
│   ├── llm.ts              # LLMPort
│   └── storage.ts          # StoragePort
│
├── adapters/                # Adapter（外部依存はここだけ）
│   ├── llm/
│   │   ├── vercel-ai.ts    # Vercel AI SDK adapter
│   │   └── utils.ts        # LLM adapter 共有ユーティリティ
│   └── storage/
│       ├── sqlite.ts       # SQLite adapter（bun:sqlite）
│       ├── in-memory.ts    # In-memory adapter（テスト用）
│       └── parse-helpers.ts # JSON パース・バリデーションヘルパー
│
└── index.ts                 # Public API + DI
```

## 5. Port 定義

### 5.1 LLMPort

```typescript
// src/ports/llm.ts
import type { ChatMessage } from "../core/domain/types.ts";

/** Schema definition for structured output */
export interface Schema<T> {
	parse(data: unknown): T;
}

/** LLM Port — Core depends only on this interface */
export interface LLMPort {
	/** 自由形式のチャット応答 */
	chat(messages: ChatMessage[]): Promise<string>;
	/** 構造化出力（JSON Schema 準拠） */
	chatStructured<T>(messages: ChatMessage[], schema: Schema<T>): Promise<T>;
	/** テキストの埋め込みベクトルを生成 */
	embed(text: string): Promise<number[]>;
}
```

### 5.2 StoragePort

```typescript
// src/ports/storage.ts
export interface StoragePort {
	// エピソード記憶
	saveEpisode(userId: string, episode: Episode): Promise<void>;
	getEpisodes(userId: string): Promise<Episode[]>;
	getEpisodeById(userId: string, episodeId: string): Promise<Episode | null>;
	getUnconsolidatedEpisodes(userId: string): Promise<Episode[]>;
	updateEpisodeFSRS(userId: string, episodeId: string, card: FSRSCard): Promise<void>;
	markEpisodeConsolidated(userId: string, episodeId: string): Promise<void>;

	// 意味記憶
	saveFact(userId: string, fact: SemanticFact): Promise<void>;
	getFacts(userId: string): Promise<SemanticFact[]>;
	getFactsByCategory(userId: string, category: FactCategory): Promise<SemanticFact[]>;
	invalidateFact(userId: string, factId: string, invalidAt: Date): Promise<void>;
	updateFact(
		userId: string,
		factId: string,
		updates: Partial<Omit<SemanticFact, "id" | "userId">>,
	): Promise<void>;

	// メッセージキュー
	pushMessage(userId: string, message: ChatMessage): Promise<void>;
	getMessageQueue(userId: string): Promise<ChatMessage[]>;
	clearMessageQueue(userId: string): Promise<void>;

	// 検索
	searchEpisodes(userId: string, query: string, limit: number): Promise<Episode[]>;
	searchFacts(userId: string, query: string, limit: number): Promise<SemanticFact[]>;
}
```

## 6. データモデル

### 6.1 Episode

| フィールド     | 型             | 説明                             |
| -------------- | -------------- | -------------------------------- |
| id             | string         | UUID                             |
| userId         | string         | ユーザー識別子                   |
| title          | string         | エピソードのタイトル（LLM 生成） |
| summary        | string         | エピソードの要約（LLM 生成）     |
| messages       | ChatMessage[]  | 元のメッセージ列                 |
| embedding      | number[]       | summary の埋め込みベクトル       |
| surprise       | number         | 驚きスコア（0.0 - 1.0）          |
| stability      | number         | FSRS stability パラメータ        |
| difficulty     | number         | FSRS difficulty パラメータ       |
| startAt        | Date           | エピソード開始時刻               |
| endAt          | Date           | エピソード終了時刻               |
| createdAt      | Date           | 作成日時                         |
| lastReviewedAt | `Date \| null` | 最後にレビューされた日時         |
| consolidatedAt | `Date \| null` | 意味記憶に統合された日時         |

### 6.2 SemanticFact

| フィールド        | 型             | 説明                    |
| ----------------- | -------------- | ----------------------- |
| id                | string         | UUID                    |
| userId            | string         | ユーザー識別子          |
| category          | FactCategory   | 事実のカテゴリ          |
| fact              | string         | 事実の内容              |
| keywords          | string[]       | キーワード              |
| sourceEpisodicIds | string[]       | 出典エピソード ID       |
| embedding         | number[]       | fact の埋め込みベクトル |
| validAt           | Date           | 有効開始日時            |
| invalidAt         | `Date \| null` | 無効化日時              |
| createdAt         | Date           | 作成日時                |

### 6.3 FSRSCard

| フィールド     | 型             | 説明               |
| -------------- | -------------- | ------------------ |
| stability      | number         | 記憶の安定性       |
| difficulty     | number         | 学習難易度         |
| lastReviewedAt | `Date \| null` | 最後のレビュー日時 |

### 6.4 ChatMessage

```typescript
// src/core/domain/types.ts
export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
	role: MessageRole;
	content: string;
	timestamp?: Date;
}
```

## 7. 主要シーケンス

### 7.1 メッセージ追加 → セグメンテーション

1. `addMessage(userId, message)` を呼ぶ
2. メッセージキューに追加
3. softTrigger 到達 → LLM にセグメント判定を依頼（省略可能）
   3'. hardTrigger 到達 → 強制セグメンテーション
4. LLMPort.chatStructured() でセグメント境界、title、summary、surprise を一括判定
5. 各セグメントについて LLMPort.embed() で embedding 生成、FSRS 初期化、StoragePort.saveEpisode()
6. 処理済みメッセージをクリア、残りを再キューイング

### 7.2 意味記憶統合

1. `consolidate(userId)` を呼ぶ
2. `StoragePort.getUnconsolidatedEpisodes()` で未統合エピソードを取得
3. 各エピソードを逐次処理（事実の状態が変わるため順序保証が必要）:
   a. `StoragePort.getFacts()` で現在の既存事実を取得
   b. `LLMPort.chatStructured()` でエピソードと既存事実一覧を入力し、
   事実の抽出とアクション決定（New/Reinforce/Update/Invalidate）を一括実行
   c. 各抽出事実のアクションに応じて:
   - New: `LLMPort.embed()` で embedding 生成 → `StoragePort.saveFact()`
   - Reinforce: `StoragePort.updateFact()` で sourceEpisodicIds に追加
   - Update: `StoragePort.invalidateFact()` → New と同じ処理
   - Invalidate: `StoragePort.invalidateFact()`
     d. `StoragePort.markEpisodeConsolidated()` で統合済みマーク

### 7.3 記憶検索

1. 呼び出し側が `retrieve(userId, query)` を呼ぶ
2. StoragePort.searchEpisodes() + searchFacts() で候補を取得
3. RRF でスコアを統合
4. エピソード記憶は FSRS retrievability で追加リランキング
5. 上位 N 件を返却

## 8. エラーハンドリング

- LLM 呼び出し失敗: リトライ（最大3回）→ エラーを上位に伝播
- ストレージ書き込み失敗: エラーを上位に伝播（呼び出し側で処理）
- セグメンテーション失敗: メッセージキューを保持し、次回の追加時に再試行

## 9. テスト配置

```
tests/
├── core/
│   ├── domain/
│   │   ├── episode.test.ts
│   │   ├── semantic-fact.test.ts
│   │   ├── fsrs.test.ts
│   │   └── utils.test.ts
│   ├── segmenter.test.ts
│   ├── episodic.test.ts
│   ├── consolidation.test.ts
│   ├── semantic-memory.test.ts
│   └── retrieval.test.ts      (M4予定)
├── integration/
│   └── segmenter-sqlite.test.ts
├── adapters/
│   ├── llm/
│   │   ├── vercel-ai.test.ts
│   │   └── utils.test.ts
│   └── storage/
│       ├── sqlite.test.ts
│       ├── in-memory.test.ts
│       └── parse-helpers.test.ts
└── index.test.ts
```

## 10. 設計上の決定

| 決定                                      | 理由                                                             |
| ----------------------------------------- | ---------------------------------------------------------------- |
| ライブラリとして提供（HTTP サーバーなし） | vicissitude から直接 import で使えるほうがシンプル               |
| Hexagonal Architecture                    | LLM/Storage の差し替え容易性、テスト容易性                       |
| SQLite（bun:sqlite）                      | 組み込みで依存なし、vicissitude と同じ Bun ランタイム            |
| FSRS アルゴリズム                         | plast-mem で実証済み、記憶の減衰モデルとして自然                 |
| Vercel AI SDK を LLM adapter              | Embedding / Structured output ネイティブ対応、プロバイダー非依存 |
