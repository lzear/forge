---
'@lzear/configs': minor
---

`lzear-changelog` replaces the `@lzear/configs/changelog` changesets plugin: run it before `changeset version` (with `"changelog": false`) to prepend one `CHANGELOG.md` section per release, at the fixed group's real version, with every changeset summary and the commits since the last `v*` tag. `lzear-publish` stages into the OS temp dir and leaves provenance to trusted publishing.
