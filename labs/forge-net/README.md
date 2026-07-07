# Forge-Net Lab

This directory contains lab-only federation artifacts for ForgeRoot.

## T069 Three-Repo Testnet

`topology.yml` defines a deterministic three-repo testnet topology:

- `forge-root`: governance root and boundary policy source.
- `forge-lab-lib`: library provider peer.
- `forge-lab-app`: application consumer peer.

The topology records allowlisted treaty links, network-boundary expectations,
lineage routes, gossip scheduling constraints, and observability references.

## Boundary

The lab does not:

- create repositories
- create or update production treaties
- discover peers
- perform network transport
- create GitHub pull requests
- push Git branches
- mutate `.forge/policies/**`
- adopt imported lineage automatically
- enable open federation

The topology is review evidence only. It can be consumed by later validation or
reporting work, but it is not a source of truth for production federation.

## Related Artifacts

- `labs/forge-net/topology.yml`
- `labs/forge-net/lib-app-demo/README.md`
- `docs/ops/t066-symbiosis-demo.md`
- `docs/ops/t069-three-repo-testnet.md`
- `docs/specs/t069-validation-report.md`
- `.forge/policies/network-boundary.forge`
