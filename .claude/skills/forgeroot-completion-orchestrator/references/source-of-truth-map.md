# Source of Truth Map(情報源の優先順位)

blueprint `00_ForgeRoot_blueprint_設計書.md` §10 が定める優先順位を採用する。
下位が上位と衝突した場合、下位を採用せず、先に「矛盾報告」を作る。

## 優先順位(設計判断)

1. `00_ForgeRoot_blueprint_設計書.md`(+ `00_ForgeRoot_blueprint_設計書_続き.md`)
2. `01_単語や命名規則.md`
3. `.forge/mind.forge`
4. `.forge/policies/*.forge`(特に `constitution.forge`)
5. `02_README.md`
6. `03_issue.md`(+ `03_issue_続き`、`03_issue_T041-2_integrated.md`)
7. 個別 PR / Issue / 会話ログ

## 優先順位(現在進捗の事実)

「今どこまで進んでいるか」は設計文書ではなく**Git上の事実**で判定する。

1. `origin/main` の git log とマージ済みPR(最強の証拠)
2. open PR の実際の diff と CI/テスト結果
3. `docs/ops/thread-handoff-after-*.md` の最新ファイル
4. `TASK_PROGRESS.md`(**staleになりやすい**。git logと食い違ったらgit logが正)
5. `README.md` の "Current implementation status" 節(更新が遅れがち)
6. `01_DECISION_LOG.md`(確定判断の記録。進捗ではなく判断の正)

## タスク定義の正準ソース

- T001〜T028, T040〜T041: blueprint §14 + `03_issue.md` 系ファイル
- T029〜T039: `docs/specs/t029-t039-canonical-task-source.md` + `docs/specs/fixtures/task-source/t029-t039-canonical.json`
- T042以降: `docs/specs/fixtures/task-source/t042-readiness.json` + 各handoffの "Recommended next target"

## 既知の注意点(2026-07-03監査時点)

- ルート直下に `README (1).md` 〜 `README (64).md`、`index (N).ts`、`run (N).js` 等の**upload由来の重複ファイル**が多数ある。これらは source of truth では**ない**。参照しない
- ルートの `mind.forge` は `.forge/mind.forge` の古い複製。正準は `.forge/mind.forge`(DECISION_LOG D-0001参照)
- `01_単語や命名規則` と `01_単語や命名規則.md` は同一内容の重複。`.md` 付きを正とする
- `ForgeRoot_T0XX_*.diff` / `*_validation_output.txt` はルートに置かれた歴史的成果物。現行の検証レポートは `docs/specs/` 側が正
- README.md の "Current implementation status" は T028 で止まっている(実際は T045 までマージ済み)。矛盾を見つけたら README更新を class A タスクとして提案する

## 矛盾を見つけたときの手順

1. 矛盾の両側を file path + 行/節番号で引用する
2. 上の優先順位でどちらが正かを判定する
3. 修正が必要なら「矛盾解消」を独立した class A/B の bounded PR として提案する(他のタスクに混ぜない)
4. 判定できない場合は「不明」とし、User Decision Card でユーザーに提示する
