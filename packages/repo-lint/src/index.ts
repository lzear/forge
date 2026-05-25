import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { hasPublishedPkg, LOCAL_CHECKS, REMOTE_CHECKS } from './checks.js'

export type { Check, CheckDetail, LocalCheck, RemoteCheck } from './checks.js'

export interface CheckResult {
  id: string
  desc: string
  pass: boolean
  detail?: string
}

export interface RepoReport {
  repo: string
  results: CheckResult[]
}

export interface CheckRepoOptions {
  token?: string
  baseDir?: string
  skipRemote?: boolean
}

export interface CheckLocalOptions {
  dir?: string
  skipRemote?: boolean
  repo?: string
}

export const checkLocal = async (
  options: CheckLocalOptions = {},
): Promise<RepoReport> => {
  const { dir = process.cwd(), skipRemote = false } = options

  const repo =
    options.repo ??
    (() => {
      try {
        const remote = execSync('git remote get-url origin', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
        const match = /github\.com[:/](.+?)(?:\.git)?$/.exec(remote)
        return match?.[1] ?? path.basename(dir)
      } catch {
        return dir
      }
    })()

  const published = hasPublishedPkg(dir)

  const localResults = await Promise.all(
    LOCAL_CHECKS.filter((c) => !c.publishedOnly || published).map(async (c) => {
      const raw = await c.check(dir)
      return typeof raw === 'boolean'
        ? { id: c.id, desc: c.desc, pass: raw }
        : { id: c.id, desc: c.desc, ...raw }
    }),
  )

  const remoteResults = skipRemote
    ? []
    : REMOTE_CHECKS.filter((c) => !c.publishedOnly || published).map((c) => ({
        id: c.id,
        desc: c.desc,
        pass: c.check(repo),
      }))

  return { repo, results: [...localResults, ...remoteResults] }
}

export const checkRepo = async (
  repo: string,
  options: CheckRepoOptions = {},
): Promise<RepoReport> => {
  const {
    token,
    baseDir = path.join(tmpdir(), 'repo-lint'),
    skipRemote = false,
  } = options
  const dir = path.join(baseDir, repo.replace('/', '__'))

  if (existsSync(dir))
    execSync(`git -C ${dir} pull --quiet`, { stdio: 'ignore' })
  else {
    const url = token
      ? `https://${token}@github.com/${repo}.git`
      : `https://github.com/${repo}.git`
    execSync(`git clone --depth 1 --quiet ${url} ${dir}`, { stdio: 'ignore' })
  }

  const localResults = await Promise.all(
    LOCAL_CHECKS.map(async (c) => {
      const raw = await c.check(dir)
      return typeof raw === 'boolean'
        ? { id: c.id, desc: c.desc, pass: raw }
        : { id: c.id, desc: c.desc, ...raw }
    }),
  )

  const remoteResults = skipRemote
    ? []
    : REMOTE_CHECKS.map((c) => ({
        id: c.id,
        desc: c.desc,
        pass: c.check(repo),
      }))

  return { repo, results: [...localResults, ...remoteResults] }
}

export { CHECKS, LOCAL_CHECKS, REMOTE_CHECKS } from './checks.js'
