# ForgeRoot Audit Report Template

「ForgeRootを監査して」と言われたときの報告形式。すべての行に証拠(path / PR番号 / hash / コマンド出力)を付ける。

```markdown
## ForgeRoot Audit Report(<日付>)

### 現在地
- main の最新commit: <hash> <一言>
- 最後にマージされたタスク: <T番号>(証拠: git log / PR番号)
- 現在のPhase: <Phase番号>(証拠: Completion Ledger該当行)

### Open PR
| PR | タイトル | 状態 | 鮮度 | 判定 |
|---|---|---|---|---|
| #N | ... | draft/ready | fresh/stale | マージ推奨/保留/重複/... |

### Source of truth 整合性
- TASK_PROGRESS.md: 一致 / stale(どこが)
- README.md status節: 一致 / stale(どこが)
- 矛盾報告: なし / あり(両側の出典を引用)

### テスト・ビルド状況
- 実行したコマンドと結果(実行していなければ「未実行」と書く)
- CI: あり / なし(2026-07時点: .github/workflows/ は空)

### Blocked / unsafe / stale
1. <進行を妨げている事項を優先度順に>

### 危険度サマリ
- 現在進行中の変更のclass判定
- ユーザー承認待ちの事項

### 推奨: 次の一手
<Next Action Card 1枚>

## User Decision Card
推奨:
選択肢A:
選択肢B:
選択肢C:
危険度:
次にあなたがすること:
Codexが次にすること:
止めるべき条件:
```
