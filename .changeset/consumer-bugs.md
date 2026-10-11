---
'@lzear/repo-lint': patch
'@lzear/forge': patch
---

Fix `forge check` in consumer repos: Bun's audit fails on high severity only, workspace packages skip npm lookups, publint packs with the root's manager, remote checks need a GitHub repo, `--json` keeps long output.
