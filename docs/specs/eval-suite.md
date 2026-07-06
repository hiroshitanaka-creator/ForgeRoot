# Eval Suite DSL

Status: T034 implemented foundation

## Purpose

The eval suite DSL defines the manifest surface for ForgeRoot benchmark tasks,
grader definitions, score inputs, risk class, and the shadow-only boundary. It
lets later T035-T037 work attach fixtures and scoring without guessing where a
score came from.

## Manifest Shape

Eval suites are `.forge` v1 documents with:

- `kind: eval_suite`
- `schema_ref: urn:forgeroot:forge:eval_suite:v1`
- `suite_name`
- `tasks`
- `graders`
- `risk_class`
- `success_metrics`
- `shadow_only`
- `provenance`

The canonical T034 suite is `.forge/evals/core.eval.forge`.

## Task Fixture Schema

Each `tasks[]` entry is a benchmark task fixture reference, not an embedded
grader:

- `task_id`: stable task slug.
- `fixture_ref`: repository-relative JSON fixture path for T035.
- `input_kind`: one of `docs`, `tests`, `security`, `memory`, `scope`, or
  `review`.
- `expected_outcome`: one of `pass`, `fail`, `blocked`, `quarantined`, or
  `unknown`.
- `risk_class`: one of `A`, `B`, `C`, or `D`.
- `grader_refs`: non-empty list of `graders[].grader_id` values.

Inline `task.grader` definitions are invalid because they couple fixtures to
grading logic and make reuse impossible.

## Grader Definition Schema

Each `graders[]` entry defines reusable grader metadata:

- `grader_id`: stable grader slug.
- `description`: reviewer-readable purpose.
- `input_schema_ref`: ForgeRoot schema URN for task input.
- `output_schema_ref`: ForgeRoot schema URN for grader output.
- `decision_values`: allowed decision labels.
- `score_output`: `unknown_until_t037`, `boolean`, `numeric`, or `categorical`.

T034 records grader contracts only. It does not run graders.

## Safety Boundary

T034 forbids:

- benchmark execution
- grader execution
- fitness calculation
- mutation selection
- live CI integration

Eval suites must keep `shadow_only: true`. Implementations should expose this
as a validation result rather than writing authoritative scores or mutating
runtime memory.

## Package API

`packages/eval/src/eval-suite.ts` exports:

- `validateEvalSuite(input)`
- `validateT034EvalSuite(input)`
- `EVAL_SUITE_CONTRACT`
- `EVAL_SUITE_SCHEMA_REF`

`validateEvalSuite` accepts either an eval suite manifest object or:

```ts
{
  suite: unknown;
  canonicalPath?: string;
  requireDefinitions?: boolean;
}
```

`requireDefinitions` is useful for the T034 core suite. Seeded bootstrap suites
such as `.forge/evals/root.forge` can remain empty until later fixture work.
