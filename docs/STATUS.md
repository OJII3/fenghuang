# STATUS.md

## 1. 最終更新

2026-03-06 / Claude

## 2. 現在の真実（Project Truth）

- プロジェクトは初期セットアップフェーズ
- ドキュメント体系（SPEC, PLAN, ARCHITECTURE, RUNBOOK, STATUS）を整備中
- 実装コードはまだ存在しない
- Nix flake + direnv で Bun 開発環境は準備済み
- Bun プロジェクト（package.json）は未初期化
- ディレクトリ構成（src/）は未作成

## 3. 確定済み方針

1. Hexagonal Architecture（Ports & Adapters）を採用
2. ライブラリとして提供（HTTP サーバーなし）
3. エピソード記憶 + 意味記憶の両方を実装
4. Storage MVP: SQLite（bun:sqlite）
5. LLM MVP: opencode adapter
6. plast-mem の FSRS / イベントセグメンテーション設計を参考にする

## 4. 直近タスク

1. ドキュメント整備完了
2. Bun プロジェクトセットアップ（package.json, tsconfig, biome）
3. ディレクトリ構成スキャフォルディング
4. M1: Core ドメインエンティティ + FSRS 純粋関数の実装

## 5. ブロッカー

- なし

## 6. リスクメモ

1. bun:sqlite でベクトル検索をどう実現するか要調査（R1）
2. opencode SDK の API 安定性を確認する必要あり（R2）

## 7. 再開時コンテキスト

以下の順序でドキュメントを読み込む:

1. SPEC.md（要件を把握）
2. PLAN.md（マイルストーンと現在位置を把握）
3. ARCHITECTURE.md（設計を把握）
4. RUNBOOK.md（ルールを把握）
5. STATUS.md（最新状態を把握）
