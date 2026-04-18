# apps/github-app

GitHub App control-plane surface for ForgeRoot.

Current T006 contents:

- `app-manifest.json` — minimum GitHub App manifest for the initial control plane.

This directory still intentionally excludes the webhook server, token refresh logic, scheduler, and production rollout code. Those belong to later tasks, starting with T007.

Permission notes live in `../../docs/github-app-permissions.md`.
