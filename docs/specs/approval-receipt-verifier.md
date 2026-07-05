# T054 approval receipt verifier

T054 defines a deterministic, verifier-only approval receipt surface for the
T053 transport readiness ledger.

## API

Package: `@forgeroot/mutate`

Exports:

- `runApprovalReceiptVerifier`
- `verifyApprovalReceipt`
- `createApprovalReceiptVerification`
- `runT054ApprovalReceiptVerifier`
- `validateApprovalReceiptVerifierResult`
- `validateApprovalReceiptVerification`
- `validateT054ApprovalReceiptVerifier`
- `APPROVAL_RECEIPT_VERIFIER_CONTRACT`

## Input

`runApprovalReceiptVerifier(input)` accepts:

- `ledger`: a T053 readiness ledger
- `receipts`: explicit human approval receipts
- `policy`: optional required approval count and allowed approver list
- `now`: optional RFC3339 UTC timestamp

Each receipt must include a deterministic `receipt_id`, approver, approval time,
decision, statement, evidence digest, and scope. Scope must match:

- ledger ID
- ledger digest
- request ID
- request digest
- plan ID

## Output

The result has one of three statuses:

- `approved`: the T053 ledger is ready and enough scoped `approve` receipts are
  present.
- `blocked`: approvals are missing, rejected, held, disallowed by policy, or the
  ledger is not ready.
- `invalid`: input, policy, receipt shape, receipt scope, receipt digest, or the
  ledger manifest is malformed or unsafe.

## Safety boundaries

T054 verifies local receipt manifests only. It does not:

- write approval records
- request or persist tokens
- call GitHub APIs
- create branches
- push git refs
- write files
- execute mutations
- merge pull requests

Any approval record persistence or live transport remains out of scope and
requires a separate explicit phase gate.
