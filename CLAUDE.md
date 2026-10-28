# CLAUDE.md

Yarn workspaces monorepo of shared dev tooling, published to npm and JSR. Packages: see `README.md`.

## Commands

```bash
CI=true yarn qa                                      # build, then typecheck, lint, test, forge check at once
cd packages/<name> && yarn vitest run src/x.test.ts  # one test file
yarn zizmor                                          # audit workflows (brew/uv zizmor; CI runs the action)
yarn e2e:init [lib-yarn|app-bun|lib-bun|react-yarn]  # scaffold, install from npm, run each script: after changing forge init or its configs
```

`CI=true` keeps colors on when output is piped: color-dependent tests otherwise pass locally and fail in CI.

## Gotchas

- Parse spawned CLIs' machine output (`--json`): `concurrently` sets `FORCE_COLOR`, so plain output carries ANSI codes.
- `deno.json` files are generated from `package.json` + tsdown entries by `yarn lzear-sync-jsr`; never edit by hand. `@lzear/eslint-config` is npm-only (its untyped plugins' ambient shims don't resolve on JSR), so `@lzear/forge` drops `./eslint` there. The root keeps `@types/node` for `deno publish`. Check JSR changes with `deno publish --dry-run --allow-dirty`. A plain file reaches JSR's include only as an export (repo-lint's `templates/*`), which attw can't resolve: list it in the package's `.attw.json`. Deno types `URL` apart from `node:url`'s: hand node APIs `.href`. It types `import.meta.dirname` as `string | undefined` (a remote module has none). Run the dry run with the latest Deno 2 (`deno upgrade --output <path>`), as CI does: an older one lacks the ESNext types forge uses.
- `release.yml` runs one `deno publish` per JSR member, from its dir, workspace deps first: each fetches its own OIDC token, which a slow publish before it outlives (`ExpiredSignature` after a 6-min `@lzear/configs`). Deno 2.0 type-checks `configs` alone without the root's `@types/node`; CI's `v2.x` doesn't.
- `release.yml` inlines its setup steps: a reusable workflow can't `uses: ./actions/setup` from the caller's checkout.
- Bare `zizmor .github` misses `.github/zizmor.yml` in an agent worktree (18 findings, not 0): `yarn zizmor` passes `--config`.
- Consumers pin forge workflows by SHA: rewriting history orphans them (zizmor `impostor-commit`; lzear.org's deploy needs its CI).
- `@lzear/eslint-config` loads Prettier last so it overrides the rest.
- Builds emit dts with oxc: an exported value needs a type `isolatedDeclarations` can read (TS9017 on an untyped array; TS9010 on a regex, whose `: RegExp` lint strips: export a function using it). JSR checks the same, but not on npm-only `eslint-config`.
- Release-age gate: Bun's `minimumReleaseAgeExcludes` takes exact names, no globs. Never adopt a dep younger than the gate, even by hand. `bun audit` can't ignore advisories from bunfig (`--ignore` is CLI-only).
- Shared files' source: `packages/repo-lint/templates/`, shipped with the package (`forge sync`, `template-sync` check). Edit there, then `yarn build && yarn forge sync`: it rewrites the root copies and `template/`, which forge ≤ 4.10 fetches from `main`; the check fails on drift. `forge init`'s live in `templates/init/`, `{{key}}` placeholders, `.ts`/`tsconfig.json` ones extensionless so lint, tsc and fallow skip them; each template is a `package.json` export (and `.attw.json` exclude).
- Output quiets under coding agents through std-env's `isAgent`, the signal Vitest reads for its `minimal` reporter. Tests of agent-dependent output mock `std-env`: Vitest itself runs under the agent.
- `deps-fresh` runs `ncu` on peer ranges too, raising `>=` floors: a peer that must not track the latest major (`typescript`: TS 7 has no JS API for typescript-eslint) takes `*` and leaves the range to the plugins.
- A shared config naming a package by string (commitlint's `parserPreset`) gets it resolved from the consumer, where Bun's isolated linker hides transitive deps: depend on it and inline the import.
- `qa`'s `forge check` fails only on the gate: drift checks (`drift: true` in `checks.ts`; `gh` logged out too, while only they need it) print `!` and leave qa green, for `housekeep`'s `forge check --strict` to catch. A check that fails on time, not on the tree, takes `drift: true`.
- `bin.ts` ends an output-printing command with `process.exitCode`, not `process.exit()`: exit cuts a piped stdout past 64 KB (macOS). `bin.test.ts` reads and resets it.
- After `yarn housekeep` moves main past an open Renovate PR, Renovate may post 'Rebase not applied'. This is expected: the next version is still in its waiting period (3 days, or 7 for automerged patches, see `default.json`), so Renovate rebases the PR once that version is old enough, or you can close the PR by hand.
