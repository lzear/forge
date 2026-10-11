---
'@lzear/repo-lint': patch
---

`forge update` holds the package manager, Node and Bun to the release-age gate, keeps corepack's hash, updates every Bun workspace keeping its ranges, and runs its network steps concurrently. Workspaces resolve from `pnpm-workspace.yaml`, `**` globs and `!` negations.
