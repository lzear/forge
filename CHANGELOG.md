## 4.2.0

- Add `curly` (multi) and `unicorn/switch-case-braces` (avoid) rules; update dependencies

### Commits

- d4a6993 chore: read node version from engines field in eslint config
- 0390cb7 chore: add root CHANGELOG.md generator for changesets
- fb7eae8 chore: add changeset for rule updates and dep bumps
- 4bd2cd7 ci: disable GitHub release notes from changesets
- 9a143d7 ci: switch to npm OIDC trusted publishing
- 4464ef9 chore: apply curly
- 9e1ef9a chore: update rules (incl. curly)
- 04a85f7 chore: set fflate resolution
- 4864ea6 chore: ncu
- 25ab7c9 chore: update package.json bin (automatic from something?)
- 0ae879e chore: fixup deps

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
