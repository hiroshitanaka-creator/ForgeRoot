# PR Quality Gate

This reference adapts the Claude skill `forgeroot-pr-quality-gate` into the
Codex `forgeroot-completion-engine` workflow.

Use it before any ForgeRoot implementation PR, push, or final PR proposal that
changes code under `packages/*`, `crates/*`, `.forge/*`, or any validator,
manifest, parser, patcher, lineage, memory, eval, mutation, transport, policy,
or gate-producing path. Docs-only work only requires G4 plus the normal docs
verification for the changed files.

Purpose: drive recurring Codex review findings toward zero before human or
remote review. Past ForgeRoot review findings collapse into a small set of
repeatable classes, so they should be prevented and tested locally.

## Gate Summary

Run these phases in order:

1. G0 design rules before code.
2. G1 implementation that follows G0.
3. G2 adversarial self-review.
4. G3 negative test coverage.
5. G4 mechanical checks.
6. G5 quality gate report for PR text.

If G2, G3, or G4 finds any real issue, repair the class of issue across the
changed surface, restart at G2, and keep looping until one complete clean sweep
passes. Avoid point fixes that only patch the single observed example.

## Finding Taxonomy

Use this taxonomy when designing, auditing, testing, and reporting:

- C1 validation asymmetry: `create*` is strict but `validate*` or read-back
  validation is weaker.
- C2 fail-open enum/status/decision checks: denylist checks or unknown enum
  values continue instead of reject.
- C3 syntax-only validation: regex or type checks allow semantically impossible
  values.
- C4 multi-operation replay mismatch: validation checks each operation against
  the original state instead of the replayed working state.
- C5 field coverage gaps: digest, diff summary, allowlist, or validation omits
  fields that the spec says matter.
- C6 cross-field consistency gaps: derived fields, IDs, lineage, or summaries
  are not recomputed from source data and compared.
- C7 fail-closed violation: malformed input throws or hides high-risk
  classification instead of returning `{ ok: false, issues }`.
- C8 canonical API name drift: implementation/export name differs from the
  blueprint interface registry.
- C9 data preservation violation: normalization silently drops allowed metadata
  or produces an after-state/digest that does not match persisted content.
- C10 graph invariant gaps: lineage or graph code misses descendant, ancestor,
  or self-reference cycle checks.

## G0 Design Rules

Apply the relevant rules before the first implementation patch:

1. R1 single validation core: `create*` and `validate*` must share the same
   validation functions. Do not copy validation logic into weaker paths.
2. R2 validate means rebuild and compare: recompute digests, deterministic IDs,
   lineage events, diff summaries, and other derived fields from source data and
   compare them. Existence and type checks alone are not enough.
3. R3 enum/status/decision allowlists: accept only known-good values. Unknown
   values must fail closed.
4. R4 semantic validation after syntax: timestamps must parse and round-trip,
   numbers must be finite and in range, strings must not be empty/blank or over
   limits, paths and URIs must reject traversal and invalid prefixes.
5. R5 multi-op replay validation: validate each operation against working state,
   apply it, and validate final invariants.
6. R6 field coverage table: every spec field needs validation, digest or
   explicit exclusion, summary coverage where applicable, and negative tests.
7. R7 fail closed: validators should not throw on broken input. Guard nested
   references and collect issues before returning.
8. R8 canonical API name sync: grep the blueprint interface registry for the
   task's canonical API name before implementation and export that exact name.
9. R9 data preservation: preserve allowed unknown metadata or reject it
   explicitly. Do not silently drop it.
10. R10 graph invariants: for lineage or graph code, check descendant direction,
    ancestor direction, and self-reference corruption.

## G2 Adversarial Self-Review

Run the passes in this order. Record the findings and repairs in the gate
report. If any pass finds a real issue, repair the issue class and restart from
P1.

1. P1 tamper pass for C1/C6. List every manifest leaf field and identify the
   validation line that rejects a changed value. Derived fields must be rebuilt
   and compared. Passing tamper-harness coverage is the strongest evidence.
2. P2 fail-open pass for C2. Review string comparisons, status/decision/kind
   branches, unknown-key handling, and fallback `else` branches. Denylists fail.
3. P3 impossible-value pass for C3. Try impossible dates, NaN, Infinity, negative
   numbers, zero where invalid, over-limit strings, blank strings, path
   traversal, invalid prefixes, and secret-like strings.
4. P4 replay pass for C4. For multi-op code, test accepted and rejected operation
   series against working state, not only original state.
5. P5 coverage pass for C5/C9. Build the field coverage table and compare spec
   fields against validation, digest, diff summary, allowlists, and
   preservation/normalization paths.
6. P6 boundary and consistency pass for C7/C8/C10. Trace null, `{}`, missing
   nested objects, early returns, canonical API exports, and graph cycle checks.

Gate pass condition: one full P1-P6 sweep with zero real findings. If three
rounds still reveal new findings, stop patching symptoms and redesign from G0.

## G3 Negative Test Coverage

For manifest, validator, parser, patch, lineage, or gate-producing code, add
table-driven negative tests. Representative one-off tests are not enough for
review-risk surfaces.

Required coverage:

- Tamper harness: create or load one accepted manifest, enumerate all leaf
  paths including array indexes, mutate each leaf one at a time, and assert that
  read-back validation fails. Include null/delete-style mutations for nested
  objects so fail-closed behavior is covered.
- Field by abnormal-value table: missing key, null, type mismatch,
  NaN/Infinity, negative or zero or upper-bound-plus-one numbers, empty or blank
  strings, over-limit strings, impossible timestamps, non-UTC timestamps,
  secret-like strings, unknown keys where rejected by policy, empty arrays,
  duplicate array entries, order changes where deterministic sorting matters,
  forbidden targets, out-of-allowlist namespaces, and unknown enum values.
- Multi-op series, when applicable: include both valid and invalid sequences,
  such as freeing a name then adding it, renaming then adding a conflicting old
  name, double add, and remove then replace.
- Graph tests, when applicable: reject child-as-ancestor, self-cyclic parent,
  and corrupted input graph; accept a normal multi-generation lineage.
- Classification priority: malformed input combined with a forbidden target
  must still report the high-risk forbidden-target classification in issues.

If a field is excluded from tamper coverage because mutation is intentionally
meaning-preserving, document the exact reason in the test. Silent exclusions do
not pass the gate.

## G4 Mechanical Checks

Run every applicable check and report `pass`, `fail`, or `not run` with the
reason. Use the smallest relevant command first, then broader commands when the
change risk warrants it.

Required checks:

- `npm test`, or the relevant `npm --prefix packages/<name> test`.
- `npm run build`, or the relevant package build command when root build is not
  necessary.
- `cargo test --workspace --locked` for Rust changes, or `not run` with the
  exact environment blocker.
- `git diff --check origin/main...HEAD`.
- Mojibake scan for changed text files when non-ASCII, generated text, or
  Windows encoding risk is present.
- Canonical API grep: compare the blueprint interface registry name against
  package exports when the change adds or modifies public APIs.

Never report an unrun check as passed.

## G5 Quality Gate Report

For PR text, place this section immediately after `## Verification result`.
For a final local handoff without PR creation, summarize the same facts in the
final response or handoff notes.

```markdown
## Quality gate report

Skill: forgeroot-pr-quality-gate via forgeroot-completion-engine

### G0 design rules
- Applied rules: <R1/R2/R3/R7/etc. or not applicable with reason>
- Shared validation core: <path/symbol or not applicable>

### G2 adversarial self-review
| Pass | Target class | Round 1 | Round 2 | Final |
|---|---|---|---|---|
| P1 tamper | C1,C6 | | | |
| P2 fail-open | C2 | | | |
| P3 impossible values | C3 | | | |
| P4 replay | C4 | | | |
| P5 coverage | C5,C9 | | | |
| P6 boundary/consistency | C7,C8,C10 | | | |

- Findings and repair summary: <what was found and how the class was repaired>

### G3 negative tests
- Tamper harness: <test path, case count, result, or not applicable with reason>
- Field coverage table: <0 empty cells or list exceptions with reasons>
- Multi-op / graph coverage: <case count and result, or not applicable>

### G4 mechanical checks
- npm test: <result>
- npm run build: <result>
- cargo test --workspace --locked: <result or not run with reason>
- git diff --check: <result>
- mojibake scan: <result>
- canonical API grep: <blueprint name to export check, or not applicable>
```

## If Review Findings Still Arrive

If an external review finds an issue after this gate:

1. Do not only fix the exact line. Repair the whole issue class across the
   changed surface.
2. Re-run G2 from P1 and repeat G3/G4 as needed.
3. Add the new recurring class or example to this reference in a separate skill
   maintenance PR, unless it already fits the taxonomy above.
