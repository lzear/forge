## 4.2.2

Update eslint peer to version 10, and minor fixes.

### Commits

- f3666bd chore: ncu also updates peerDeps; bump peerDep eslint to ^10
- 549b0bd fix: remove ./publish from exports (bin script)
- 6083f47 chore: remove NPM_TOKEN secret check (using OIDC now)
- 2a5b150 docs: changelog
- dda32b0 ci: fixup versioning
- 3a81680 Revert "ci: publish after misconfiguration"
- b7e5677 ci: publish after misconfiguration
- e237ade ci: fix npm publish
- 58d8606 ci: fix npm publish
- 1b3d40b ci: fix npm publish

## 4.2.1

- Add `curly` (multi) and `unicorn/switch-case-braces` (avoid) rules; update dependencies
- Fix `@lzear/configs/changelog` export: add `src/changelog.mjs` and `src/changelog.d.ts` to published files
- Read Node.js minimum version from `engines` field in ESLint config instead of hardcoding
- Remove `@changesets/changelog-github` in favour of custom changelog generator

### Commits

- d4a6993 chore: read node version from engines field in eslint config
- 9e1ef9a chore: update rules (incl. curly)
- 4464ef9 chore: apply curly
- 4f8fffc ci: remove @changesets/changelog-github
- bdd8142 build: publish changelog.mjs and add type declarations

## 4.1.2

- Fix publish script

### Commits

- 76b2ce3 fix: publish script

## 4.1.1

- Update repo-lint checks and ESLint rules; fix npm publish auth

### Commits

- 0f20e7e feat: update repo-lint
- b671c00 feat: update rules
- 7bae266 fix: npm publish auth and bin entries

## 4.1.0

- Add commitlint config. `@lzear/configs/commitlint` and `@lzear/forge/commitlint` export a Conventional Commits config (header max 100). `forge sync` now syncs `lefthook.yml`.
- Add `@lzear/configs/commitlint/emoji` and `@lzear/forge/commitlint/emoji` — custom rule requiring commit messages to start with an emoji (`\p{Extended_Pictographic}`).

### Commits

- c942c5a feat: commitlint
- 5199d17 feat: add commitlint/emoji rule

## 4.0.3

- Make tsconfigs more strict

### Commits

- 1f4d91b fix: publish script
- ba35a56 feat: enhance changelog generation with commit section
- bba4940 feat: make ts more strict

## 4.0.2

- Initial working release of all four packages: `@lzear/forge`, `@lzear/configs`, `@lzear/eslint-config`, `@lzear/repo-lint`

### Commits

- 3ad0b75 chore: extract configuration files into repo
- d55cee2 chore: add typecheck
- dfbe2ff chore: update TS ESLint configurations with strictTypeChecked
- 4755eb7 fix: publish script
