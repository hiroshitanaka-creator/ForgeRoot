# T006 validation report

Status: pass  
Task: minimum GitHub App manifest and permissions

## Files checked

- `apps/github-app/app-manifest.json`
- `docs/github-app-permissions.md`
- `apps/github-app/README.md`
- `docs/README.md`

## Manifest structural check

The manifest is valid JSON and includes the expected GitHub App manifest fields:

- `name`
- `url`
- `description`
- `public`
- `hook_attributes.url`
- `redirect_url`
- `callback_urls`
- `setup_url`
- `setup_on_update`
- `request_oauth_on_install`
- `default_permissions`
- `default_events`

## Permission check

Expected baseline permissions:

```json
{
  "metadata": "read",
  "contents": "write",
  "pull_requests": "write",
  "issues": "write",
  "checks": "write",
  "actions": "read"
}
```

Observed baseline permissions match exactly.

Forbidden permissions absent:

- `administration`
- `workflows`
- `secrets`
- `dependabot_secrets`
- `environments`
- `repository_hooks`
- `organization_hooks`
- `organization_administration`
- `members`
- `organization_secrets`
- `organization_self_hosted_runners`

## Webhook shortlist check

Expected baseline events:

```json
[
  "installation",
  "installation_repositories",
  "issues",
  "issue_comment",
  "pull_request",
  "pull_request_review",
  "push",
  "check_suite",
  "check_run",
  "workflow_run",
  "fork"
]
```

Observed baseline events match exactly.

## Acceptance criteria mapping

| Acceptance criterion | Result | Evidence |
|---|---:|---|
| What each permission is for is explained | pass | `docs/github-app-permissions.md#permission-matrix` |
| Administration permission is not required | pass | `administration` absent from manifest and listed as excluded |
| Metadata / contents / pull requests / issues / checks are explicit | pass | Manifest and permission matrix name each permission |
| Installation scope is defined | pass | Selected-repository installation rule documented |
| Webhook event shortlist is defined | pass | Event table documented |

## Intentional exclusions

T006 does not implement:

- webhook server
- HMAC verification code
- event inbox
- installation token refresh
- scheduler
- production rollout
- security-gates permission expansion
- workflow mutation
