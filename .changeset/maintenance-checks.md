---
'@lzear/repo-lint': minor
'@lzear/forge': minor
'@lzear/configs': minor
---

More maintenance automation. `forge check` gains two checks: `deps-audit` (package-manager-native security audit — prod deps, high severity and up) and `deps-deprecated` (flags direct dependencies whose resolved version is deprecated on npm, including workspaces and `npm:` aliases). `forge update` gains a LICENSE copyright-year bump (`2023` → `2023-2026`) and a dedupe pass after install (`yarn dedupe` / `pnpm dedupe` / `npm dedupe`). `@lzear/configs` tsconfig target bumped ES2022 → ES2023 (node ≥ 24 everywhere).
