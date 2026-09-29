---
'@lzear/configs': patch
---

`lzear-publish` stages a prerelease under its id (`1.0.0-rc.2` under `rc`) when `--tag` is not given, instead of npm refusing it, and marks its GitHub release as a prerelease.
