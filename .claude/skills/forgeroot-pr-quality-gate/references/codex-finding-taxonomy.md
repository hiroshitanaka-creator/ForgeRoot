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

## PR #2 の歴史的5系統(参考)

PR #11の記録より: silent default書き換え / 未知キー素通り / 空suffix URI / nullable文字列型未検証 / 検証ロジックのコピペdivergence。
最後のコピペdivergenceは orchestrator の点修正禁止ルール(重複統合)で対処済み。他はC2/C3に吸収。
