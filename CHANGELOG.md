## 4.2.0

- Add `curly` (multi) and `unicorn/switch-case-braces` (avoid) rules; update dependencies

### Commits

- d4a6993 chore: read node version from engines field in eslint config
- 9e1ef9a chore: update rules (incl. curly)
- 4464ef9 chore: apply curly

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
