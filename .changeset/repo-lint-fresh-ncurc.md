---
'@lzear/repo-lint': patch
---

`deps-fresh` runs `forge update`'s ncu step dry, so it honours `.ncurc`, peer deps and `{ "packages": [...] }` workspaces.
