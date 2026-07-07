# Gossip Sync Cadence (T064)

T064 defines a deterministic, manifest-only sync schedule for peer gossip. It
does not add workflows, perform network transport, discover peers, create
cross-repo pull requests, or call GitHub.

## API

- `scheduleGossipSync(input)`
- `validateGossipSync(result)`
- Stable aliases:
  - `runT064GossipSyncCadence(input)`
  - `validateT064GossipSyncCadence(result)`

The implementation lives in `packages/network/src/gossip.ts` and is exported
from `packages/network/src/index.ts`.

## Inputs

The scheduler consumes:

- runtime gate: mode, allowed state, kill switch state
- peer registry snapshot: peer id, repository, status, treaty status,
  reputation score/action, last sync time, cooldown time
- rate boundary snapshot: base interval, jitter maximum, peer-per-sync cap,
  sync-window cap, current window count, window reset, global cooldown

The result stores normalized inputs so validation can rebuild the plan.

## Runtime Gate

Sync can be scheduled only when:

- runtime mode is `federate`
- runtime is allowed
- kill switch is not engaged

Any other runtime mode produces a blocked manifest with no scheduled peers.

## Peer Eligibility

Peers are not scheduled when they are:

- suspended
- quarantined
- deprecated
- attached to a non-active treaty
- marked by reputation action as `quarantine` or `revocation_review`

These peers appear in `sync_plan.peer_decisions` with `decision: skip`.

## Cadence And Jitter

The base cadence defaults to 900 seconds. Jitter is deterministic:

```text
fnv1a(registry_id + peer_id + created_at) % (jitter_max_seconds + 1)
```

The scheduled time is based on the maximum of:

- current time plus base cadence and jitter
- last sync time plus base cadence and jitter
- active peer cooldown
- active global cooldown
- rate window reset when no sync slots are available

## Rate Boundary

The scheduler respects:

- `max_peers_per_sync`
- `max_syncs_per_window`
- `current_window_sync_count`
- `window_reset_at`
- `global_cooldown_until`

When no slots remain, eligible peers are delayed until `window_reset_at`.

## Validation

`validateGossipSync` rebuilds and compares:

- peer registry digest
- peer decisions
- scheduled/delayed/skipped counts
- next sync time
- status and decision
- reasons
- payload digest
- deterministic id

It also rejects unknown enum values, unsorted output peers, missing resolved
rate fields, missing resolved peer cooldown fields, nested unknown keys,
secret-shaped strings, and side-effect flags.

## Boundaries

Every result carries guards and dry-run fields proving:

- no workflow mutation
- no network transport
- no peer discovery
- no cross-repo PR creation
- no GitHub API call
- no persisted queue slot

## Out Of Scope

- `.github/workflows/*` changes
- live network transport
- peer discovery
- cross-repo PR creation
