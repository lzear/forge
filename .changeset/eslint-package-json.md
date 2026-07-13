---
'@lzear/eslint-config': minor
---

Replace `eslint-plugin-package-json` (jsonc parser) with sindresorhus's [`eslint-package-json`](https://github.com/sindresorhus/eslint-package-json) (`@eslint/json`). The recommended preset catches real package.json mistakes (typo fields, broken exports, redundant files entries, missing keywords/engines, …) and keeps sorting. The custom `lzear/major-version-only` rule was ported to the new Momoa AST and still applies on top. Note: repos may see new package.json errors — most are autofixable with `eslint --fix`.
