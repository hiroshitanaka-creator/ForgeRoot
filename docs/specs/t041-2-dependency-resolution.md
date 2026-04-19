# T041-2 dependency resolution for T042

Task name: `T041-2`

## Purpose

T041-2 resolves the non-runtime dependency that blocked T042: T029-T039 did not yet exist as a canonical memory / eval / provenance task source.

T041-2 does not implement T029-T039. It fixes the dependency at the task-source, repo-map, and interface-boundary level so that T042 can be implemented after T041 security gates are complete.

## Position in the task graph

`T041-2` is an interstitial bridge label requested for this dependency-resolution work. It is not a replacement for any fixed three-digit task ID and does not reuse T041 or T042.

```text
T040 SARIF bridge
  -> T041 security gates
      -> T041-2 dependency resolution for T042
          -> T042 memory/eval/security dashboard source
```

## Resolved dependency

T042 originally depended on:

```text
- T040 SARIF bridge
- T041 security gates
- P2 memory / evaluator task definitions once canonicalized
```

T041-2 resolves the third item by adding:

```text
- docs/specs/t029-t039-canonical-task-source.md
- docs/specs/fixtures/task-source/t029-t039-canonical.json
- docs/specs/fixtures/task-source/t042-readiness.json
- docs/specs/t041-2-repo-map.md
- docs/specs/t041-2-interface-registry.md
```

## Remaining T042 blocker

T041-2 does not implement T041. If T041 is not complete, T042 remains blocked by T041 security gates.

After T041 is complete, T042 can proceed without the previous T029-T039 canonical-source gap.

## T042 readiness rule

T042 may consume memory / eval / provenance artifacts only as declared manifest inputs. It must not invent missing memory, score, gate, or provenance data.

T042 must render missing values as `unknown` and include source artifact references when present.

## Manifest-only guards

T041-2 does not perform:

- GitHub API calls
- live Code Scanning upload
- `.github/workflows/*` mutation
- policy mutation
- ruleset or branch protection mutation
- memory/evaluation state writes
- self-evolution
- federation

## Acceptance criteria

- T029-T039 are present with bounded Goal / Scope / Out of scope / Dependencies / Deliverables / Acceptance criteria.
- T029-T039 dependencies form an acyclic graph using only completed prior tasks or earlier T029-T039 tasks.
- T042 readiness fixture states that the canonical-source dependency is resolved.
- T042 remains blocked by T041 until T041 is implemented.
- Repo map and interface registry placeholders exist for the modules T042 will rely on.
- Node validation confirms no malformed task IDs, missing sections, or accidental live-operation permissions.
