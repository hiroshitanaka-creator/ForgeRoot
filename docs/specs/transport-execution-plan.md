# T055 transport execution plan

T055 defines a deterministic, dry-run-only execution plan manifest for the
approved mutation PR transport request path.

## API

Package: `@forgeroot/mutate`

Exports:

- `runTransportExecutionPlan`
- `createTransportExecutionPlan`
- `planApprovedTransportExecution`
- `runT055TransportExecutionPlan`
- `validateTransportExecutionPlanResult`
- `validateTransportExecutionPlan`
- `validateT055TransportExecutionPlan`
- `TRANSPORT_EXECUTION_PLAN_CONTRACT`

## Input

`runTransportExecutionPlan(input)` accepts:

- `approval`: a T054 approval receipt verification manifest
- `request`: a T052 mutation PR transport request manifest
- `now`: optional RFC3339 UTC timestamp

The T054 approval must be approved, the T052 request must be ready, and approval
references must match the request ID, request digest, and plan ID.

## Output

The result has one of three statuses:

- `execution_plan_ready`: approved T054 and ready T052 manifests match.
- `blocked`: inputs are valid but not approved or not ready.
- `invalid`: T054/T052 validation fails, scope does not match, or the generated
  plan is unsafe.

Ready output contains unexecuted steps for approval validation, PR creation, and
optional PR metadata requests. Every step is marked `planned_not_executed`,
`executed: false`, and `requires_future_live_approval: true`.

## Safety boundaries

T055 plans execution only. It does not:

- request or persist tokens
- call GitHub APIs
- create branches
- push git refs
- write approval records
- write files
- execute mutations
- merge pull requests

Future live transport remains outside this task and requires a separate
explicit phase gate.
