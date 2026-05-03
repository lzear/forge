# Changelog

## 4.1.0

### Minor Changes

- Add commitlint config. `@lzear/configs/commitlint` and `@lzear/forge/commitlint` export a Conventional Commits config (header max 100). `forge sync` now syncs `lefthook.yml`.
- Add `@lzear/configs/commitlint/emoji` and `@lzear/forge/commitlint/emoji` — custom rule requiring commit messages to start with an emoji (`\p{Extended_Pictographic}`).

## 4.0.3

### Minor Changes

- Make tsconfigs more strict

## 4.0.2

- Initial working release of all four packages: `@lzear/forge`, `@lzear/configs`, `@lzear/eslint-config`, `@lzear/repo-lint`
