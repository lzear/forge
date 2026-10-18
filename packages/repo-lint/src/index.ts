/**
Repo compliance checks (local files, CI, badges, package quality),
dependency updates and template sync.

```ts
import { checkLocal } from '@lzear/repo-lint'

const { results } = await checkLocal({ skipRemote: true })
for (const r of results) console.log(r.pass ? '✓' : '✗', r.desc)
```

@module
*/

import path from 'node:path'
import {
  type Check,
  type CheckDetail,
  CHECKS,
  ghProblem,
  LOCAL_CHECKS,
  REMOTE_CHECKS,
} from './checks.ts'
import { detectRepo, isRepo } from './git.ts'
import { hasPublishedPkg as hasPublishedPackage } from './templates.ts'
import { readPackage } from './update.ts'

export type {
  Check,
  CheckDetail,
  ForgeRelease,
  LocalCheck,
  RemoteCheck,
} from './checks.ts'

/**
Outcome of one check.
*/
export type CheckResult = {
  id: string
  desc: string
  pass: boolean
  detail?: string
  /**
  a drift check's result: fails on time, not on the tree
  */
  drift?: true
}

/**
A check left out, with the reason.
*/
export type SkippedCheck = {
  id: string
  desc: string
  skipped: string
}

/**
All check results for one repo.
*/
export type RepoReport = {
  repo: string
  results: CheckResult[]
  skipped: SkippedCheck[]
  /**
  every result passed, drift aside unless `strict`
  */
  pass: boolean
  /**
  with `fix`: each fix run, `detail` being what it changed or why it failed
  */
  fixed?: CheckResult[]
}

/**
The `forge` field of the root `package.json`.

```json
{ "forge": { "skip": { "pkg-attw": "a Bun app, not a library" } } }
```
*/
export type ForgeConfig = {
  /**
  check id → why this repo skips it
  */
  skip?: Record<string, string>
  /**
  `owner/name` of the GitHub repo, when `origin` points elsewhere
  */
  repo?: string
}

const CONFIG_CHECK = {
  id: 'forge-config',
  desc: '`forge` field in package.json is valid',
}

const unknownIds = (ids: string[]): string[] =>
  ids.filter((id) => CHECKS.every((c) => c.id !== id))

const validIds = (): string => `valid: ${CHECKS.map((c) => c.id).join(', ')}`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// the skips a valid `forge` field asks for, and its check result if present
const readConfig = (
  dir: string,
): { skip: Record<string, string>; result?: CheckResult } => {
  const config = readPackage(dir)?.forge
  if (config === undefined) return { skip: {} }
  const skip = isRecord(config) ? (config.skip ?? {}) : undefined
  if (!isRecord(skip))
    return {
      skip: {},
      result: {
        ...CONFIG_CHECK,
        pass: false,
        detail: 'expected { "skip": { "<check id>": "<reason>" } }',
      },
    }
  const repo = isRecord(config) ? config.repo : undefined
  const errors = [
    ...(repo === undefined || isRepo(repo)
      ? []
      : ['repo: expected "<owner>/<name>"']),
    ...Object.entries(skip).flatMap(([id, reason]) => [
      ...(unknownIds([id]).length > 0
        ? [`skip.${id}: unknown check (${validIds()})`]
        : []),
      ...(typeof reason === 'string' && reason.trim()
        ? []
        : [`skip.${id}: reason required`]),
    ]),
  ]
  const result: CheckResult =
    errors.length > 0
      ? { ...CONFIG_CHECK, pass: false, detail: errors.join('\n') }
      : { ...CONFIG_CHECK, pass: true }
  return {
    skip: errors.length > 0 ? {} : (skip as Record<string, string>),
    result,
  }
}

const GH_CHECK = { id: 'gh', desc: 'gh CLI for remote checks' }
const NO_REPO = 'no GitHub repo: set forge.repo or a github.com origin'

const label = (c: Check): Pick<CheckResult, 'id' | 'desc' | 'drift'> => ({
  id: c.id,
  desc: c.desc,
  ...(c.drift && { drift: true }),
})

const toResult = (c: Check, raw: boolean | CheckDetail): CheckResult =>
  typeof raw === 'boolean'
    ? { ...label(c), pass: raw }
    : { ...label(c), ...raw }

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

// a check that throws fails alone, not the whole run
const settle = async (
  c: Check,
  check: () => ReturnType<Check['check']>,
): Promise<CheckResult> => {
  try {
    return toResult(c, await check())
  } catch (error) {
    return { ...label(c), pass: false, detail: errorMessage(error) }
  }
}

// one failing result when `gh` can't run them, rather than one per check:
// drift when only drift checks needed it
const runRemoteChecks = async (
  dir: string,
  repo: string | undefined,
  isApplicable: (c: Check) => boolean,
): Promise<CheckResult[]> => {
  const checks = REMOTE_CHECKS.filter((c) => isApplicable(c))
  if (checks.length === 0) return []
  const gh: CheckResult = {
    ...GH_CHECK,
    pass: false,
    ...(checks.every((c) => c.drift) && { drift: true }),
  }
  if (!repo) return [{ ...gh, detail: NO_REPO }]
  const problem = await ghProblem(dir)
  return problem
    ? [{ ...gh, detail: problem }]
    : Promise.all(checks.map((c) => settle(c, () => c.check(repo, dir))))
}

const runChecks = async (
  dir: string,
  repo: string | undefined,
  isApplicable: (c: Check) => boolean,
): Promise<CheckResult[]> => {
  const [localResults, remoteResults] = await Promise.all([
    Promise.all(
      LOCAL_CHECKS.filter((c) => isApplicable(c)).map((c) =>
        settle(c, () => c.check(dir)),
      ),
    ),
    runRemoteChecks(dir, repo, isApplicable),
  ])
  return [...localResults, ...remoteResults]
}

// fixes the failures one by one, in check order: some share files
const runFixes = async (
  dir: string,
  results: CheckResult[],
): Promise<CheckResult[]> => {
  const fixed: CheckResult[] = []
  for (const c of LOCAL_CHECKS) {
    if (!c.fix || results.every((r) => r.id !== c.id || r.pass)) continue
    try {
      const detail = await c.fix(dir)
      fixed.push({ ...label(c), pass: true, ...(detail && { detail }) })
    } catch (error) {
      fixed.push({ ...label(c), pass: false, detail: errorMessage(error) })
    }
  }
  return fixed
}

/**
Options for {@linkcode checkLocal}.
*/
export type CheckLocalOptions = {
  dir?: string
  skipRemote?: boolean
  repo?: string
  /**
  run only these check ids
  */
  only?: string[]
  /**
  skip these check ids, on top of the config's
  */
  skip?: string[]
  /**
  run the failing checks' fixes, then every check again
  */
  fix?: boolean
  /**
  fail `pass` on drift checks too
  */
  strict?: boolean
}

/**
Runs the checks against a local checkout. Package-quality checks only run
when the repo publishes a package. The root `package.json`'s `forge` field
({@linkcode ForgeConfig}) skips checks; when present, a `forge-config` result
validates it.

With `fix`, failing checks that have a fix run it, then every check runs
again; `fixed` lists the fixes.

Drift checks (`drift: true`: new releases, advisories) fail on time, not on
the tree: `pass` ignores them unless `strict`.

@param options `dir` defaults to the cwd, `repo` to the `origin` remote
@throws on an unknown id in `only` or `skip`
*/
export const checkLocal = async (
  options: CheckLocalOptions = {},
): Promise<RepoReport> => {
  const {
    dir = process.cwd(),
    skipRemote = false,
    only,
    skip = [],
    fix: isFix = false,
    strict: isStrict = false,
  } = options
  const unknown = unknownIds([...(only ?? []), ...skip])
  if (unknown.length > 0)
    throw new Error(`Unknown check: ${unknown.join(', ')} (${validIds()})`)

  const gitHubRepo = options.repo ?? detectRepo(dir)
  const repo = gitHubRepo ?? path.basename(dir)
  const config = readConfig(dir)
  const reasons = new Map([
    ...Object.entries(config.skip),
    ...skip.map((id) => [id, '--skip'] as const),
  ])
  const isPublished = hasPublishedPackage(dir)
  const isApplicable = (c: Check): boolean =>
    (!c.publishedOnly || isPublished) &&
    (!only || only.includes(c.id)) &&
    (!skipRemote || c.type !== 'remote')
  const check = (): Promise<CheckResult[]> =>
    runChecks(dir, gitHubRepo, (c) => isApplicable(c) && !reasons.has(c.id))
  let results = await check()
  const fixed = isFix ? await runFixes(dir, results) : []
  if (fixed.length > 0) results = await check()
  const skipped = CHECKS.filter(
    (c) => isApplicable(c) && reasons.has(c.id),
  ).map((c) => ({ id: c.id, desc: c.desc, skipped: reasons.get(c.id) ?? '' }))
  if (config.result) results = [config.result, ...results]
  return {
    repo,
    results,
    skipped,
    pass: results.every((r) => r.pass || (r.drift && !isStrict)),
    ...(isFix && { fixed }),
  }
}

export {
  CHECKS,
  latestForgeRelease,
  LOCAL_CHECKS,
  REMOTE_CHECKS,
} from './checks.ts'
export { detectRepo } from './git.ts'
export type { InitOptions, InitReport, InitResult } from './init.ts'
export { initRepo } from './init.ts'
export type {
  SyncOptions,
  SyncReport,
  SyncResult,
  SyncStatus,
} from './templates.ts'
export { syncTemplates } from './templates.ts'
export type {
  PackageManager,
  PackageManagerName,
  UpdateOptions,
  UpdateReport,
  UpdateResult,
  UpdateStepId,
} from './update.ts'
export { detectPackageManager, runUpdate, UPDATE_STEPS } from './update.ts'
