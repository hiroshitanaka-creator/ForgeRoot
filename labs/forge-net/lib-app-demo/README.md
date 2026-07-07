# Lib/App Symbiosis Demo

T066 defines a lab-only symbiosis workflow between two demo repositories:

- `forge-lab-lib`
- `forge-lab-app`

The demo shows how a library peer can propose a change, how an app peer can
respond, and how lineage, treaty, reputation, and arena evidence can travel as
review artifacts.

## Flow

1. `forge-lab-lib` exports a T061 lineage pack to `forge-lab-app`.
2. `forge-lab-lib` composes a T062 cross-repo PR manifest for the app.
3. `forge-lab-app` registers the proposal as a T065 arena candidate.
4. `forge-lab-app` compares the proposed change against a local candidate.
5. The app records a human-readable response: accept with local guard,
   reject, or inconclusive.

The concrete example artifact is:

- `docs/ops/examples/t066-cross-repo-proposal.json`

The walkthrough is:

- `docs/ops/t066-symbiosis-demo.md`

## Lab Boundary

This lab does not:

- create public repositories
- create GitHub pull requests
- discover peers
- create production treaties
- transport network packets
- merge changes
- mutate policies

All repo names, treaty ids, lineage refs, reputation scores, and arena outputs
are deterministic example data for documentation and review.

## Evidence Included

The example artifact includes:

- treaty scope
- T061 lineage pack exchange summary
- T062 cross-repo PR composition summary
- T063 advisory reputation signal
- T065 conflict arena comparison summary
- app response and rollback boundary
- explicit no-side-effect guards
