# T041-2 interface registry supplement

Task name: `T041-2`

This supplement registers the interfaces needed to make T042 dependency interpretation unambiguous. Future tasks must implement these names or explicitly update this registry through a bounded PR.

## `packages/memory`

| API | Task | Input | Output | Forbidden |
|---|---:|---|---|---|
| `createWorkingMemoryUpdate(input)` | T030 | task refs / facts | working memory update manifest | `.forge` direct write |
| `validateWorkingMemoryUpdate(update)` | T030 | update manifest | validation result | guessed source refs |
| `createEpisodeDigest(input)` | T031 | PR/audit/outcome refs | episode digest | source-less digest |
| `packMemoryRecords(input)` | T032 | canonical records | pack manifest | nondeterministic ordering |
| `retrieveMemoryContext(input)` | T033 | query + token budget | bounded context refs | vector DB as source of truth |
| `createMemoryCompactionPlan(input)` | T038 | inline memory state | compaction proposal | destructive delete |

## `packages/eval`

| API | Task | Input | Output | Forbidden |
|---|---:|---|---|---|
| `validateEvalSuite(input)` | T034 | eval suite | validation result | benchmark execution |
| `loadBenchmarkFixtures(input)` | T035 | fixture path | fixture set | live repo mutation |
| `collectMergeOutcome(input)` | T036 | PR metadata refs | outcome manifest | outcome guessing |
| `calculateFitness(input)` | T037 | outcome/eval inputs | score manifest | score mutation side effects |

## `packages/auditor`

| API | Task | Input | Output | Forbidden |
|---|---:|---|---|---|
| `createProvenanceManifest(input)` | T039 | artifact refs | provenance manifest | secret signing key handling |
| `verifyProvenanceManifest(input)` | T039 | manifest + artifact refs | verification result | live attestation API |
| `convertAuditFindingsToSarif(input)` | T040 | audit findings | SARIF-like artifact | GitHub Code Scanning upload |
| `evaluateSecurityGate(input)` | T041 | SARIF-like artifact + policy | gate decision manifest | ruleset mutation |

## `packages/reporting`

| API | Task | Input | Output | Forbidden |
|---|---:|---|---|---|
| `renderSecurityReport(input)` | T042 | T041 gate decision + T040 SARIF summary | Markdown / JSON report | GitHub Checks API write |
| `renderFitnessReport(input)` | T042 | T037 score manifest or unknown placeholder | Markdown / JSON report | missing score guessing |
| `renderForgeReport(input)` | T042 | memory/eval/security/provenance refs | Markdown / JSON report | source-of-truth replacement |

## T042 input handling rule

T042 accepts missing memory/eval/provenance values only when they are explicitly represented as `unknown`. It must not synthesize score, memory, or provenance evidence.
