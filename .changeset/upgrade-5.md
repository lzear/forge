---
'@lzear/forge': major
---

Upgrade from 4:

- `forge update` moves the `^4` ranges to `^5` (ncu crosses majors).
- `forge check --fix` repins forge's workflows, syncs `lefthook.yml` (gitleaks, Markdown, YAML and JSON lint) and writes the release-age gate.
- `eslint --fix` for the JSON, Markdown and YAML layers.
- `.codacy.yml` is no longer required.
