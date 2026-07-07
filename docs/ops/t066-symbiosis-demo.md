# T066 Symbiosis Workflow Demo

This document describes a lab-only cross-repo symbiosis workflow between a
library repo and an application repo.

The concrete example artifact is:

- `docs/ops/examples/t066-cross-repo-proposal.json`

## Purpose

T066 demonstrates that federation value can be shown as cooperation between
dependent repositories, not only as forks or isolated local mutations.

The demo connects:

- T061 lineage export/import pack
- T062 cross-repo PR composition
- T063 advisory peer reputation
- T065 conflict arbitration arena

It remains documentation and artifact only. It does not create a GitHub PR,
perform network transport, discover peers, create a production treaty, merge,
or mutate policy.

## Lab Topology

The demo uses two deterministic lab peers:

| Peer | Repository | Role |
|---|---|---|
| `forge-lab-lib` | `forgeroot-labs/forge-lab-lib` | library provider |
| `forge-lab-app` | `forgeroot-labs/forge-lab-app` | application consumer |

The lab treaty allows only:

- `lineage_export`
- `lineage_import_candidate`
- `cross_repo_pr`

The treaty is example data. It is not a production treaty and does not grant
transport authority.

## Step 1: Lineage Pack Exchange

`forge-lab-lib` exports a T061 lineage pack:

- source peer: `forge-lab-lib`
- target peer: `forge-lab-app`
- lineage pack ref: `lineage-pack:lib-app-api-stability-11111111`
- archive pack ref: `archive-pack:api-stability-11111111`

The app receives only an import candidate registration. The exchange does not
adopt lineage, write files, call GitHub, push git refs, or perform network
transport.

## Step 2: Cross-Repo Proposal

`forge-lab-lib` composes a T062 cross-repo PR manifest for the app:

- proposal ref: `cross-repo-pr:lib-app-api-stability-22222222`
- target peer: `forge-lab-app`
- title: `Adopt stable parser facade from forge-lab-lib`
- changed paths:
  - `apps/demo/src/parser-adapter.ts`
  - `docs/integration/parser-facade.md`

The output is draft PR metadata and body evidence only. It does not call
GitHub, create a pull request, create a fork, merge, approve, or create a
treaty.

## Step 3: Reputation Signal

The app includes a T063 reputation signal for the library peer:

- peer id: `forge-lab-lib`
- score: `68`
- band: `neutral`
- recommended action: `observe`

The score is advisory. It is not the source of truth for adoption, merge, or
transport.

## Step 4: Arena Comparison

The app registers two T065 arena candidates:

| Candidate | Source | Proposal | Decision |
|---|---|---|---|
| `candidate-lib-proposal-33333333` | peer | T062 proposal | winner |
| `candidate-app-local-44444444` | local | keep current adapter | loser |

The arena uses local eval, lineage, reputation, and risk inputs. Reputation is
bounded to an auxiliary role and `automatic_merge_allowed` remains false.

The result is a review artifact: the library proposal wins the lab arena, but
the app still requires human review and local validation before any real PR
transport or merge consideration.

## App Response

The app response is `accept_with_local_guard`.

Required follow-ups before any real transport:

- review changed paths against the app allowlist
- run local parser adapter tests in a real repo
- confirm rollback text

No GitHub PR is created by this demo.

## Safety Boundary

The demo explicitly keeps these false:

- public repo federation
- live GitHub PR creation
- open peer discovery
- production treaty
- network transport
- file write
- policy mutation
- merge operation

This artifact can be used as documentation evidence for later T067-T070 work,
but it is not federation runtime authority.
