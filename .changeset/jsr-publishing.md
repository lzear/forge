---
'@lzear/configs': minor
'@lzear/repo-lint': minor
'@lzear/forge': minor
---

Publish to JSR alongside npm

`@lzear/configs`, `@lzear/repo-lint` and `@lzear/forge` are now a Deno workspace
(`deno.json` per package) published by a single `deno publish` in the release
job. Those `deno.json` files are generated: `@lzear/configs` gains a
`lzear-sync-jsr` bin that derives name, version, license, exports and published
files from each `package.json` and its tsup entries, run by `changeset version`
and verified by `yarn qa` with `--check`. A package opts into JSR by having a
`deno.json` at all. `@lzear/repo-lint` gains a `jsr-config` check that fails
when a `deno.json` name or version drifts from its `package.json`.

`@lzear/eslint-config` stays npm-only: the untyped ESLint plugins it wraps rely
on ambient `declare module` shims that JSR cannot resolve.
