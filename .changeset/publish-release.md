---
'@lzear/configs': minor
---

`lzear-publish --release` creates the GitHub release after staging, with notes from the changelog: `v<version>` for a fixed group, `<name>@<version>` per package otherwise. A released version is skipped, even while its npm stage awaits approval. `--tag <dist-tag>` stages under a dist-tag, for snapshots.
