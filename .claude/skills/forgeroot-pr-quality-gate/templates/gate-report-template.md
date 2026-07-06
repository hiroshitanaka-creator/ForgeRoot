# Quality Gate Report Template

PR本文の `## Verification result` の直後に、この形式で貼る。虚偽記載禁止: 未実行のパスは「未実行 + 理由」と書く。

```markdown
## Quality gate report

Skill: forgeroot-pr-quality-gate

### G0 設計ルール
- 適用したルール: <例: R1 単一検証コア / R2 再計算突き合わせ / R3 allowlist / R7 fail-closed>
- 検証コアの共有箇所: <例: src/xxx.ts の validateShape() を create/validate 双方が使用>

### G2 敵対的セルフレビュー
| パス | 対象クラス | 周回1 | 周回2 | 最終 |
|---|---|---|---|---|
| P1 改ざん | C1,C6 | 発見N件 | 0件 | pass |
| P2 fail-open | C2 | | | |
| P3 不可能値 | C3 | | | |
| P4 リプレイ | C4 | | | |
| P5 網羅 | C5,C9 | | | |
| P6 境界・整合 | C7,C8,C10 | | | |

- 発見と修正の要約: <何を見つけ、どう総ざらいしたか。該当なしなら「初回完走」>

### G3 否定テスト
- tamper-harness: <テストファイルパス + 改ざんケース数 + 結果>
- フィールド網羅表: 空セル <0件 / N件(理由)>
- multi-op系列 / グラフ系: <該当あり: ケース数と結果 / 該当なし>

### G4 機械検査
- npm test: <結果>
- npm run build: <結果>
- cargo test --workspace --locked: <結果 / 未実行+理由>
- git diff --check: <結果>
- mojibakeスキャン: <結果>
- 正準API名grep: <blueprint上の名前 → exportの有無>
```
