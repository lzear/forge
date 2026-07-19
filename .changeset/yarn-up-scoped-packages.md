---
'@lzear/repo-lint': patch
---

`forge update`'s yarn-berry install step now upgrades scoped packages too — `yarn up -R '*'` alone silently skips `@scope/name` deps, leaving them stale in the lockfile even when a newer version satisfies the existing range.
