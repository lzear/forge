---
'@lzear/eslint-config': patch
---

Parser no longer sets `tsconfigRootDir`, so ESLint caches stay valid across checkouts.
