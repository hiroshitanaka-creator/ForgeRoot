# ForgeRoot Issue Template

T番号タスクをissue化する・タスク定義を書き起こすときの形式。
plan-spec(`docs/specs/plan-spec.md`)の bounded 原則に適合させること。

```markdown
# <T番号> — <タスク名>

## Goal
<このタスクが達成する状態を1〜2文で。機械検証できる言い方にする>

## Why now
<Priority rule / handoff / phase roadmap 上の根拠。出典を引用する>

## Scope
<触ってよいパス(mutable paths)を列挙>
- packages/<name>/**
- docs/specs/<report>.md
- docs/ops/thread-handoff-after-<task>.md
- TASK_PROGRESS.md

## Out of scope
<このタスクで絶対にやらないこと。最低限、以下から該当するものを明記>
- .github/workflows/**(class C)
- .forge/policies/**、.forge/mind.forge(class C/D)
- live GitHub transport / merge / approve
- self-evolution / federation の実行系

## Dependencies
<前提となるマージ済みタスク・PR番号>

## Deliverables
<成果物ファイルを列挙(実装 / tests / validation report / handoff)>

## Acceptance criteria
<機械チェック可能な合格条件。実行コマンド付き>
- [ ] `npm --prefix packages/<name> test` が全件pass
- [ ] <契約境界のテスト: 禁止入力がfail-closedで拒否される>
- [ ] validation report が docs/specs/ に存在する
- [ ] handoff が docs/ops/ に存在する

## Risks
<危険度クラス(A/B/C/D)と、想定される失敗モード>

## Suggested labels
forge:auto / phase-<N> / class-<A|B|C|D>
```
