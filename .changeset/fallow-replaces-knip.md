---
'@lzear/repo-lint': minor
'@lzear/forge': minor
---

`forge check` runs `fallow dead-code` instead of `knip`: the `pkg-knip` check is now `pkg-fallow`. Repos with a `knip` config need a `.fallowrc.json` equivalent.
