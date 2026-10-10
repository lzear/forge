---
'@lzear/repo-lint': minor
---

- The lefthook template's pre-commit eslint also lints md, yml, yaml and jsonc files.
- `monorepo-lint` reads pnpm-workspace.yaml, so it runs sherif on pnpm-only workspaces.
- `forge sync` and the `template-sync` check handle `.codacy.yml` only in repos that publish a package; `syncTemplates` takes `published` to override.
- The `forge` field takes `repo` (`owner/name`), used before the `origin` remote for remote checks, `forge setup` and `forge init`.
