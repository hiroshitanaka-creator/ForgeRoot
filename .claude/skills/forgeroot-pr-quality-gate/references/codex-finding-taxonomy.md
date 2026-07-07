# Codex Finding Taxonomy(実指摘の分類台帳)

このリポジトリの過去PRに実際に付いたCodexレビュー指摘を、再発防止可能な**クラス**に分類した台帳。
G2(敵対的セルフレビュー)の各パスはこのクラスと対応する。新しい指摘が来たら、このファイルに実例を追記する(SKILL.md §7)。

集計元: PR #2(レビュー3巡・5系統)、PR #14(8件)、PR #15(13件)。2026-07-04時点。

## C1: 検証の非対称性(create強・validate弱)— 最頻・全体の約4割

`create*` は入力を厳しく検証するのに、`validate*`(読み戻し/改ざんmanifestの再検証)が同じ検証を再実行しない。改ざんされたmanifestが `{ ok: true }` で素通りする。

実例(すべてPR #14/#15):
- 改ざんされた非agentターゲット(`.forge/policies/constitution.forge`)がvalidate素通り(#15)
- 決定的ID(`proposal_id` / `mutation_id`)を書き換えてもfingerprint再計算をしないため素通り(#15)
- `review_gate.risk` を high から下げても素通り(#15)
- `human_review_required_before_execution` / `_before_merge` をfalseに反転しても素通り(#14)
- rejectedだったmanifestの `status`/`decision` だけをproposedに書き換えると素通り(#14)
- `patch_format` 書き換え・非null `patch_ref` 注入が素通り(#15)

**対策**: design-rules R1(単一検証コア)+ R2(再計算突き合わせ)+ negative-test-catalog のtamper-harness。

## C2: fail-open列挙検証(denylist)

enum/status/decision フィールドで「既知の悪い値を1つ弾く」だけの実装。未知の値・typo・別の悪い値が素通りする。

実例:
- rejected manifestの `decision` が `speciation_proposal_ready` **以外なら何でも**通る(`approved` でも通る)(#15)
- `status` が正確に `dry_run_valid` でない場合に**全shape検証をスキップ**し、かつstatus自体のallowlist検証が無い(#15)
- (PR #2系)未知キーの素通り

**対策**: design-rules R3(allowlist必須)。

## C3: 形だけの形式検証(構文OK・意味NG)

正規表現など構文チェックだけで、意味的に不可能な値を受理する。

実例:
- `2026-99-99T99:99:99Z` がRFC3339正規表現を通過し、lineage証跡として保存される(#15)
- (PR #2系)空suffix URI、NaN/Infinityの素通り、nullable文字列型の未検証

**対策**: design-rules R4(意味検証: Dateパース+round-trip等)。

## C4: リプレイ状態不一致(multi-op patch)

複数opのpatchを検証するとき、各opを**元の状態**に対して検証し、opを順に適用した**後の状態**に対して検証しない。

実例:
- replaceでroute名を変えた後、同名routeをaddすると最終的に重複するのに受理(#14)
- 逆に、replaceでrouteを空けてから同名addする正当なpatchを「既に存在する」と誤って拒否(#14)

**対策**: design-rules R5(working stateにopを順次適用し、最終状態+中間状態で不変条件を検証)。

## C5: 網羅性の穴(一部フィールドだけ処理)

digest・diff summary・allowlist適用などが、仕様上対象のはずのフィールドの一部を取りこぼす。

実例:
- `proposal_digest` がparent/child summaryを含まず、意味の異なる2 proposalが同一digestになる(#15)
- fallbackのみ変更したreplaceがdiff summaryに現れない(#14)
- `fallback` route名にnamespace allowlistが適用されず、禁止namespaceへのfallbackが素通り(#14)

**対策**: design-rules R6(フィールド網羅表: 検証/digest/summary/否定テストの4列を全フィールドで埋める)。

## C6: 相互整合性未検証(cross-field consistency)

個々のフィールドは正しいが、フィールド間の整合を検証しない。

実例:
- `lineage_events[0].child_species` を無関係な種に書き換えても、実際のparents/childrenと突き合わせないため素通り(#15)

**対策**: design-rules R2 + R6。derived field(events / digests / IDs)は必ず元データから再導出して比較。

## C7: fail-closed違反(壊れた入力でthrow)

validatorが `{ ok: false }` を返す代わりにクラッシュする。監査経路が例外で死ぬ。

実例:
- `review_gate` が欠落/nullのmanifestでプロパティ参照がthrowし、issuesを返せない(#15)

**対策**: design-rules R7(全ネスト参照をガード。validatorはthrowしない契約)。

## C8: 正準名との乖離(blueprint interface registry)

blueprintのinterface registryに載っている正準API名がexportされていない。

実例:
- 設計書は `applyToolRoutingPatchDryRun(input)` を定義しているが、exportは `applyToolRoutingDryRun` のみ(#14)

**対策**: design-rules R8(実装前に設計書をgrepし、正準名exportをG4で機械確認)。

## C9: データ保存性違反(正規化で情報が消える)

正規化・再構築処理が、触っていないエントリのスキーマ許容メタデータを暗黙に落とし、digest/after-stateが実態とズレる。

実例:
- `applyOp` が全 `tools[]` を `readTools` で正規化するため、無関係routeの拡張フィールドが消えた状態で `after_digest` が計算される(#14)

**対策**: design-rules R9(未知だが許容されるフィールドは保存するか、明示拒否するか、仕様で決める。暗黙に落とすのは禁止)。

## C10: グラフ不変条件の欠落(cycle / 自己参照)

lineage等のグラフ構造で、循環・自己参照の検出が片方向しかない。

実例:
- 提案childのIDがparentの `evolution.parents`(祖先)に既に居ても受理 → 循環(#15)
- parentが自分自身の `speciation_id` を祖先に持つ自己循環でも受理(#15)

**対策**: design-rules R10(グラフ系は「祖先方向・子孫方向・自己参照」の3方向を必ずチェック)。

## C11: ハッシュ整合性への過信(内容検証の欠落)

決定的ハッシュ/IDによる改ざん検出を「内容の正当性検証」と混同する。外部の作成者はハッシュを**再計算できる**ため、ハッシュ一致は「内容がルールに従っている」ことを何も保証しない。

実例:
- 未知キーを注入したmanifestが、`outcome_id` を再計算すればvalidateを通過する(unknown-keyテストがID陳腐化でしか落ちていなかった)(#29)

**対策**: design-rules R12。ハッシュ検証に加えて、全階層のキーallowlistと値ルールを明示的に検証する。

## C12: 省略変種の未検証(optional fieldの意味ルール)

「フィールドが存在する場合だけ」意味ルールを検証し、**省略された場合**に素通りする。`if (x !== undefined && ルール違反)` の形が典型。

実例:
- `ci.outcome === "failed"` で `failed_check_names` を**省略**すると `failed_requires_names` が発火せず、ready manifestが生成された(present-and-emptyだけ検証していた)(#29)

**対策**: design-rules R13。意味ルールは「省略 / null / 空 / 不正値」の4変種すべてを表で確認する。

## C13: 棄却レコードの設計不全(部分データの持ち回り)

invalid/rejectedを表すレコードが「部分的に正規化された入力データ」を持ち回ると、(a) 正規化の欠損で `validate(collect(x))` の対称性が壊れ、(b) 正常レコードをinvalidに偽装再鋳造する攻撃が検出できなくなる。

実例:
- 不正trailer入力で、collector自身の出力がvalidate不合格になった(evidence flagは生入力基準・格納データは正規化基準で乖離)(#29)
- ready manifestを `status:"invalid"` + 任意のissuesに書き換えてIDを再計算すると素通り(#29)

**対策**: design-rules R11(空の封筒パターン)。棄却レコードはissues+理由コード+**正準の空セクション**のみを持ち、validateは「空の封筒と完全一致」を要求する。

## C7の追加実例(#29)

- fail-closedを実装した**ガード関数自身**が、ネスト配列(`quarantine.reasons` 等)を形状確認せずに参照してthrowした。ガードを書くときは「ガードのコードパス自体が無ガード参照を含まないか」を再帰的に確認する。

## 効果測定の記録

| PR | ゲート適用 | Codex指摘数 |
|---|---|---|
| #26 (T036本体) | 未適用(ゲート導入前に作成) | 8件 |
| #29 round 1 (総ざらい修正) | 適用(初版taxonomy) | 5件(うち4件は対称化実装自体の穴 = C11〜C13の初出) |
| #29 round 2 (空封筒化) | 適用(C11〜C13を先回り) | 0件(マージ時点) |

## PR #2 の歴史的5系統(参考)

PR #11の記録より: silent default書き換え / 未知キー素通り / 空suffix URI / nullable文字列型未検証 / 検証ロジックのコピペdivergence。
最後のコピペdivergenceは orchestrator の点修正禁止ルール(重複統合)で対処済み。他はC2/C3に吸収。
