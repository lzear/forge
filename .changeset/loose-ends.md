---
'@lzear/repo-lint': minor
---

- `monorepo-lint` reads pnpm-workspace.yaml, so it runs sherif on pnpm-only workspaces.
- The `forge` field takes `repo` (`owner/name`), used before the `origin` remote for remote checks and `forge init`.
