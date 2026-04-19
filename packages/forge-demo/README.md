# @forgeroot/forge-demo

T028 end-to-end forged PR demo harness.

This package wires the deterministic Phase 1 ForgeRoot manifest chain from one `forge:auto` issue-like input through rate-governed dispatch:

```text
Planner -> Worktree manager -> Sandbox request -> Auditor -> PR composer -> GitHub PR adapter -> Approval checkpoint -> Rate governor
```

The harness is manifest-only. It does not execute commands, edit files, call GitHub, create a real pull request, merge, approve, update memory/evaluation state, or perform federation.

## Primary API

```ts
runEndToEndForgedPrDemo(input)
validateEndToEndForgedPrDemo(result)
E2E_FORGED_PR_DEMO_CONTRACT
```

Compatibility aliases:

```ts
runForgeDemo(input)
runEndToEndDemo(input)
runE2EForgedPrDemo(input)
runT028Demo(input)
validateForgeDemo(result)
validateE2EForgedPrDemo(result)
validateT028Demo(result)
```

## Runtime outcomes

- `ready` — one complete manifest chain exists through rate-governed dispatch.
- `blocked` — a pre-transport gate stopped the chain.
- `delayed` — rate governor delayed dispatch because lane/budget/cooldown conditions require waiting.
- `quarantined` — approval checkpoint or runtime gate stopped unsafe transport.
- `invalid` — malformed input or manifest chain.

## Demo invariants

A ready result must preserve:

- one task / one plan / one PR scope
- no default branch write
- PR body includes risk summary
- PR body includes acceptance criteria
- approval gate remains visible
- live GitHub transport is not performed
- real pull request is not created
- merge / approval is not executed
- memory / evaluation is not updated
- federation is not performed
