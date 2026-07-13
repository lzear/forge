---
'@lzear/repo-lint': minor
'@lzear/forge': minor
---

New `monorepo-lint` check runs `sherif` (workspace consistency) on monorepos. Check output simplified: shorter descriptions, and the two Codacy badge checks + `.codacy.yml` merged into a single `codacy` check (ids `readme-codacy-*-badge`/`codacy-config` removed). The reusable CI workflow gains a `zizmor` job (GitHub Actions security audit) and an opt-out `preview` job publishing PR preview packages via pkg.pr.new (`run-preview`, `preview-packages` inputs).
