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

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import {
  type Check,
  CHECKS,
  hasPublishedPkg as hasPublishedPackage,
  LOCAL_CHECKS,
  REMOTE_CHECKS,
} from './checks.ts'
import { readPackage } from './update.ts'

export type { Check, CheckDetail, LocalCheck, RemoteCheck } from './checks.ts'

/**
Outcome of one check.
*/
export type CheckResult = {
  id: string
  desc: string
  pass: boolean
  detail?: string
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
  const errors = Object.entries(skip).flatMap(([id, reason]) => [
    ...(unknownIds([id]).length > 0
      ? [`skip.${id}: unknown check (${validIds()})`]
      : []),
    ...(typeof reason === 'string' && reason.trim()
      ? []
      : [`skip.${id}: reason required`]),
  ])
  const result: CheckResult =
    errors.length > 0
      ? { ...CONFIG_CHECK, pass: false, detail: errors.join('\n') }
      : { ...CONFIG_CHECK, pass: true }
  return {
    skip: errors.length > 0 ? {} : (skip as Record<string, string>),
    result,
  }
}

const runChecks = async (
  dir: string,
  repo: string,
  skipRemote: boolean,
  isApplicable: (c: Check) => boolean,
): Promise<CheckResult[]> => {
  const localResults = await Promise.all(
    LOCAL_CHECKS.filter((c) => isApplicable(c)).map(async (c) => {
      const raw = await c.check(dir)
      return typeof raw === 'boolean'
        ? { id: c.id, desc: c.desc, pass: raw }
        : { id: c.id, desc: c.desc, ...raw }
    }),
  )

  const remoteResults = skipRemote
    ? []
    : REMOTE_CHECKS.filter((c) => isApplicable(c)).map((c) => ({
        id: c.id,
        desc: c.desc,
        pass: c.check(repo),
      }))

  return [...localResults, ...remoteResults]
}

/**
Reads `owner/repo` from the GitHub `origin` remote of `dir`.
*/
export const detectRepo = (dir: string = process.cwd()): string | undefined => {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return /github\.com[:/](.+?)(?:\.git)?$/.exec(remote)?.[1]
  } catch {
    return undefined
  }
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
}

/**
Runs the checks against a local checkout. Package-quality checks only run
when the repo publishes a package. The root `package.json`'s `forge` field
({@linkcode ForgeConfig}) skips checks; when present, a `forge-config` result
validates it.

@param options `dir` defaults to the cwd, `repo` to the `origin` remote
@throws on an unknown id in `only` or `skip`
*/
export const checkLocal = async (
  options: CheckLocalOptions = {},
): Promise<RepoReport> => {
  const { dir = process.cwd(), skipRemote = false, only, skip = [] } = options
  const unknown = unknownIds([...(only ?? []), ...skip])
  if (unknown.length > 0)
    throw new Error(`Unknown check: ${unknown.join(', ')} (${validIds()})`)

  const repo = options.repo ?? detectRepo(dir) ?? path.basename(dir)
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
  const results = await runChecks(
    dir,
    repo,
    skipRemote,
    (c) => isApplicable(c) && !reasons.has(c.id),
  )
  const skipped = CHECKS.filter(
    (c) => isApplicable(c) && reasons.has(c.id),
  ).map((c) => ({ id: c.id, desc: c.desc, skipped: reasons.get(c.id) ?? '' }))
  return {
    repo,
    results: config.result ? [config.result, ...results] : results,
    skipped,
  }
}

export { CHECKS, listSecrets, LOCAL_CHECKS, REMOTE_CHECKS } from './checks.ts'
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
} from './update.ts'
export { detectPackageManager, runUpdate } from './update.ts'
