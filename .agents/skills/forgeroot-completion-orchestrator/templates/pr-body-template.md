# ForgeRoot PR Body Template

すべてのPR本文はこの形式で書く。draft PRで作成し、ready化・マージはユーザー判断。

```markdown
## Summary
<このPRが何をするか、非エンジニアが読める1〜3文>

## Task
<T番号 / issue参照 / 根拠となるhandoff・task sourceへのリンク>

## Scope
<実際に変更したパスの列挙(mutable pathsと一致していること)>

## Out of scope
<意図的にやっていないこと。次のPR候補になるものはT番号候補も書く>

## Risk class
<A / B / C / D + 判定理由1行>

## Safety boundaries
<このPRが守っている境界を明記。例:>
- No live GitHub transport / no merge / no approve
- No writes to .forge/policies/** or .github/workflows/**
- Dry-run / manifest-only(該当する場合)
- No secrets read or written

## Test plan
<実行したコマンドを列挙>

## Verification result
<コマンドごとの実結果。pass数 / fail数 / 未実行は「未実行 + 理由」>

## Changed files
<ファイル数と主要ファイルの一覧>

## Rollback
<取り消し方法。通常は「このPRをrevert(GitHubのRevertボタン)で完全に戻る」+ 例外があれば明記>

## Handoff
<同梱したhandoffファイルのパス>

## Human review checklist
- [ ] Scopeが1 taskに収まっている
- [ ] class C/Dパスに触れていない(触れる場合は事前承認済み)
- [ ] Verification resultに未実行・失敗の隠蔽がない
- [ ] secretが含まれていない
- [ ] handoffとTASK_PROGRESS.mdが更新されている
```
