---
"@lzear/configs": patch
"@lzear/eslint-config": patch
"@lzear/forge": patch
"@lzear/repo-lint": patch
---

- Fix `./changelog` export: include `src/changelog.mjs` and `src/changelog.d.ts` in published files; add type declarations
- Read Node.js minimum version from `engines` field in ESLint config instead of hardcoding
- Update ESLint and related dependencies
- Remove `@changesets/changelog-github` in favor of custom changelog generator
