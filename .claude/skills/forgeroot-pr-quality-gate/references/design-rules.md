# Design Rules(G0: コードを書く前に適用する予防ルール)

各ルールは `codex-finding-taxonomy.md` の指摘クラスを**発生させない**ための設計判断。実装後に検出するのではなく、書く前に構造で潰す。

## R1: 単一検証コア(対C1)

`create*` と `validate*` は**同一の検証関数群**を通す。

```
共通コア: validateShape(manifest)  … 全フィールドのallowlist/型/意味検証
create*  = 入力検証 → 構築 → validateShape(生成物) を通してから返す
validate* = validateShape(manifest) + R2の再計算突き合わせ
```

- validate側に「createで検証済みだから省略」という分岐を作らない
- 「acceptedならこのチェック、rejectedならあのチェック」と分ける場合も、**まずstatus自体をallowlistで検証**し、どの分岐でも共通コアを通す
- 検証ロジックをcreateとvalidateにコピペしない(divergenceがC1の温床)。関数を共有する

## R2: validate = 再構築と同値検証(対C1, C6)

読み戻したmanifestの**導出フィールドは全て再計算して突き合わせる**:

- digest: canonical payloadから再計算 → 一致確認
- 決定的ID(proposal_id / mutation_id等): fingerprintを再計算 → 一致確認
- derivedな配列(lineage_events / diff summary等): 元データ(parents/children/operations)から再導出 → 内容一致確認(存在確認だけでは不十分)

「フィールドが存在し型が正しい」は検証ではない。「この内容からこの値になるはずだ」まで確認して初めて改ざん耐性になる。

## R3: enum/status/decisionはallowlist(対C2)

```js
// 禁止(denylist / fail-open)
if (decision === "speciation_proposal_ready") reject();

// 必須(allowlist / fail-closed)
const ALLOWED_DECISIONS = ["blocked_by_forbidden_target", "invalid_speciation_input"];
if (!ALLOWED_DECISIONS.includes(decision)) reject();
```

未知キーも同様: 仕様が拡張を許すなら明示的にそう書き、許さないなら未知キーを拒否する。素通りは禁止。

## R4: 意味検証(対C3)

構文(正規表現)を通ったら意味を検証する:

- **timestamp**: 正規表現の後に `Date.parse` し、さらに**round-trip**(`new Date(s).toISOString()` が正規化後の元文字列と一致)で `2026-99-99` 型の不可能値を弾く
- **数値**: `Number.isFinite` + 範囲(負数・0・上限)
- **文字列**: 空文字・空白のみ・長さ上限
- **URI/パス**: suffix空・正準プレフィックス・トラバーサル(`..`)

## R5: multi-opはリプレイ検証(対C4)

複数opのpatchは、**working stateにopを1つずつ適用しながら**検証する:

1. 元状態のコピーをworking stateとする
2. 各opをworking stateに対して検証(存在確認・重複確認はworking state基準)・適用
3. 最終状態で全不変条件(重複なし・件数上限・必須route残存等)を再検証

元状態だけと比較すると「途中で空けた名前の再利用を誤拒否」「途中で作った重複を見逃し」の両方が起きる(PR #14で両方向とも実証済み)。

## R6: フィールド網羅表(対C5, C6)

仕様(docs/specs/)の全フィールドについて、次の4列の表を作り、**全セルを埋めてからPRにする**(表はgate reportに添付):

| フィールド | 検証あり? | digestに含む? | diff summaryに出る? | 否定テストあり? |

- digestは「選んだフィールドをhash」ではなく**canonical化したmanifest全体をhash**する設計を優先(取りこぼしが構造的に消える)
- diff summaryは「変更があり得る全フィールド」を変更検出の対象にする(fallback-only変更の取りこぼしがC5の実例)
- allowlist(namespace等)は「route名が現れる**全ての**フィールド」(name / fallback / 将来の追加)に適用する

## R7: fail-closed(対C7)

- validatorは**throwしない契約**。壊れた入力(null / 欠落 / 型違い)でも `{ ok: false, issues }` を返す
- ネストしたオブジェクトの参照は必ずガードする(`isRecord(x)` ヘルパー経由でのみ辿る)。**配列も同様**: `.length` / `.map` の前に `Array.isArray` を確認する
- **ガード関数自身もガードの対象**: 形状検証関数や再構成関数の中に無ガード参照を残さない(PR #29: shape checkの後に走る再構成コードが `quarantine.reasons.length` でthrowした)
- エラー時のearly returnで**後続の分類を隠さない**: 高リスク分類(forbidden target等)は、他の入力エラーがあっても検出・報告する(PR #15: malformed `now` が `blocked_by_forbidden_target` 分類を隠した)。issuesは集めてから返す

## R8: 正準API名の同期(対C8)

- 実装**前**に `00_ForgeRoot_blueprint_設計書_続き.md` のinterface registryを対象T番号でgrepし、正準関数名を控える
- 正準名を必ずexportする(実装名が別ならaliasを張る)
- G4で `grep <正準名> packages/<pkg>/src/index.ts` を機械確認項目に入れる

## R9: データ保存性(対C9)

- 再構築・正規化の経路で、**触っていないエントリのスキーマ許容フィールドを暗黙に落とさない**
- 方針は2択で仕様に明記する: (a) 未知フィールドを保存する(round-trip保証)、(b) 未知フィールドを明示拒否する。「黙って捨てる」は禁止
- after-state/digestは「実際にファイルに書かれるはずの内容」と一致させる

## R10: グラフ不変条件(対C10)

lineage等のグラフを扱うときは3方向をチェックする:

1. **子孫方向**: 提案childが既存の子孫に居ないか
2. **祖先方向**: 提案childのIDが祖先(`evolution.parents` の推移閉包)に居ないか
3. **自己参照**: 各ノードが自分自身を親に持っていないか(入力データ自体の腐敗検出)

腐敗した入力グラフ(自己循環parent)から新しい提案を作らない。検出したらreject/quarantineする。

## R11: 棄却レコードは空の封筒(対C13)

invalid/rejectedを表すレコードは、**issues+理由コード+正準の空セクション**だけを持つ。部分的に正規化した入力データを持ち回らない。

- collectorのinvalid出力は常に同一形状の空セクション(空PR ref・空配列・null)を格納する
- validateは棄却レコードに対して「空の封筒と完全一致」+「reasons ↔ issuesコードの厳密一致」を要求する
- 効果: (a) `validate(collect(x)).ok === true` が全入力で成立(正規化の欠損に依存しない)、(b) 正常レコードの偽装再鋳造はセクションが空でないため即検出

## R12: ハッシュは改ざん検出であって内容検証ではない(対C11)

決定的ハッシュ/IDは誰でも再計算できる。「ID再計算したら通る」経路を前提に、内容ルールを独立に検証する:

- 全階層のキーをallowlistで検証し、未知キーは `unknown_key` で明示拒否する
- 「ハッシュが合っているから内容も正しい」とする検証を書かない。tamper-harnessでも、未知キー注入がID再計算後でも落ちること(=明示ルールで落ちること)を確認する

## R13: 任意フィールドの意味ルールは省略変種を必ずカバー(対C12)

`x !== undefined && 違反` 型の検証は「省略」で素通りする。任意フィールドに意味ルール(例: failed CIは失敗名必須)がある場合:

- 「省略 / null / 空 / 不正値」の4変種を表にして、各変種の期待結果を決めてからコードを書く
- 実装は正規化後の値(`const v = Array.isArray(x) ? x : []` 等)に対してルールを適用し、存在チェックでルール自体をスキップしない
