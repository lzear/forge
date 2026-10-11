---
'@lzear/repo-lint': major
'@lzear/forge': major
---

Codacy is opt-in: the `codacy` check, the `CODACY_PROJECT_TOKEN` secret check, `forge setup` and `listSecrets` are removed (set the secret with `gh secret set CODACY_PROJECT_TOKEN`). `forge sync` and the `template-sync` check update `.codacy.yml` only where it exists; `forge init` writes no Codacy badges.
