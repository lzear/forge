---
'@lzear/configs': patch
---

`@lzear/configs/changelog` no longer hardcodes forge's own repo — repo URL is read from the consumer's root `package.json.repository`, and the released package's version is looked up by name instead of assuming `packages/forge/package.json`. Commits in generated changelogs are now linked. Any repo can use `"changelog": "@lzear/configs/changelog"` in `.changeset/config.json`.
