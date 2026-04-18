# @forgeroot/planner

Planner-side primitives for ForgeRoot.

T015 adds deterministic intake classification before the full Planner runtime exists. The classifier turns issue, comment, and alert-like inputs into one of four dispositions:

- `accept` — normalized task candidate is safe to enqueue for later planning.
- `ignore` — not actionable for automation, usually because `forge:auto` is absent.
- `block` — explicitly unsafe, too broad, or blocked before planning.
- `escalate` — human review is required before planning.

Only items carrying the `forge:auto` label can become automatic planner candidates. The label must come from normalized labels; text inside an issue body or comment does not enable automation.

## Local development

```bash
cd packages/planner
npm run build
node --test --test-force-exit tests/*.test.mjs
```
