# CLAUDE.md

Yarn workspaces monorepo of shared dev tooling, published to npm and JSR. Packages: see `README.md`.

## Commands

```bash
CI=true yarn qa                                      # build + typecheck + lint + test + forge check
cd packages/<name> && yarn vitest run src/x.test.ts  # one test file
```

`CI=true` keeps colors on when output is piped: color-dependent tests otherwise pass locally and fail in CI.

## Gotchas

- `deno.json` files are generated from `package.json` + tsup entries by `yarn lzear-sync-jsr`; never edit by hand. `@lzear/eslint-config` is npm-only (its untyped plugins' ambient shims don't resolve on JSR), so `@lzear/forge` drops `./eslint` there. The root keeps `@types/node` for `deno publish`. Check JSR changes with `deno publish --dry-run --allow-dirty`.
- `release.yml` inlines its setup steps: a reusable workflow can't `uses: ./actions/setup` from the caller's checkout.
- Consumers pin forge workflows by SHA: rewriting history orphans them (zizmor `impostor-commit`; lzear.org's deploy needs its CI).
- `@lzear/eslint-config` loads Prettier last so it overrides the rest.
- `ignoreDeprecations` in `configs/tsconfig/base.json` stays: tsup's dts build injects `baseUrl` (TS5101).
- `fallow health` CRAP findings mean missing coverage, not complexity: add tests.
- Release-age gate: Bun's `minimumReleaseAgeExcludes` takes exact names, no globs. Never adopt a dep younger than the gate, even by hand. `bun audit` can't ignore advisories from bunfig (`--ignore` is CLI-only).
- `forge sync` fetches `template/` and `.github/zizmor.yml` from GitHub `main`, so consumers see template changes only once pushed. The root `.editorconfig`, `.codacy.yml` and `lefthook.yml` are copies of `template/`'s: change both.
