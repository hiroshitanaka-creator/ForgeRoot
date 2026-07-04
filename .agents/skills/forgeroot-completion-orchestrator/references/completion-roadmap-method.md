# Completion Roadmap Method(Completion Ledgerの作り方)

「完成」の定義は blueprint §13 のPhaseロードマップ。Completion Ledger はそれを証拠付きで追跡する表。
ユーザーが「Completion Ledgerを出して」「完成までどれくらい？」と言ったら、この方法で作る。

## 手順

1. `origin/main` の git log からマージ済みT番号を抽出する(推測禁止)
2. open PR を確認し「進行中」を特定する
3. 各Phaseの必須成果物(blueprint §13)に対して、実在する成果物を file path で紐付ける
4. 欠けているタスクを canonical task source と handoff から列挙する
5. 各Phaseを 未着手 / 進行中 / 実質完了 / 完了宣言済み の4状態で評価する
6. 「完了宣言」はユーザー承認事項。Codexが勝手にPhase完了を宣言しない

## Phaseごとのエントリ形式

```
Phase: <番号と名前>
Goal: <blueprint §13のゴール>
Required artifacts: <必須成果物>
Current evidence: <file path / PR番号 / commit hash>
Missing tasks: <T番号と一言説明>
Blocking risks: <進行を止めうるリスク>
Next PR: <次に出すべきPR>
Human approval needed: <ユーザー承認が要る箇所>
```

## 2026-07-03 監査時点のスナップショット(次回は必ず再検証すること)

| Phase | 状態 | 主な証拠 | 主な欠け |
|---|---|---|---|
| 0: Forge Kernel | 実質完了 | T001–T008, T014 merged(`crates/forge-kernel/`、`.forge/`、`app-manifest.json`) | 実稼働GitHub App / lab repoの実証 |
| 1: Forging loop | manifest層は完了 | T015–T028, T040–T041 merged(`packages/planner`〜`forge-demo`) | live transport層、CI(`.github/workflows/`が空)、実issueからの実PR生成実証 |
| 2: memory + eval | 進行中 | T042–T045 merged(`packages/eval`、`.forge/memory/root.forge`、`.forge/evals/`) | T029–T031(PR #1/#2で重複係争中)、eval DSL本体、fitness engine、MemoryKeeper runtime |
| 3: bounded self-evolution | foundation着手 | PR #8 (T046 prompt patcher, draft) | mutation taxonomy残り、shadow eval統合、rollback、EvolutionGuard |
| 4: federation | 未着手 | `.forge/network/` は .gitkeep のみ | treaty schema以降すべて |
| 5: self-hosting | 未着手 | なし | すべて |

## 完成に向けた構造的ギャップ(Ledger作成時に必ず言及)

1. **CIが無い**: 全テストがローカル実行頼み。Phase 1完了条件「issueからreviewable PRを安全生成」の検証にCIが実質必須。CI導入はclass C(workflow追加)なのでユーザー承認が要る
2. **manifest層とlive層のギャップ**: T028までのループは「計画書の連鎖」であり、実際にGitHubを動かす transport 層は未実装(意図的な設計)。live化はclass C/D の連続になる
3. **重複PR係争**: PR #1 と PR #2(どちらもT029–T031)の採択判断が Phase 2 のブロッカー
4. **root hygiene**: upload由来の重複ファイルが監査ノイズになっている(class Aで清掃可能)
