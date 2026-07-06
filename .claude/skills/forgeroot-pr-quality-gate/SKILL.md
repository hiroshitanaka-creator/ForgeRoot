---
name: forgeroot-pr-quality-gate
description: Use this skill BEFORE pushing any implementation PR in hiroshitanaka-creator/ForgeRoot. It is the mandatory pre-push quality gate that drives Codex review findings toward zero by (1) applying preventive design rules before writing code, (2) running adversarial self-review passes derived from the real finding taxonomy of past PRs, (3) requiring a tamper-harness and table-driven negative tests, and (4) emitting a gate report into the PR body. Triggers include "品質ゲートを通して", "PRを作る前のチェック", "quality gate", "T0XXを実装して" (as the implementation-phase companion of forgeroot-completion-orchestrator), and any code change under packages/*, crates/*, or .forge/*.
---

# ForgeRoot PR Quality Gate(PR作成前 品質ゲート)

**目的: 1 PRあたり約10件付いていたCodexレビュー指摘を、push前にゼロへ近づける。**

過去PR(#2 / #8 / #14 / #15)の実指摘 計30件超を分類した結果、指摘は**約10クラスの既知パターンの再発**であり、新種はほぼ無い。つまり指摘は「レビューで見つけてもらうもの」ではなく「push前に機械的に潰せるもの」である。このSkillはそのための強制ゲートを定義する。

## 0. 位置づけ

- `forgeroot-completion-orchestrator` が「何をやるか(タスク選定〜PR発行)」を決めるのに対し、このSkillは「**実装をどう作り、pushしてよいかをどう判定するか**」を決める。
- orchestrator の operating loop の step 9(実装)〜11(PR本文作成)の間に、このゲートを**必ず**挟む。
- コード変更を含むPRは、このゲートの**全Phase通過なしにpushしてはならない**。docs-onlyのPRは Phase G4(機械検査)のみでよい。
- どのモデル(Claude / Codex / Sonnet等)がこのリポジトリで実装しても、このゲートを適用する。

## 1. ゲートの全体像

```
G0 設計ルール適用   … コードを書く前に references/design-rules.md を読み、該当ルールを設計に織り込む
G1 実装             … G0のルールに従って実装(単一検証コア・allowlist・fail-closed が既定)
G2 敵対的セルフレビュー … references/adversarial-review-passes.md の全パスを実行。指摘ゼロの完走1回が出るまで反復
G3 否定テスト網羅   … references/negative-test-catalog.md の表を埋める。tamper-harness必須
G4 機械検査         … test / build / git diff --check / mojibake / 正準API名grep
G5 ゲートレポート   … templates/gate-report-template.md をPR本文に添付
```

**G2〜G4で1件でも問題が出たら、点修正せず orchestrator の「点修正禁止ルール」(4点セット総ざらい)で修正してから、G2を最初からやり直す。**

## 2. G0: 設計ルール(コードを書く前)

`references/design-rules.md` を読む。特に検証系コード(validator / manifest / parser)を書くタスクでは、以下を設計段階で決めてから書き始める。

1. **単一検証コア**: `create*` と `validate*`(読み戻し検証)が**同一の検証関数**を通る構造にする。validate側だけ弱い、が最大の指摘源(全指摘の約4割)
2. **validate = 再構築と同値検証**: 読み戻したmanifestのdigest・決定的IDは**再計算して突き合わせる**。信用して素通ししない
3. **enum/status/decisionはallowlist**: 「悪い値を1つ弾く」denylistは禁止。「良い値だけ通す」
4. **fail-closed**: validatorは壊れた入力でthrowせず `{ ok: false, issues }` を返す
5. **正準API名の確認**: blueprint(`00_ForgeRoot_blueprint_設計書_続き.md` のinterface registry)に載っている関数名を実装前にgrepし、正準名をexportする

## 3. G2: 敵対的セルフレビュー

`references/adversarial-review-passes.md` の6パス(P1〜P6)を、**Codexになったつもりで**自分の差分に対して実行する。各パスは `references/codex-finding-taxonomy.md` の指摘クラスと1対1で対応している。

- 実行順は P1→P6。1件でも発見したら記録し、総ざらい修正後に**P1からやり直す**
- ゲート通過条件: **全6パスを指摘ゼロで完走すること1回**
- 3周しても新規発見が止まらない場合は設計欠陥(単一検証コア違反が典型)。実装を直すのをやめ、設計からやり直す

## 4. G3: 否定テスト網羅(tamper-harness必須)

`references/negative-test-catalog.md` に従い:

1. **網羅表**: 仕様(docs/specs/)の全フィールド × 全異常系の表を作り、テストが無いセルを潰す
2. **tamper-harness**: acceptされたmanifestの**全フィールドを1つずつ機械的に改ざんし、validateが全て失敗することをループで検証するテスト**を必ず入れる。これはクラスC1(検証非対称)を機械的に殺す最重要テスト。書き方の雛形はカタログ内にある
3. 手で書いた「代表例テスト」だけで済ませない。表引き(table-driven)でフィールドを列挙する

## 5. G4: 機械検査

全て実行し、結果(pass/fail/未実行+理由)を記録する:

```
npm test                              # または npm --prefix packages/<name> test
npm run build                         # tsc型チェックを含む
cargo test --workspace --locked      # Rust変更時。環境に無ければ「未実行+理由」
git diff --check origin/main...HEAD  # 空白・パッチ崩れ
grep で mojibake(文字化け)スキャン    # 過去PRの検査項目を踏襲
blueprint interface registry のAPI名と export の突き合わせ(grep)
```

## 6. G5: ゲートレポート

`templates/gate-report-template.md` を埋め、PR本文の `## Verification result` の直後に `## Quality gate report` として貼る。虚偽記載は禁止: 実行していないパスは「未実行」と書く。

## 7. レビュー指摘が来てしまった場合

ゲートを通してもなお指摘が来たら:

1. orchestrator の点修正禁止ルール(4点セット)で総ざらい修正する
2. **その指摘を `references/codex-finding-taxonomy.md` に新クラスまたは既存クラスの新実例として追記するPRを別途起こす**(taxonomyを成長させる。これがこのゲートの学習ループ)
3. 同じPRに2回連続で新規指摘 → 点修正即中止・総ざらい switch(既存ルールを踏襲)

## References

| ファイル | いつ読むか |
|---|---|
| `references/codex-finding-taxonomy.md` | 指摘クラスの定義と実例を確認するとき(G2の前提知識) |
| `references/design-rules.md` | G0で設計を決めるとき |
| `references/adversarial-review-passes.md` | G2のパスを実行するとき |
| `references/negative-test-catalog.md` | G3のテストを書くとき |
| `templates/gate-report-template.md` | G5でPR本文に貼るとき |
