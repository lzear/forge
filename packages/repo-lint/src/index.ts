/**
 * Repo compliance checks (local files, CI, badges, package quality) and
 * dependency updates.
 *
 * ```ts
 * import { checkLocal } from '@lzear/repo-lint'
 *
 * const { results } = await checkLocal({ skipRemote: true })
 * for (const r of results) console.log(r.pass ? '✓' : '✗', r.desc)
 * ```
 *
 * @module
 */

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import {
  type Check,
  hasPublishedPkg as hasPublishedPackage,
  LOCAL_CHECKS,
  REMOTE_CHECKS,
} from './checks.ts'

export type { Check, CheckDetail, LocalCheck, RemoteCheck } from './checks.ts'

/**
 * Outcome of one check.
 */
export interface CheckResult {
  id: string
  desc: string
  pass: boolean
  detail?: string
}

/**
 * All check results for one repo.
 */
export interface RepoReport {
  repo: string
  results: CheckResult[]
}

const runChecks = async (
  dir: string,
  repo: string,
  skipRemote: boolean,
  isApplicable: (c: Check) => boolean,
): Promise<RepoReport> => {
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

  return { repo, results: [...localResults, ...remoteResults] }
}

/**
 * Reads `owner/repo` from the GitHub `origin` remote of `dir`.
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
 * Options for {@linkcode checkLocal}.
 */
export interface CheckLocalOptions {
  dir?: string
  skipRemote?: boolean
  repo?: string
}

/**
 * Runs the checks against a local checkout. Package-quality checks only run
 * when the repo publishes a package.
 *
 * @param options `dir` defaults to the cwd, `repo` to the `origin` remote
 */
export const checkLocal = async (
  options: CheckLocalOptions = {},
): Promise<RepoReport> => {
  const { dir = process.cwd(), skipRemote = false } = options

  const repo = options.repo ?? detectRepo(dir) ?? path.basename(dir)
  const isPublished = hasPublishedPackage(dir)
  return runChecks(
    dir,
    repo,
    skipRemote,
    (c) => !c.publishedOnly || isPublished,
  )
}

export { CHECKS, listSecrets, LOCAL_CHECKS, REMOTE_CHECKS } from './checks.ts'
export type {
  PackageManager,
  PackageManagerName,
  UpdateOptions,
  UpdateReport,
  UpdateResult,
} from './update.ts'
export { detectPackageManager, runUpdate } from './update.ts'
