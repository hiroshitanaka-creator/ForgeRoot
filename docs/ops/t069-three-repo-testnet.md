# T069 Three-Repo Forge-Net Testnet

T069 defines a class C / high-risk, lab-only federation topology for a
three-repo forge-net testnet. The user approved federation topology,
treaty-link, and network-boundary authoring before this work.

## Purpose

The topology connects three deterministic lab peers:

- `forge-root`: governance root and boundary policy source.
- `forge-lab-lib`: library provider peer.
- `forge-lab-app`: application consumer peer.

It shows how T061-T068 artifacts can be arranged into an allowlisted testnet
without enabling live federation.

## Artifact

Primary artifact:

- `labs/forge-net/topology.yml`

Supporting artifacts:

- `labs/forge-net/README.md`
- `labs/forge-net/lib-app-demo/README.md`
- `.forge/policies/network-boundary.forge`
- `docs/specs/network-boundary.md`
- `docs/specs/federation-observability.md`

## Treaty Links

The topology records three lab-only treaty links:

| Treaty | Source | Target | Allowed actions |
|---|---|---|---|
| `t069-root-lib-aaaaaaaa` | `forge-root` | `forge-lab-lib` | `gossip_sync`, `lineage_import_candidate`, `reputation_update` |
| `t069-root-app-bbbbbbbb` | `forge-root` | `forge-lab-app` | `gossip_sync`, `lineage_import_candidate`, `reputation_update` |
| `t069-lib-app-cccccccc` | `forge-lab-lib` | `forge-lab-app` | `lineage_export`, `lineage_import_candidate`, `cross_repo_pr` |

Every other action is denied by default.

## Network Boundary

The topology keeps T067 boundaries intact:

- runtime mode must be `federate`
- unknown peers are quarantined
- imported lineage remains candidate-only
- open federation is disabled
- open peer discovery is disabled
- production treaty creation is not authorized
- network transport is not performed
- GitHub PR transport is not performed

## Expected Flow

1. `forge-root` observes lab peers through derived T068 reports.
2. `forge-lab-lib` exports a T061 lineage pack to `forge-lab-app`.
3. `forge-lab-app` registers the import as candidate evidence only.
4. T067 boundary decisions determine whether each action is allowed,
   rejected, or quarantined.
5. T064 gossip remains schedule-only and performs no network transport.
6. T068 reporting renders derived Markdown/JSON summaries without replacing
   peer registry, treaty, reputation, or boundary source-of-truth state.

## Safety Boundary

This task does not:

- create public or private repositories
- create GitHub pull requests
- create production treaties
- modify branch protection or app permissions
- enable open federation
- perform live network transport
- write authoritative reputation
- auto-adopt imported lineage
- mutate policies at runtime

## Promotion Requirements

Moving from this lab topology to real federation requires a separate class C
review with:

- two human approvals including code owner approval
- production treaty review
- per-edge `enforceNetworkBoundary(input)` evidence
- derived `renderFederationReport(input)` evidence
- explicit confirmation that open federation remains disabled
- rollback plan for every repository and treaty link
