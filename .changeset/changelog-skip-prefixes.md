---
'@lzear/configs': patch
---

The changelog generator now drops `ci:`, `chore: ncu` and other skipped commits again: it read each subject one character too late, so the skip list never matched.
