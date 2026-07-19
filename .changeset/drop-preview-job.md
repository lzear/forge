---
'@lzear/forge': patch
---

Drop the pkg.pr.new preview job from the reusable CI workflow (`run-preview`/`preview-packages` inputs removed). It required installing a GitHub App per repo for no real benefit here — changesets already gives fast normal releases.
