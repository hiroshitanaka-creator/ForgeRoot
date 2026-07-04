# ForgeRoot Handoff Template

`docs/ops/thread-handoff-after-<task>.md` に置く。タスクのPRに同梱する。

```markdown
# ForgeRoot Thread Handoff: after <task>

Date: <YYYY-MM-DD> UTC

## Current phase
<Phase番号と名前。例: Phase 2 — memory + evaluation>

## Current task
<T番号とタスク名、状態(merged / PR open / 未完)>

## What changed
<file path付きで変更点を列挙>

## What passed
<実行したコマンドと結果。例: `npm --prefix packages/eval test` — 12/12 pass>

## What failed
<失敗したもの。なければ「なし」。隠さない>

## What was not attempted
<やっていないこと・検証していないことを明示>

## Open PRs
<PR番号・タイトル・状態(draft/ready/stale/duplicate)の一覧>

## Next recommended task
<T番号と根拠(canonical task source / blueprint節 / 依存関係)>

## Exact next command
<次のセッションがコピペで開始できる起動文またはコマンド>

## Risks
<未解決リスク・注意点>

## Files to read first
<次のセッションが最初に読むべき3〜5ファイル>
1. TASK_PROGRESS.md
2. <このhandoff自身>
3. <タスク固有のファイル>
```
