---
'@lzear/repo-lint': minor
---

`ci-workflow` check now enforces that a workflow calls the forge reusable CI (`lzear/forge/.github/workflows/ci.yml`) instead of merely checking that a local `ci.yml` exists. Stale local copies fail with migration instructions. The forge repo itself (which hosts the workflow) passes.
