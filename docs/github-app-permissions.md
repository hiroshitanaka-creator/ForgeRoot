# ForgeRoot GitHub App permissions

Status: T006 initial contract  
Scope: minimum GitHub App manifest, installation scope, and webhook event shortlist  
Manifest: `apps/github-app/app-manifest.json`

This document fixes the initial GitHub App authority boundary for ForgeRoot. The control plane may receive GitHub events, create forge branches, create checks, and open reviewable pull requests. It must not administer repositories, change branch protection, edit GitHub Actions workflow files, or bypass review governance.

The GitHub App is part of ForgeRoot's control plane, not the execution sandbox. Any model-generated patch is still expected to pass through later T007/T008/T018/T019/T024/T026 gates before a PR exists.

## Source-of-truth policy

The manifest is intentionally conservative:

- install on selected repositories only
- no `administration` permission
- no `workflows` permission
- no repository or organization secret-management permission
- no organization-wide permission
- no user permission
- no OAuth user authorization on install
- no write authority outside repository-scoped PR creation and check reporting

Future permission expansion is a high-risk governance change. After T006 is merged, any manifest permission expansion is approval class D unless a later policy file explicitly narrows that rule.

## Baseline manifest

`apps/github-app/app-manifest.json` uses GitHub's app manifest fields:

- `hook_attributes.url` for webhook delivery
- `default_permissions` for repository permissions
- `default_events` for webhook subscriptions
- `request_oauth_on_install=false` so installation does not request user OAuth authorization
- `public=false` so the initial app registration is private to the owner

The URLs in the manifest use `https://forgeroot.example.com/...` placeholders. Replace them with the deployment URL before registering a real app. Do not commit production webhook secrets, private keys, generated app IDs, or PEM files.

## Permission matrix

| Permission key | Access | Why ForgeRoot needs it now | Guardrail |
|---|---:|---|---|
| `metadata` | `read` | Identify the repository, installation, branches, rulesets metadata, labels, and other non-content repository state needed for routing and policy checks. | Read-only. This does not grant code write authority. |
| `contents` | `write` | Create and update files on forge-managed branches for one-task-one-PR changes; read repository trees and file contents needed by Planner / Executor / Auditor flows. | Default branch direct write remains forbidden. Writes must target forge branches and later pass branch contract checks. |
| `pull_requests` | `write` | Open forged PRs, update PR descriptions, inspect PR files, and later attach review-gate state. | PR is the only mutation transport path; no auto-merge authority is granted by this manifest. |
| `issues` | `write` | Read issue intake, create/update comments, attach labels or task-state markers, and create incident/report issues when needed. | Comments and issue mutations are content-creating requests and must later pass rate governance. |
| `checks` | `write` | Create check runs for ForgeRoot validation, audit summaries, and policy verdicts. | Checks report state only; they do not bypass required reviews or branch protection. |
| `actions` | `read` | Receive and inspect `workflow_run` state, workflow logs/artifacts, and CI results without re-running or editing workflows. | Read-only. No workflow dispatch, cancellation, enable/disable, or workflow-file mutation. |

## Explicitly excluded permissions

| Permission key | Reason excluded from T006 baseline | Future gate |
|---|---|---|
| `administration` | Would allow repository settings, branch protection, rulesets, and other governance-changing operations. T006 acceptance explicitly forbids Administration dependency. | Class D, manual only. |
| `workflows` | GitHub defines this as authority to update GitHub Actions workflow files. ForgeRoot's initial constitution forbids workflow self-mutation. | Class D, after explicit workflow-mutation RFC. |
| `statuses` | Commit Status API fallback is useful, but Checks are the initial reporting mechanism. | Class C or D depending on deployment policy. |
| `security_events` | Code scanning alert read is useful for T040/T041, but it is not required to create the first bounded PR loop. | Add with security-gates task. |
| `secret_scanning_alerts` | Secret scanning alerts are sensitive; not required for the initial manifest. | Add with security-gates task. |
| `vulnerability_alerts` | Dependabot alert read is useful later, but not needed for T006. | Add with security-gates task. |
| `secrets`, `dependabot_secrets`, `environments` | Secret and environment management is outside the initial control plane. | Class D. |
| `repository_hooks`, `organization_hooks` | The app uses its own centralized GitHub App webhook, not repo/org hook administration. | Class D. |
| `members`, `organization_administration`, `organization_secrets`, `organization_self_hosted_runners` | Organization-level authority is outside the selected-repository install model. | Class D. |
| user permissions | ForgeRoot does not need to act as a human user. | Out of scope. |

## Installation scope

Initial installation must use **Only select repositories**.

Recommended initial targets:

1. `hiroshitanaka-creator/ForgeRoot` for self-development once T007/T008 exist.
2. Lab repositories only while the system is still in Phase 0 / Phase 1.
3. No organization-wide installation until the rate governor, kill switch, event inbox, and replay path are tested.

Installation rules:

- Do not install to all repositories by default.
- Do not install to production repositories before T014, T027, and T040/T041 are effective.
- Do not grant bypass rights through branch protection or rulesets.
- Do not use a PAT as a substitute for the GitHub App installation token.
- Rotate webhook secrets and private keys using operator procedure; never commit generated credentials.

## Webhook event shortlist

| Event | Included | Purpose | Initial action filter |
|---|---:|---|---|
| `installation` | yes | Track app installation / suspension lifecycle. | accept all; do not mutate repo state from this event alone |
| `installation_repositories` | yes | Track repository access changes. | accept `added`, `removed`; recalculate installed repo cache later |
| `issues` | yes | Intake forge tasks, incident reports, and human commands through labels/comments. | accept `opened`, `edited`, `labeled`, `unlabeled`, `reopened`, `closed` |
| `issue_comment` | yes | Receive human commands such as `forge:approve`, `forge:hold`, `forge:quarantine`, `forge:retry`. | accept `created`, `edited` |
| `pull_request` | yes | Track forged PR lifecycle and policy-relevant diff changes. | accept `opened`, `edited`, `synchronize`, `reopened`, `closed`, `ready_for_review` |
| `pull_request_review` | yes | Capture human review pressure and approval/rejection signals. | accept `submitted`, `edited`, `dismissed` |
| `push` | yes | Observe branch updates, default-branch merges, and forge branch writes. | accept all; reject direct default-branch writes at policy layer |
| `check_suite` | yes | Observe CI/check-suite lifecycle. | accept `completed`, `requested`, `rerequested` |
| `check_run` | yes | Observe individual check results and requested actions. | accept `completed`, `rerequested`, `requested_action` |
| `workflow_run` | yes | Observe GitHub Actions workflow results for audit and scoring. | accept `completed`, `requested`, `in_progress` |
| `fork` | yes | Observe fork/speciation events without federation autonomy. | accept all; no outbound federation action in Phase 0 |

Events intentionally not included in T006 baseline:

- `workflow_job`: useful for deep CI timing later, not required yet.
- `pull_request_review_comment`: noisy; add only if review-comment commands become necessary.
- `merge_group`: add when merge queue integration is implemented.
- `code_scanning_alert`, `secret_scanning_alert`, `dependabot_alert`: add with security-gates work.
- `repository`, `public`, `member`, `membership`, `team`, `team_add`: not needed for selected-repository operation and may widen event surface.
- `repository_dispatch`, `workflow_dispatch`: could become mutation triggers and are not part of the initial event intake.

## Runtime constraints for T007/T008 implementers

The manifest alone is not a safety boundary. T007 and T008 must enforce:

1. HMAC signature verification before parsing the event body as trusted input.
2. Delivery ID deduplication before any downstream side effect.
3. Event allowlist and action allowlist matching this document.
4. Immediate 2XX for accepted deliveries followed by asynchronous handoff.
5. Automatic downgrade or quarantine when permission drift, unexpected workflow change, or rate-limit behavior is observed.

## Acceptance checklist

- [x] Required manifest exists at `apps/github-app/app-manifest.json`.
- [x] Required permission explanation exists in this document.
- [x] `administration` is not requested.
- [x] `workflows` is not requested.
- [x] Metadata / contents / pull requests / issues / checks / actions are explicit and scoped.
- [x] Installation is restricted to selected repositories.
- [x] Webhook event shortlist is explicit.
- [x] Future permissions are treated as governance changes, not silent convenience changes.

## T007 implementation note

T007 implements the first executable webhook ingress that enforces the runtime constraints above:

- `apps/github-app/src/webhooks.ts` verifies `X-Hub-Signature-256` before trusting the JSON body.
- The T006 event/action shortlist is encoded as `WEBHOOK_ACTION_ALLOWLIST`.
- `X-GitHub-Delivery` is preserved in the accepted envelope for T008 persistence and deduplication.
- Accepted deliveries return `202` and are handed to `WebhookHandoff` asynchronously.
- Signed but unsupported events/actions return `202` with an ignored verdict and do not enter handoff.
- Invalid or missing signatures return `401` and do not enter handoff.

The current implementation deliberately avoids scheduler, planner, redelivery, installation-token refresh, and PR creation logic.
