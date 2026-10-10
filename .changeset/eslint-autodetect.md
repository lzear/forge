---
'@lzear/eslint-config': minor
---

`react`, `typescript` and `vitest` default to whether the cwd's manifests (root and workspaces) depend on them (`typescript` also on a `tsconfig.json`); breaking only for a repo that relied on a layer it doesn't depend on: pass it explicitly.
