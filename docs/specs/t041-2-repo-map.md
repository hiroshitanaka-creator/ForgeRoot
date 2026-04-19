# T041-2 repo map supplement

Task name: `T041-2`

This supplement records the Phase 2 placement needed for T042 dependency resolution. It does not create the future runtime packages.

## Existing implemented surface

```text
packages/planner              # T015-T017
packages/executor             # T018-T019
packages/auditor              # T023 and T040
packages/pr-composer          # T024
packages/github-pr-adapter    # T025
packages/approval-checkpoint  # T026
packages/rate-governor        # T027
packages/forge-demo           # T028
```

## Reserved Phase 2 placement

```text
packages/memory/
  src/working.ts        # T030
  src/digest.ts         # T031
  src/packer.ts         # T032
  src/retrieval.ts      # T033
  src/compact.ts        # T038

packages/eval/
  src/eval-suite.ts     # T034
  src/outcomes.ts       # T036
  src/fitness.ts        # T037

packages/auditor/
  src/provenance.ts     # T039
  src/sarif.ts          # T040 implemented
  src/security-gates.ts # T041

packages/reporting/
  src/security-report.ts # T042
  src/fitness-report.ts  # T042
```

## Placement rationale

- `packages/memory` owns curated memory manifests, pack boundaries, retrieval manifests, and compaction proposals.
- `packages/eval` owns eval suite validation, outcome manifests, and score calculation.
- `packages/auditor` keeps provenance, SARIF, and security gate decisions near audit evidence.
- `packages/reporting` renders derived JSON / Markdown reports and must not become a source of truth.

## Dependency direction

```text
packages/reporting
  consumes packages/auditor artifact shapes
  consumes packages/eval score artifact shapes
  consumes packages/memory manifest shapes
  must not mutate memory, eval, security policies, or GitHub state
```

T042 reporting may depend on manifest schemas and validators. It must not trigger live memory writes, score calculation side effects, GitHub Checks API calls, or security policy mutation.
