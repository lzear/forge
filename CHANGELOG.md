## 4.4.1

`forge update`'s yarn-berry install step now upgrades scoped packages too — `yarn up -R '*'` alone silently skips `@scope/name` deps, leaving them stale in the lockfile even when a newer version satisfies the existing range.

### Commits

- [`a19f4d8`](https://github.com/lzear/forge/commit/a19f4d8) chore: drop pkg.pr.new preview job
- [`2d42655`](https://github.com/lzear/forge/commit/2d42655) chore: remove resolutions
- [`1af934e`](https://github.com/lzear/forge/commit/1af934e) fix: include scoped packages in yarn up
- [`9fe969a`](https://github.com/lzear/forge/commit/9fe969a) chore: forge update
- [`b35f2b3`](https://github.com/lzear/forge/commit/b35f2b3) fix: use lockfile hash for install status comparison

## 4.4.0

`forge sync` now also writes `.github/zizmor.yml` (shared zizmor policy: hash-pin all action refs)

### Commits

- [`5e69f1d`](https://github.com/lzear/forge/commit/5e69f1d) chore: ncu
- [`07da081`](https://github.com/lzear/forge/commit/07da081) feat: composite setup action, uniform hash-pin zizmor policy
- [`eec9976`](https://github.com/lzear/forge/commit/eec9976) feat: ci-workflow

## 4.3.0

More maintenance automation. `forge check` gains two checks: `deps-audit` (package-manager-native security audit — prod deps, high severity and up) and `deps-deprecated` (flags direct dependencies whose resolved version is deprecated on npm, including workspaces and `npm:` aliases). `forge update` gains a LICENSE copyright-year bump (`2023` → `2023-2026`) and a dedupe pass after install (`yarn dedupe` / `pnpm dedupe` / `npm dedupe`). `@lzear/configs` tsconfig target bumped ES2022 → ES2023 (node ≥ 24 everywhere).

### Commits

- [`678a3aa`](https://github.com/lzear/forge/commit/678a3aa) ci: fix zizmor findings, pin actions to SHAs
- [`5d6b081`](https://github.com/lzear/forge/commit/5d6b081) refactor(repo-lint): terser check output, single codacy check
- [`f4c0def`](https://github.com/lzear/forge/commit/f4c0def) chore: forge update (LICENSE copyright year)
- [`0a27064`](https://github.com/lzear/forge/commit/0a27064) feat: sherif check, zizmor & pkg.pr.new CI jobs
- [`e8a0ab7`](https://github.com/lzear/forge/commit/e8a0ab7) feat: more maintenance automation. `forge check` `forge update`...
- [`764c808`](https://github.com/lzear/forge/commit/764c808) chore: replace `eslint-plugin-package-json` by `eslint-package-json`
- [`34ae88a`](https://github.com/lzear/forge/commit/34ae88a) chore: ncu (unicorn update)
- [`8db39fe`](https://github.com/lzear/forge/commit/8db39fe) chore: update to typescript 7

## 4.2.2

Update eslint peer to version 10, and minor fixes.

### Commits

- [`f3666bd`](https://github.com/lzear/forge/commit/f3666bd) chore: ncu also updates peerDeps; bump peerDep eslint to ^10
- [`549b0bd`](https://github.com/lzear/forge/commit/549b0bd) fix: remove ./publish from exports (bin script)
- [`6083f47`](https://github.com/lzear/forge/commit/6083f47) chore: remove NPM_TOKEN secret check (using OIDC now)
- [`2a5b150`](https://github.com/lzear/forge/commit/2a5b150) docs: changelog
- [`dda32b0`](https://github.com/lzear/forge/commit/dda32b0) ci: fixup versioning
- [`3a81680`](https://github.com/lzear/forge/commit/3a81680) Revert "ci: publish after misconfiguration"
- [`b7e5677`](https://github.com/lzear/forge/commit/b7e5677) ci: publish after misconfiguration
- [`e237ade`](https://github.com/lzear/forge/commit/e237ade) ci: fix npm publish
- [`58d8606`](https://github.com/lzear/forge/commit/58d8606) ci: fix npm publish
- [`1b3d40b`](https://github.com/lzear/forge/commit/1b3d40b) ci: fix npm publish

## 4.2.1

- Add `curly` (multi) and `unicorn/switch-case-braces` (avoid) rules; update dependencies
- Fix `@lzear/configs/changelog` export: add `src/changelog.mjs` and `src/changelog.d.ts` to published files
- Read Node.js minimum version from `engines` field in ESLint config instead of hardcoding
- Remove `@changesets/changelog-github` in favour of custom changelog generator

### Commits

- [`d4a6993`](https://github.com/lzear/forge/commit/d4a6993) chore: read node version from engines field in eslint config
- [`9e1ef9a`](https://github.com/lzear/forge/commit/9e1ef9a) chore: update rules (incl. curly)
- [`4464ef9`](https://github.com/lzear/forge/commit/4464ef9) chore: apply curly
- [`4f8fffc`](https://github.com/lzear/forge/commit/4f8fffc) ci: remove @changesets/changelog-github
- [`bdd8142`](https://github.com/lzear/forge/commit/bdd8142) build: publish changelog.mjs and add type declarations

## 4.1.2

- Fix publish script

### Commits

- [`76b2ce3`](https://github.com/lzear/forge/commit/76b2ce3) fix: publish script

## 4.1.1

- Update repo-lint checks and ESLint rules; fix npm publish auth

### Commits

- [`0f20e7e`](https://github.com/lzear/forge/commit/0f20e7e) feat: update repo-lint
- [`b671c00`](https://github.com/lzear/forge/commit/b671c00) feat: update rules
- [`7bae266`](https://github.com/lzear/forge/commit/7bae266) fix: npm publish auth and bin entries

## 4.1.0

- Add commitlint config. `@lzear/configs/commitlint` and `@lzear/forge/commitlint` export a Conventional Commits config (header max 100). `forge sync` now syncs `lefthook.yml`.
- Add `@lzear/configs/commitlint/emoji` and `@lzear/forge/commitlint/emoji` — custom rule requiring commit messages to start with an emoji (`\p{Extended_Pictographic}`).

### Commits

- [`c942c5a`](https://github.com/lzear/forge/commit/c942c5a) feat: commitlint
- [`5199d17`](https://github.com/lzear/forge/commit/5199d17) feat: add commitlint/emoji rule

## 4.0.3

- Make tsconfigs more strict

### Commits

- [`1f4d91b`](https://github.com/lzear/forge/commit/1f4d91b) fix: publish script
- [`ba35a56`](https://github.com/lzear/forge/commit/ba35a56) feat: enhance changelog generation with commit section
- [`bba4940`](https://github.com/lzear/forge/commit/bba4940) feat: make ts more strict

## 4.0.2

- Initial working release of all four packages: `@lzear/forge`, `@lzear/configs`, `@lzear/eslint-config`, `@lzear/repo-lint`

### Commits

- [`3ad0b75`](https://github.com/lzear/forge/commit/3ad0b75) chore: extract configuration files into repo
- [`d55cee2`](https://github.com/lzear/forge/commit/d55cee2) chore: add typecheck
- [`dfbe2ff`](https://github.com/lzear/forge/commit/dfbe2ff) chore: update TS ESLint configurations with strictTypeChecked
- [`4755eb7`](https://github.com/lzear/forge/commit/4755eb7) fix: publish script
