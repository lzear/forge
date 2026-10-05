## 4.9.0

`@typescript-eslint/consistent-type-definitions` takes `type`: `--fix` rewrites interfaces.

`package-json/no-nested-exports` skips the cwd's workspace manifests.

### Commits

- [`ade6cc4`](https://github.com/lzear/forge/commit/ade6cc4) feat(eslint-config): prefer type aliases over interfaces
- [`a9aaded`](https://github.com/lzear/forge/commit/a9aaded) fix(eslint-config): allow exports in workspace package.json files

## 4.8.2

`lzear/prefer-relative-imports` keeps an import's query (`?url`) in its fix.

### Commits

- [`dff5c62`](https://github.com/lzear/forge/commit/dff5c62) fix(eslint-config): keep import query in prefer-relative-imports fix

## 4.8.1

`deps-release-age` reads Yarn's gate under `FORCE_COLOR`.

### Commits

- [`a8d31cc`](https://github.com/lzear/forge/commit/a8d31cc) fix(repo-lint): read yarn age gate as JSON so FORCE_COLOR can't zero it

## 4.8.0

Quiet under coding agents: silent tsup, Vite warnings only, `forge check` failures only.

`defineBinConfig` drops its shebang banner: the bin source carries its own.

ESLint 10 plugins only: `jsx-a11y-x` replaces `jsx-a11y` under the same rule names; `@eslint-react` covers `react`, dropped with `react-perf`.

`forgePlugin()` for framework Vite configs: agent log level, dev 404 for `/.well-known/*`.

`git-hooks` check: `lefthook.yml` exists and gets installed.

Type-only imports take `import type`: `verbatimModuleSyntax` kept `import { type A } from 'x'` as `import 'x'`.

Declare the `typescript` peer the plugins need.

### Commits

- [`0c210fa`](https://github.com/lzear/forge/commit/0c210fa) chore: `yarn housekeep`
- [`854fb7e`](https://github.com/lzear/forge/commit/854fb7e) feat(configs): forgePlugin for framework Vite configs
- [`2bd43ac`](https://github.com/lzear/forge/commit/2bd43ac) fix(eslint-config): flag type imports kept as side effects
- [`fcf2f8f`](https://github.com/lzear/forge/commit/fcf2f8f) fix(configs): keep the bin source's shebang instead of a banner
- [`3a1ba20`](https://github.com/lzear/forge/commit/3a1ba20) fix: clear yarn install's peer warnings
- [`f751512`](https://github.com/lzear/forge/commit/f751512) feat(eslint-config): use only plugins that support ESLint 10
- [`327e5ab`](https://github.com/lzear/forge/commit/327e5ab) feat: quiet builds and forge check under coding agents
- [`cd35904`](https://github.com/lzear/forge/commit/cd35904) feat(repo-lint): check git hooks are installed
- [`5cbfd0e`](https://github.com/lzear/forge/commit/5cbfd0e) feat(template): lint staged files, run hooks under any package manager
- [`3af94aa`](https://github.com/lzear/forge/commit/3af94aa) docs: slim CLAUDE.md, add gotchas

## 4.7.0

`lzear-prerelease` publishes an alpha or beta of the pending changesets.

`eslint-package-json` back to v1 until v2 is 3 days old.

### Commits

- [`72b0c81`](https://github.com/lzear/forge/commit/72b0c81) fix(eslint-config): revert eslint-package-json to v1
- [`c6222c6`](https://github.com/lzear/forge/commit/c6222c6) feat(configs): add lzear-prerelease
- [`95cfbe0`](https://github.com/lzear/forge/commit/95cfbe0) refactor(configs): extract readStatus from lzear-changelog

## 4.6.0

`lib` and `app` tsconfigs target ES2025.

README documents presets, defaults and bin flags.

`lzear-publish` titles GitHub releases with their tag.

Base tsconfig enables `erasableSyntaxOnly` and `noImplicitOverride`, and makes unreachable code and unused labels errors.

`lzear-sync-jsr` excludes tests from JSR when they only live in `src` subfolders.

`vitest/react` extends `vitest`, so it also writes `coverage-final.json` for `fallow health`.

Remove the `repo-lint` CLI, `checkRepo` and `forge check --repos`/`--dir`; run `forge check` inside each repo.

`e18e/ban-dependencies` flags `package.json` deps with a native or micro-utility replacement.

`eslint-package-json` v2: adds `package-json/no-node-modules-bin-paths`.

README documents options, layers and rules.

`lzear/major-version-only` keeps 0.x ranges up to their first non-zero part: `~0.5.4` → `~0.5`, `^0.0.2` unchanged.

`forge setup` pipes secrets to `gh` via stdin and reports a failed `gh secret set`.

`forge setup` detects repos with a dot in their name; `@lzear/repo-lint` exports `detectRepo`.

`forge sync` reports each file as unchanged, created or updated; `--dry` previews which.

README `vite` example uses `defineReactConfig()`; there is no default export.

`checkLocal({ dir })` reads the repo name from `dir`'s origin, not the cwd's.

`ci-workflow` also applies to repos that publish nothing.

`deps-fresh` runs `forge update`'s ncu step dry, so it honours `.ncurc`, peer deps and `{ "packages": [...] }` workspaces.

Export `listSecrets`.

README lists the `jsr-config` check.

`forge update` skips versions under 3 days old, except own packages; new `deps-release-age` check requires the package manager to do the same.

`renovate` requires extending the `github>lzear/forge` preset.

`pkg-size-limit` runs the repo's `size-limit` wherever it is configured.

`forge update` keeps a version file's precision (`v22` → `v26`) and leaves aliases like `lts/*` alone.

### Commits

- [`2b570ad`](https://github.com/lzear/forge/commit/2b570ad) docs: adopt steps and workflow inputs in README
- [`9bf2a7e`](https://github.com/lzear/forge/commit/9bf2a7e) docs(configs): document presets, defaults and bin flags
- [`cd6c99e`](https://github.com/lzear/forge/commit/cd6c99e) docs(eslint-config): document options, layers and rules
- [`e34ecc3`](https://github.com/lzear/forge/commit/e34ecc3) fix(configs): title GitHub releases with their tag
- [`86d1907`](https://github.com/lzear/forge/commit/86d1907) feat: wait 3 days before adopting new versions
- [`c4ac11a`](https://github.com/lzear/forge/commit/c4ac11a) test(forge): strip colors from captured CLI output
- [`78b9d06`](https://github.com/lzear/forge/commit/78b9d06) feat(eslint-config): bump eslint-package-json to v2
- [`b1f2816`](https://github.com/lzear/forge/commit/b1f2816) refactor(forge): reuse repo-lint's listSecrets in forge setup
- [`243d598`](https://github.com/lzear/forge/commit/243d598) fix(forge): detect repos with a dot in their name
- [`50365bd`](https://github.com/lzear/forge/commit/50365bd) feat: ship the github>lzear/forge Renovate preset and require it
- [`cf56f96`](https://github.com/lzear/forge/commit/cf56f96) docs: slim READMEs and CLAUDE.md
- [`c8c68dc`](https://github.com/lzear/forge/commit/c8c68dc) feat(repo-lint): require the forge CI in unpublished repos too
- [`25c41c4`](https://github.com/lzear/forge/commit/25c41c4) feat(ci): run Bun repos in the reusable CI
- [`9cb2c64`](https://github.com/lzear/forge/commit/9cb2c64) chore(renovate): bump npx-pinned CLIs in workflows
- [`1361fef`](https://github.com/lzear/forge/commit/1361fef) feat: add e18e
- [`605875e`](https://github.com/lzear/forge/commit/605875e) feat: make tsconfig stricter
- [`3aff351`](https://github.com/lzear/forge/commit/3aff351) feat: remove the repo-lint CLI and checkRepo
- [`ea87a37`](https://github.com/lzear/forge/commit/ea87a37) fix(repo-lint): detect the origin of checkLocal's dir
- [`1d44741`](https://github.com/lzear/forge/commit/1d44741) fix(forge): make forge sync --dry show what would change
- [`fa32d90`](https://github.com/lzear/forge/commit/fa32d90) fix(ci): skip nested node_modules when merging coverage for fallow
- [`ed0ba4f`](https://github.com/lzear/forge/commit/ed0ba4f) fix(configs): find nested tests in lzear-sync-jsr
- [`d1b2b5f`](https://github.com/lzear/forge/commit/d1b2b5f) refactor(repo-lint): share the package.json readers of checks and update
- [`62c993d`](https://github.com/lzear/forge/commit/62c993d) fix(repo-lint): keep the precision of node and bun version files
- [`aa0e6df`](https://github.com/lzear/forge/commit/aa0e6df) fix(forge): pipe secrets to gh via stdin and report failures
- [`a7f7d03`](https://github.com/lzear/forge/commit/a7f7d03) docs(repo-lint): list the jsr-config check
- [`f196c63`](https://github.com/lzear/forge/commit/f196c63) fix(repo-lint): share forge update's ncu step with deps-fresh
- [`b9493b0`](https://github.com/lzear/forge/commit/b9493b0) docs: fix the vite and vitest/react README examples
- [`5362cb1`](https://github.com/lzear/forge/commit/5362cb1) fix(configs): extend the base vitest config in vitest/react
- [`8b377db`](https://github.com/lzear/forge/commit/8b377db) fix(eslint-config): keep ^0.x and ^0.0.x ranges in major-version-only

## 4.5.1

Every JSR entrypoint has a module doc with an example, and every exported symbol has JSDoc.

The `repo-lint` binary runs again: it was built with two shebang lines, which Node rejects.

`forge check` sees workspaces listed by plain path (`"workspaces": ["lib"]`).

### Commits

- [`f8ae53a`](https://github.com/lzear/forge/commit/f8ae53a) fix(repo-lint): check workspaces listed by plain path
- [`d238e79`](https://github.com/lzear/forge/commit/d238e79) fix(repo-lint): build the bin with a single shebang
- [`2c07cf8`](https://github.com/lzear/forge/commit/2c07cf8) docs: add module and symbol docs to every JSR entrypoint

## 4.5.0

`forge check` runs fallow instead of knip (`pkg-knip` → `pkg-fallow`). Move knip config to `.fallowrc.json`.

Publish to JSR. `lzear-sync-jsr` generates each `deno.json`, the `jsr-config` check catches drift. `@lzear/eslint-config` stays npm-only.

`lzear-publish` stages on npm for 2FA approval. `--release` creates the GitHub release. Prereleases get their own dist-tag.

`forge setup` no longer asks for `NPM_TOKEN`.

`lzear-changelog` bin replaces the `./changelog` export: one `CHANGELOG.md` section per release.

### Commits

- [`0282bec`](https://github.com/lzear/forge/commit/0282bec) fix(eslint-config): guard missing sonarjs recommended config
- [`63bbc1a`](https://github.com/lzear/forge/commit/63bbc1a) docs: note oxlint evaluation
- [`5c12dad`](https://github.com/lzear/forge/commit/5c12dad) chore: shorten the pending changesets
- [`674cd3d`](https://github.com/lzear/forge/commit/674cd3d) chore: declare the changesets changelog module to fallow
- [`1626840`](https://github.com/lzear/forge/commit/1626840) chore: merge dependency updates into one changelog line
- [`c166cdb`](https://github.com/lzear/forge/commit/c166cdb) fix: keep per-package changelogs for changesets/action
- [`5bc62c0`](https://github.com/lzear/forge/commit/5bc62c0) chore: sync deno.json with the 4.4.4 release
- [`64287ac`](https://github.com/lzear/forge/commit/64287ac) test(configs): answer the publish fakes from a table
- [`c478378`](https://github.com/lzear/forge/commit/c478378) fix(configs): list commits since the last stable release in a stable changelog
- [`f822ba0`](https://github.com/lzear/forge/commit/f822ba0) feat(configs): stage prereleases under their own dist-tag
- [`eb7b673`](https://github.com/lzear/forge/commit/eb7b673) fix(forge): stop asking setup for an NPM_TOKEN
- [`1cef751`](https://github.com/lzear/forge/commit/1cef751) feat(configs): create the GitHub release from lzear-publish
- [`fe90ee6`](https://github.com/lzear/forge/commit/fe90ee6) chore: stop running dependency install scripts
- [`e93dc7d`](https://github.com/lzear/forge/commit/e93dc7d) feat(configs): write one changelog section per release
- [`884bda9`](https://github.com/lzear/forge/commit/884bda9) fix(configs): stage into the OS temp dir, leave provenance to trusted publishing
- [`7d99c87`](https://github.com/lzear/forge/commit/7d99c87) fix(configs): type commitlint severities with RuleConfigSeverity
- [`eef5232`](https://github.com/lzear/forge/commit/eef5232) chore: sync yarn.lock with the eslint-package-json range
- [`069fbca`](https://github.com/lzear/forge/commit/069fbca) fix: lint
- [`9913578`](https://github.com/lzear/forge/commit/9913578) chore: `yarn housekeep`
- [`1f35316`](https://github.com/lzear/forge/commit/1f35316) fix(configs): silence git describe stderr in changelog
- [`5181ba6`](https://github.com/lzear/forge/commit/5181ba6) test(eslint-config): cover the lzear plugin rules
- [`7414297`](https://github.com/lzear/forge/commit/7414297) test(repo-lint): cover the bin and the jsr-config check
- [`b52654d`](https://github.com/lzear/forge/commit/b52654d) test(forge): cover the CLI
- [`122515f`](https://github.com/lzear/forge/commit/122515f) test(configs): cover sync-jsr and the changelog generator
- [`bfc82cf`](https://github.com/lzear/forge/commit/bfc82cf) refactor(forge): drop the unused log.spinner and await parseAsync
- [`41753be`](https://github.com/lzear/forge/commit/41753be) fix(configs): skip ci and ncu commits in the changelog again
- [`79629fa`](https://github.com/lzear/forge/commit/79629fa) refactor(forge): extract secret listing from the setup action
- [`2aff42f`](https://github.com/lzear/forge/commit/2aff42f) refactor(eslint-config): split prefer-relative-imports path helpers
- [`4610620`](https://github.com/lzear/forge/commit/4610620) refactor(configs): flatten the changelog package.json search
- [`cbf2516`](https://github.com/lzear/forge/commit/cbf2516) refactor(repo-lint): dedupe check running and output trimming
- [`cdffb09`](https://github.com/lzear/forge/commit/cdffb09) refactor(configs): share the workspace listing between bins
- [`a055b26`](https://github.com/lzear/forge/commit/a055b26) feat(repo-lint): replace knip with fallow
- [`ac599b4`](https://github.com/lzear/forge/commit/ac599b4) chore: source ~/.lefthookrc before running hook commands
- [`7079a82`](https://github.com/lzear/forge/commit/7079a82) chore: `yarn housekeep`
- [`381105e`](https://github.com/lzear/forge/commit/381105e) feat: check deno.json against package.json
- [`c7a391c`](https://github.com/lzear/forge/commit/c7a391c) fix: type the vitest config default exports
- [`3da66c2`](https://github.com/lzear/forge/commit/3da66c2) refactor: import sources with explicit .ts extensions
- [`89a3996`](https://github.com/lzear/forge/commit/89a3996) chore: changeset v3

## 4.4.4

Enable `reportUnusedDisableDirectives` and `reportUnusedInlineConfigs`, add `@typescript-eslint/consistent-type-imports` (inline style) and `import-x/consistent-type-specifier-style` (prefer-inline), export shared file-glob constants (`FILES.TESTS`, `FILES.REACT`, `FILES.TS`, `FILES.JS`, `FILES.CORE`, `FILES.PACKAGE_JSON`, and their atoms), and export the individual config builders (`core`, `react`, `node`, `typescript`, `vitest`, `a11y`, `packageJson`, `prettier`, `ignores`) so consumers can inspect, reuse, or replace a single layer instead of only appending overrides on top, and turn off `@typescript-eslint/no-non-null-assertion`, the `@typescript-eslint/no-unsafe-*` rules, and `sonarjs/no-duplicate-string` in test files, where they mostly fight mocks and fixtures.

### Commits

- [`9ccc90e`](https://github.com/lzear/forge/commit/9ccc90e) chore: add repo url
- [`8228579`](https://github.com/lzear/forge/commit/8228579) feat: update eslint config

## 4.4.3

`@lzear/configs/changelog` no longer hardcodes forge's own repo — repo URL is read from the consumer's root `package.json.repository`, and the released package's version is looked up by name instead of assuming `packages/forge/package.json`. Commits in generated changelogs are now linked. Any repo can use `"changelog": "@lzear/configs/changelog"` in `.changeset/config.json`.

### Commits

- [`106e661`](https://github.com/lzear/forge/commit/106e661) chore: forge update
- [`01c5480`](https://github.com/lzear/forge/commit/01c5480) feat: dynamic repo url

## 4.4.2

Update dependencies

### Commits

- [`4f54646`](https://github.com/lzear/forge/commit/4f54646) fix: add commit hash links
- [`c3ceece`](https://github.com/lzear/forge/commit/c3ceece) chore: forge update

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
