---
'@lzear/repo-lint': minor
'@lzear/forge': patch
---

The `codacy` check and the `CODACY_PROJECT_TOKEN` secret check removed: Codacy is opt-in. `forge sync` and the `template-sync` check update `.codacy.yml` only where it exists; `forge init` writes no Codacy badges.
