---
'@lzear/repo-lint': minor
'@lzear/forge': minor
---

`forge init` (`initRepo`) scaffolds the missing forge files, pinned to the release, into a repo that passes its own qa: `packageManager`, forge's ranges (TS 6 and 7, Vite), `src/`, the package fields lint wants, React configs when `react` is a dependency; then it checks, once the dev dependencies are installed. A throwing check fails alone.
