# T047 Tool-Routing Mutation

## Purpose

A tool-routing mutation expresses a proposed change to an agent's `tools[]`
surface as a reviewable, dry-run-only manifest. It covers route additions,
replacements, and removals for bounded tool namespace, call-budget, timeout,
mode, approval, and fallback metadata.

Tool routing changes alter an agent's behavioral reach, so every valid proposal
is Class C and requires human review before execution and merge.

## Shape

```ts
interface ToolRouteIdentity {
  namespace: string;
  name: string;
}

interface ToolRouteValue extends ToolRouteIdentity {
  mode: "read" | "write_manifest";
  max_calls: number;
  timeout_ms: number;
  approval: "none" | "human" | "code_owner";
  fallback?: string | null;
}

interface ToolRoutingPatchOperation {
  op: "add" | "replace" | "remove";
  route: ToolRouteIdentity;
  value?: ToolRouteValue;
}

interface ToolRoutingInput {
  now?: string;
  target: { path: string; species: string; content: Record<string, unknown> };
  operations: ToolRoutingPatchOperation[];
}
```

`add` and `replace` require a full `value`; `remove` must not include one.
`add` requires the route to be absent. `replace` and `remove` require the route
to already exist. Duplicate route targets in one patch are rejected.

## Allowed Target Document

Exactly one canonical agent genome file: `.forge/agents/<species>.forge`.
`target.species`, the path species segment, `target.content.id`,
`target.content.kind`, `target.content.identity.species`, and
`target.content.identity.role_name` must describe the same canonical agent.

Policy documents, workflows, `.forge/mind.forge`, and any non-agent target are
rejected before a diff is produced.

## Namespace And Budget Bounds

The namespace allowlist is:

- `approval_checkpoint`
- `audit`
- `eval`
- `gh`
- `github_pr_adapter`
- `mutate`
- `pr`
- `rate_governor`
- `repo`
- `sandbox`

Budgets are intentionally small:

- `max_calls <= 8`
- `timeout_ms <= 8000`
- `mode` is only `read` or `write_manifest`
- external network mode expansion is rejected

## Approval Escalation

Every accepted dry run includes:

- `review_gate.risk: "high"`
- `review_gate.approval_class: "C"`
- `review_gate.escalation_required: true`
- human review required before execution and before merge

Permission expansion is detected when a patch adds a route, changes a route
identity, increases mode privilege, increases `max_calls`, increases
`timeout_ms`, or weakens approval. Approval weakening is rejected because it is
policy weakening; other expansions are allowed only as Class C proposals.

## Guarantees

- Deterministic: identical input yields the same `patch_id`,
  `mutation_record.mutation_id`, content digests, and diff summary.
- Dry-run only: the target document is cloned in memory before operations are
  applied.
- Stable manifest: returned operations and diff route values are cloned.
- Fail closed: malformed input, forbidden namespaces, budget overruns,
  external-network modes, missing routes, duplicate routes, non-canonical
  content, and approval weakening reject the whole patch.

## Out Of Scope

Tool implementation, MCP server implementation, policy weakening, workflow
mutation, external network permission expansion, live `.forge` writes, GitHub
transport, merge, and approval execution are outside T047.
