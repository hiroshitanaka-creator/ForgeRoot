# ForgeRoot
Personal experimental workspace for sequential PR forging
# ForgeRoot

GitHub repository as a living Forge Mind.

ForgeRoot is a Git-Native evolution substrate that turns a repository itself into a reviewable, memory-bearing, PR-native intelligence.  
Agents do not merely work on the repository.  
They live in it, evolve through it, and remain auditable inside it.

---

## What ForgeRoot is

ForgeRoot is **not** just “AI coding on GitHub.”

ForgeRoot is a design for treating the repository as the durable self:

- **Git is the brain**
- **`.forge` is the genome and memory**
- **PR is the only transport path for behavioral evolution**
- **GitHub App + Sandbox form the circulatory system**

The long-term goal is not agent convenience.  
The goal is a repository that can remember, evaluate, mutate, and improve without abandoning reviewability.

---

## What makes ForgeRoot different

Most agent systems are still session-first or tool-first.  
ForgeRoot takes a different stance.

- **Repo-first**, not session-first
- **Selection-first**, not tool-first
- **Evolution substrate**, not one-shot automation

A ForgeRoot repository is meant to preserve:

- identity
- constraints
- memory
- lineage
- mutation history
- evaluation signals

inside Git-native structures.

---

## Core laws

1. Git is the source of truth.
2. No direct writes to the default branch.
3. Every behavior-changing change must be reviewable as a PR.
4. Humans define the constitution; agents optimize within it.
5. Federation is allowlisted before it is autonomous.

---

## Repository layout

```text
.forge/
  mind.forge
  agents/
  policies/
  evals/
  lineage/
  network/
  packs/
.github/
  workflows/
apps/
  github-app/
  cli/
  browser-extension/
crates/
packages/
labs/
docs/
```

---

## Architectural layers

### 1. Human Governance Layer
Humans seed the constitution, approve high-risk mutations, define federation boundaries, and retain the kill switch.

### 2. GitHub Native Surface
Issues, PRs, reviews, rulesets, Actions, checks, and forks are not hidden behind a separate control metaphor.  
They are the control metaphor.

### 3. ForgeRepo Layer
The repository stores the Forge Mind itself.  
`.forge` holds self-description, policies, memory references, lineage, and evaluation structures.

### 4. Control Plane
GitHub App, webhook ingest, policy engine, rate governor, approval router, and scheduler.

### 5. Cognitive Plane
Planner, Executor, Auditor, MemoryKeeper, Evaluator, MutationEngine, EvolutionGuard, Networker.

### 6. Execution Plane
All file edits, commands, builds, tests, and scans run in isolated sandboxed worktrees.

---

## The five loops

ForgeRoot only becomes interesting when all five loops exist together.

1. **Forging loop**  
   `Plan → Execute → Audit → PR`

2. **Selection loop**  
   `Review / CI / Ruleset / Merge / Revert`

3. **Memory loop**  
   `Event → Digest → Pack → Recall`

4. **Evolution loop**  
   `Evaluate → Mutate → Shadow Eval → Evolution PR`

5. **Federation loop**  
   `Treaty → Offer → Cross-Repo PR → Adoption`

---

## Current build strategy

ForgeRoot is intentionally phased.

### Phase 0
Forge Kernel, `.forge` spec, GitHub App scaffold, webhook ingest, lab repos, kill switch.

### Phase 1
One task = one PR forging loop.

### Phase 2
Memory + evaluation.

### Phase 3
Bounded self-evolution.

### Phase 4
Allowlisted federation.

### Phase 5
ForgeRoot maintains ForgeRoot.

---

## Initial priorities

The first execution block is fixed.

### Mandatory kernel
- repo skeleton
- constitution + `mind.forge`
- `.forge` v1 spec
- canonical parser / kernel
- GitHub App manifest
- webhook ingest
- event inbox / idempotency

### First forging loop
- intake classifier
- plan spec DSL
- planner runtime
- worktree manager
- executor harness
- auditor runtime
- PR composer
- checks integration
- approval checkpoint
- rate governor
- end-to-end forged PR

### Safety floor
- runtime mode + kill switch
- SARIF bridge
- security gates

---

## Safety defaults

ForgeRoot should start conservative.

- GitHub App only
- no PATs in production
- protected default branch
- rulesets enabled
- secrets isolated from untrusted execution
- allowlisted federation only
- no workflow self-mutation by default
- one repo = one mutating lane
- automatic downgrade on repeated 403 / 429
- replayability required before production rollout

### Runtime modes

- `observe`
- `propose`
- `evolve`
- `federate`
- `quarantine`
- `halted`

Start with **observe** or **propose**.  
Do not enable **evolve** before Phase 2 is operational.

---

## Why `.forge` matters

`.forge` is the durable identity layer.

It is expected to hold:

- repo-level mind definition
- agent definitions
- policies
- evaluation suites
- lineage
- network treaties
- curated memory references

This keeps the lasting intelligence in Git, not in an opaque runtime cache.

---

## Tooling surface

ForgeRoot is intended to operate across three surfaces.

### GitHub App
Always-on control plane for events, PR creation, checks, approval routing, and governance.

### CLI
Operator surface for local bootstrap, diagnostics, replay, seed, and lab management.

### Browser Extension
Human approval and observability surface for risk, lineage, score deltas, mutable paths, and quarantine reasons.

---

## Quickstart target

The eventual bootstrap flow is designed around a sequence like this:

```bash
pnpm install
cargo build --workspace
pnpm forge init
pnpm forge seed --profile oss-safe
pnpm forge lab up
pnpm dev
```

That quickstart assumes the repo already contains the initial kernel, app, CLI, and lab scaffolding.

---

## Contribution model

ForgeRoot is PR-native by design.

Preferred change order:

1. update blueprint if the design boundary changes
2. update naming rules if terminology changes
3. update `.forge` or code
4. update README
5. update issue backlog / roadmap

If a change conflicts with the blueprint or naming rules, stop and raise the contradiction first.

---

## Non-goals

ForgeRoot is not trying to provide:

- direct default-branch autonomy
- unbounded self-replication
- hidden network spread
- opaque memory as the only truth
- model lock-in
- reviewless self-modification

---

## Status

At the public repo level, ForgeRoot currently starts from a minimal public shell and a separate blueprint file.  
This README is intended to become the durable public-facing introduction for the full system.

---

## Warning

> ForgeRoot is not designed to bypass GitHub governance.  
> It is designed to make autonomous maintenance auditable, reviewable, reversible, and evolvable inside Git-native constraints.
