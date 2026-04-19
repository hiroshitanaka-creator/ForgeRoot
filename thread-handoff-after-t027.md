# Runtime mode and kill switch operations

T014 adds the first runtime safety governor for the ForgeRoot GitHub App. The runtime mode store is derived control-plane state; `.forge/policies/runtime-mode.forge` is the policy source, and Git remains the durable source of truth.

## Modes

| Mode | Mutating lane | Intended use | Explicitly blocked |
|---|---:|---|---|
| `observe` | closed | ingest, persist, classify, read, and diagnose | comments, issues, branches, commits, PRs, network sync, self-evolution |
| `propose` | closed | create plans, issues, or explanatory comments for human review | code patching, PR creation, branch creation |
| `evolve` | open | one-task-one-PR mutation lane inside the repo | extra mutating lanes, direct default-branch writes, workflow mutation without Class D |
| `federate` | open | evolve plus treaty-gated network sync | open federation, treaty-less peer activity |
| `quarantine` | closed | contained diagnosis, incident issue/comment, docs-only incident PR, replay | code mutation, workflow mutation, network sync, treaty update, self-evolution, auto-merge |
| `halted` | closed | hard stop after kill switch | issue/comment creation, docs PRs, code mutation, network sync, auto-merge |

The practical difference between `quarantine` and `halted` is intentional. `quarantine` can still produce incident artifacts to help humans diagnose and recover. `halted` is a harder stop and keeps only observation, inbox persistence, read access, replay diagnosis, and restore control available.

## Kill switch

The kill switch is one authorized operation:

```http
POST /api/forge/kill-switch
Authorization: Bearer <FORGE_ADMIN_TOKEN>
Content-Type: application/json

{
  "actor": "github://maintainer",
  "reason": "manual emergency stop"
}
```

It performs all of these in one transition:

- sets `mode=halted`
- sets `kill_switch_engaged=true`
- sets `mutating_lane_open=false`
- sets `restore_requires_human_ack=true`
- records a `kill_switch_engaged` event in `forge_runtime_mode_events`

Webhook ingestion and event inbox persistence are still allowed so that GitHub deliveries are not silently lost during a stop. Downstream mutating operations must call `authorizeOperation(...)` before creating comments, branches, commits, pull requests, checks, or network syncs.

## Restore

Restore is deliberately not automatic.

```http
POST /api/forge/runtime-mode/restore
Authorization: Bearer <FORGE_ADMIN_TOKEN>
Content-Type: application/json

{
  "mode": "observe",
  "human_ack": true,
  "actor": "github://maintainer",
  "reason": "incident reviewed"
}
```

When the current state is `halted`, `quarantine`, or has `kill_switch_engaged=true`, a restore without `human_ack=true` is rejected.

## Repeated 403/429 downgrade

The runtime controller records 403 and 429 signals through `recordRateLimitSignal(...)`. Two signals inside `PT15M` trigger downgrade:

```text
federate -> propose
evolve   -> propose
propose  -> observe
observe  -> observe
```

This connects GitHub API pressure to mode control before later RateGovernor and scheduler tasks exist.

## Local state

Runtime state uses SQLite in Phase 0:

```text
apps/github-app/db/migrations/0002_runtime_mode.sql
```

Configuration:

```bash
FORGE_RUNTIME_SQLITE_PATH=var/forgeroot/event-inbox.sqlite3
FORGE_ADMIN_TOKEN=replace-with-local-admin-token
```

If `FORGE_RUNTIME_SQLITE_PATH` is omitted, the server uses the same SQLite path as the event inbox.
