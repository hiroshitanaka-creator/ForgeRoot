{
  "name": "ForgeRoot",
  "url": "https://github.com/hiroshitanaka-creator/ForgeRoot",
  "description": "ForgeRoot control-plane GitHub App. It receives bounded repository events and opens reviewable forged PRs; it does not require Administration or Workflow permissions.",
  "public": false,
  "hook_attributes": {
    "url": "https://forgeroot.example.com/webhooks/github",
    "active": true
  },
  "redirect_url": "https://forgeroot.example.com/setup/github/manifest/complete",
  "callback_urls": [
    "https://forgeroot.example.com/setup/github/callback"
  ],
  "setup_url": "https://forgeroot.example.com/setup/github/install",
  "setup_on_update": true,
  "request_oauth_on_install": false,
  "default_permissions": {
    "metadata": "read",
    "contents": "write",
    "pull_requests": "write",
    "issues": "write",
    "checks": "write",
    "actions": "read"
  },
  "default_events": [
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
}
