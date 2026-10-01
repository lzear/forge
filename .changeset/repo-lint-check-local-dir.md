---
'@lzear/repo-lint': patch
---

`checkLocal({ dir })` reads the repo name from `dir`'s origin, not the cwd's.
