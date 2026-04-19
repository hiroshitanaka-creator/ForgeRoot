# T041-2 canonical source for T029-T039

Task name: `T041-2`

This document integrates the missing T029-T039 task source needed before T042 can consume memory / eval / provenance artifacts. It does not implement the T029-T039 runtime modules.

## Boundary

- Adds canonical task source for T029-T039 only.
- Keeps every task as `1 issue = 1 bounded PR scope`.
- Does not call GitHub APIs.
- Does not mutate workflows, policies, rulesets, or branch protection.
- Does not write memory or evaluation state.
- Does not perform self-evolution or federation.

## [P2][T029] memory partition contract

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
Working Memory / Episodic Heads / Episodic Packs / Semantic Digests の責務境界を固定する。

### Why now
T042 が memory state を report する前に、memory の層・権威・更新責務を task source として固定する必要があるため。

### Scope
- memory layer 定義
- inline memory と pack memory の境界
- forget rule
- memory update approval class
- memory artifact schema

### Out of scope
- 実際の memory 書き込み
- pack 圧縮実装
- eval score 算出
- self-evolution

### Dependencies
- T004
- T028

### Deliverables
- `docs/specs/memory-model.md`
- `.forge/policies/memory.forge`
- `docs/specs/t029-validation-report.md`

### Acceptance criteria
- 4層 memory model が定義されている
- runtime DB が memory source of truth ではないことが明記される
- curated memory update は PR 経由である
- memory と eval の責務が分離されている

### Risks
- memory と eval の責務が混ざる
- runtime DB を source of truth として扱う

## [P2][T030] working memory writer

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
短期 working memory update manifest を deterministic に生成・検証する。

### Why now
T042 が working memory の状態を表示するとき、短期 memory update の形が未定義だと missing/unknown と実データを区別できないため。

### Scope
- working memory update schema
- max_items enforcement
- TTL metadata
- source task reference
- deterministic ordering

### Out of scope
- `.forge` への直接書き込み
- episodic digest
- semantic retrieval
- eval score update

### Dependencies
- T029

### Deliverables
- `packages/memory/src/working.ts`
- `packages/memory/tests/working.test.mjs`
- `docs/specs/t030-validation-report.md`

### Acceptance criteria
- max_items を超える update を reject できる
- source task / source artifact が必須
- 同じ input から同じ update manifest が出る
- GitHub API を呼ばない

### Risks
- source refs のない memory を書ける
- 短期 memory が無制限に肥大する

## [P2][T031] episodic digest generator

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
PR / audit / rejection / failure を episode digest として要約する manifest を作る。

### Why now
T042 で recent episode や rejected/blocked 結果を report するには、episode digest の source refs と reliability を先に定義する必要があるため。

### Scope
- episode digest schema
- accepted / rejected / blocked / quarantined event type
- source artifact hash
- reliability field
- digest length limit

### Out of scope
- pack compression
- semantic search
- fitness calculation
- mutation proposal

### Dependencies
- T029
- T030
- T023
- T028

### Deliverables
- `packages/memory/src/digest.ts`
- `packages/memory/tests/digest.test.mjs`
- `docs/specs/t031-validation-report.md`

### Acceptance criteria
- episode digest に source refs / task id / decision / reliability が含まれる
- rejected / blocked episode も保存対象になる
- digest は deterministic に生成される
- memory の捏造を防ぐため source artifact が必須

### Risks
- 失敗 episode が保存されず同じ失敗を繰り返す
- source artifact なしの digest で記憶汚染する

## [P2][T032] archive packer

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:high`

### Goal
episode / mutation / eval artifact を `.jsonl.zst` pack へ格納する deterministic packer を設計・実装する。

### Why now
T042 以降で source artifact hash を report に載せるには、pack manifest と hash の責務を先に canonical 化する必要があるため。

### Scope
- canonical JSONL record
- pack header
- raw hash / zstd hash
- deterministic record ordering
- pack verification

### Out of scope
- live memory compaction scheduler
- semantic retrieval
- external object storage
- federation lineage exchange

### Dependencies
- T005
- T031

### Deliverables
- `packages/memory/src/packer.ts`
- `packages/memory/tests/packer.test.mjs`
- `.forge/packs/README.md`
- `docs/specs/t032-validation-report.md`

### Acceptance criteria
- 同じ records から同じ pack manifest が生成される
- raw hash / compressed hash が検証可能
- invalid header / record_count mismatch を reject できる
- `.forge` inline size と pack の責務境界が明確

### Risks
- 非決定的な record ordering で hash が揺れる
- pack を external storage の権威として扱う

## [P2][T033] semantic retrieval adapter

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
episode / digest / semantic pattern を token budget 内で取得する retrieval adapter を作る。

### Why now
T042 の report source は memory context を表示できるが、retrieval が source refs と budget を保持しなければ推測補完になるため。

### Scope
- retrieval request schema
- relevance score
- token budget cap
- deterministic fallback
- source refs preservation

### Out of scope
- embedding provider integration
- vector DB as source of truth
- memory mutation
- self-evolution

### Dependencies
- T029
- T031
- T032

### Deliverables
- `packages/memory/src/retrieval.ts`
- `packages/memory/tests/retrieval.test.mjs`
- `docs/specs/t033-validation-report.md`

### Acceptance criteria
- retrieved item は source refs を保持する
- budget 超過時に deterministic trimming される
- missing memory を推測で補わない
- vector index は派生物として扱う

### Risks
- retrieval が source refs を落とす
- vector DB を `.forge` より上位の正本として扱う

## [P2][T034] eval suite DSL

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
ForgeRoot の benchmark / grader / score input を eval suite として定義する。

### Why now
T042 が fitness / trust / risk を report するとき、score の出所である eval suite と grader が未定義だと評価値を説明できないため。

### Scope
- eval suite schema
- task fixture schema
- grader definition
- risk class
- shadow_only flag

### Out of scope
- actual benchmark runner
- fitness calculation
- mutation selection
- live CI integration

### Dependencies
- T004
- T028

### Deliverables
- `.forge/evals/core.eval.forge`
- `docs/specs/eval-suite.md`
- `packages/eval/src/eval-suite.ts`
- `packages/eval/tests/eval-suite.test.mjs`
- `docs/specs/t034-validation-report.md`

### Acceptance criteria
- eval suite が schema validation 可能
- benchmark task と grader が分離されている
- risk class が明示される
- shadow_only を表現できる

### Risks
- grader と benchmark fixture が一体化して再利用不能になる
- eval が live CI integration と混ざる

## [P2][T035] benchmark fixture seeds

### Suggested labels
- `forge:auto`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
ForgeRoot の planner / auditor / security / memory 評価に使う初期 benchmark fixtures を作る。

### Why now
T037 fitness calculator と T042 report source は、score の根拠となる fixture set がなければ unknown と実測値を区別できないため。

### Scope
- docs-only task fixture
- tests-only task fixture
- invalid scope fixture
- security finding fixture
- rejection fixture

### Out of scope
- live benchmark execution
- model evaluation
- score calculation
- self-evolution

### Dependencies
- T034

### Deliverables
- `labs/benchmarks/README.md`
- `labs/benchmarks/fixtures/*.json`
- `docs/specs/t035-validation-report.md`

### Acceptance criteria
- 最低30件の fixture がある
- pass / fail / blocked / quarantined の代表例を含む
- fixture は deterministic に読める
- real GitHub API を呼ばない

### Risks
- fixture が成功例に偏る
- fixture generation が live repo mutation を伴う

## [P2][T036] merge outcome collector

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
PR outcome を merge / reject / stale / revert / quarantined として収集する manifest を定義する。

### Why now
T037 と T042 が merge 結果を扱うには、outcome を推測ではなく source PR metadata に基づく manifest として定義する必要があるため。

### Scope
- merge outcome schema
- review outcome
- CI outcome
- revert linkage
- source PR metadata reference

### Out of scope
- GitHub API polling
- score calculation
- memory update write
- auto rollback

### Dependencies
- T024
- T026
- T031
- T034

### Deliverables
- `packages/eval/src/outcomes.ts`
- `packages/eval/tests/outcomes.test.mjs`
- `docs/specs/t036-validation-report.md`

### Acceptance criteria
- merged / rejected / reverted / quarantined を区別できる
- source PR / task / commit trailer refs を持つ
- missing outcome を推測しない
- GitHub API を呼ばない

### Risks
- missing outcome を成功または失敗として補完する
- outcome collection が GitHub polling 実装と混ざる

## [P2][T037] fitness calculator

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:high`

### Goal
fitness / trust / risk / stability / novelty を deterministic に算出する。

### Why now
T042 の report で score を出すか unknown とするかを決めるには、score schema と missing value handling が先に必要なため。

### Scope
- score input schema
- fitness formula
- trust formula
- risk formula
- score explanation
- missing value handling

### Out of scope
- score に基づく mutation execution
- self-evolution
- federation reputation
- UI dashboard

### Dependencies
- T034
- T035
- T036

### Deliverables
- `packages/eval/src/fitness.ts`
- `packages/eval/tests/fitness.test.mjs`
- `.forge/lineage/fitness.forge`
- `docs/specs/t037-validation-report.md`

### Acceptance criteria
- 同じ input から同じ score が出る
- missing value は unknown として扱い、勝手に補完しない
- risk は max-risk 原則を守る
- score explanation が reviewer に読める

### Risks
- missing value を推測して評価汚染する
- score を mutation execution と直結する

## [P2][T038] memory compaction engine

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:high`

### Goal
inline memory を pack 化し、`.forge` の肥大化を防ぐ compaction manifest を作る。

### Why now
T042 以降で memory health を表示するには、inline size と compaction candidate の判断基準を source refs 付きで定義する必要があるため。

### Scope
- compaction request schema
- inline size threshold
- keep_recent accepted/rejected policy
- pack reference update
- dry-run report

### Out of scope
- actual PR creation
- scheduler
- semantic deletion
- mutation generation

### Dependencies
- T030
- T031
- T032
- T033
- T037

### Deliverables
- `packages/memory/src/compact.ts`
- `packages/memory/tests/compact.test.mjs`
- `docs/specs/t038-validation-report.md`

### Acceptance criteria
- inline size 上限を超える場合に compaction candidate を出せる
- accepted / rejected の保持数ルールが守られる
- source refs を失わない
- destructive delete を直接行わない

### Risks
- compaction が destructive delete になる
- accepted/rejected の保持数ルールを破る

## [P2][T039] provenance/signature writer

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:high`

### Goal
PR composition / audit / pack / `.forge` artifact に provenance manifest と署名対象 hash を付与する。

### Why now
T042 report が source artifact hash / task id / approval class を表示するには、provenance manifest と署名対象 hash の形を先に定義する必要があるため。

### Scope
- provenance manifest schema
- source task / PR / commit / artifact refs
- canonical hash reference
- signature placeholder
- verification report

### Out of scope
- production key management
- live signing service
- GitHub attestation API
- release artifact attestation

### Dependencies
- T005
- T024
- T032

### Deliverables
- `packages/auditor/src/provenance.ts`
- `packages/auditor/tests/provenance.test.mjs`
- `docs/specs/provenance.md`
- `docs/specs/t039-validation-report.md`

### Acceptance criteria
- provenance に source refs / artifact hashes / runtime profile が含まれる
- signature field はあるが secret material を扱わない
- hash mismatch を検出できる
- GitHub API を呼ばない

### Risks
- signature placeholder が secret material を要求する
- hash mismatch を report から隠す
