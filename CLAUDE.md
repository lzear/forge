# CLAUDE.md

Yarn workspaces monorepo of shared dev tooling, published to npm and JSR. Packages: see `README.md`.

## Brevity

Keep everything brief: docs, comments, changesets, commit messages, code. Cut what the reader can infer.

## Commands

```bash
yarn qa                                              # build + typecheck + lint + test + forge check
cd packages/<name> && yarn vitest run src/x.test.ts  # one test file
```

## Gotchas

- `deno.json` files are generated from `package.json` + tsup entries by `yarn lzear-sync-jsr`; never edit by hand. `@lzear/eslint-config` is npm-only (its untyped plugins' ambient shims don't resolve on JSR), so `@lzear/forge` drops `./eslint` there.
- `release.yml` inlines its setup steps: a reusable workflow can't `uses: ./actions/setup` from the caller's checkout.
- `@lzear/eslint-config` loads Prettier last so it overrides the rest.
- Oxlint evaluated 2026-09: ~4× faster, but 210 rules unported (181 unicorn) and no per-override settings (breaks `lzear/prefer-relative-imports`). Staying on ESLint until unicorn coverage catches up.
- add changeset md with commits
