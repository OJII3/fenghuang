# SPEC.md

## 1. 目的

fenghuang は、AI アシスタント [vicissitude](https://github.com/ojii3/vicissitude) に長期記憶能力を提供するライブラリである。人間の認知記憶システム（エピソード記憶・意味記憶）を模倣し、会話を超えて参加者やトピックに関する知識を蓄積・想起する。

[plast-mem](https://github.com/moeru-ai/plast-mem) にインスパイアされた設計を、Bun + TypeScript のライブラリとして実装する。

## 2. 対象ユーザー

- **主要**: vicissitude（Discord Bot「ふあ」）から DI でインポートして使用
- **将来**: 他の AI アシスタント・チャットボットからも利用可能なライブラリ

## 3. プロダクト要件（MVP）

### 3.1 イベントセグメンテーション

- 連続的な会話の流れを、トピック・意図の変化に基づいてエピソードに分割する
- マルチスピーカー対応: メッセージに speaker name が含まれる場合、セグメンテーションで考慮される
- LLM を使用してセグメント境界と驚きレベル（surprise）を判定する
- セグメンテーションのトリガー条件:
  - softTrigger: メッセージ数が soft 閾値に達した場合、LLM がセグメント判定を行う（省略可能）
  - hardTrigger: メッセージ数が hard 閾値に達した場合、強制セグメンテーション
  - 時間ベーストリガー: 最古のメッセージから一定時間が経過した場合（将来実装予定）

### 3.2 エピソード記憶

- 各エピソードは title, summary, messages, embedding, surprise スコアを持つ
- FSRS（Free Spaced Repetition Scheduler）パラメータ: stability, difficulty
- 時間経過とともに想起確率（retrievability）が減衰する
- エピソードの保存・取得・検索をサポート

### 3.3 意味記憶

- エピソード記憶から持続的な「事実」を抽出する統合パイプライン
- 事実には明示的な主語が含まれ、ユーザーだけでなく任意の参加者・エンティティ・トピックについても抽出可能
- 事実のカテゴリ分類: identity, preference, interest, personality, relationship, experience, goal, guideline
- 統合アクション: New, Reinforce, Update, Invalidate
- 時間的有効性（valid_at / invalid_at）による管理

### 3.4 記憶検索

- クエリに基づいてエピソード記憶・意味記憶を検索する
- ハイブリッド検索: テキスト検索 + ベクトル類似度検索
- Reciprocal Rank Fusion (RRF) によるスコア統合
- FSRS retrievability によるリランキング（エピソード記憶）

### 3.5 FSRS（間隔反復スケジューラ）

- 記憶の減衰モデルとして FSRS アルゴリズムを適用
- 目標保持率: DESIRED_RETENTION = 0.9
- 驚きブースト: surprise が高いエピソードは stability にブーストを受ける
- 記憶が検索で使用されるたびに relevance を評価し、パラメータを更新

## 4. 非機能要件

- **ランタイム**: Bun
- **言語**: TypeScript（strict mode）
- **ストレージ**: SQLite（bun:sqlite）をデフォルトとし、Port 経由で差し替え可能
- **LLM**: Vercel AI SDK をデフォルトとし、Port 経由で差し替え可能
- **テスト可能性**: Core ドメインは外部依存なしでテスト可能（in-memory adapter）
- **アーキテクチャ**: Hexagonal Architecture（Ports & Adapters）

## 5. 受け入れ条件

1. `createFenghuang({ llm, storage })` でインスタンスを生成できる
2. メッセージを追加すると、閾値到達時にエピソードが自動生成される
3. エピソードから意味記憶への統合パイプラインが動作する
4. クエリで記憶を検索でき、FSRS による減衰が反映される
5. in-memory adapter でのユニットテストが全て通る
6. SQLite adapter での統合テストが全て通る
7. Vercel AI SDK adapter で LLM 呼び出しが動作する
