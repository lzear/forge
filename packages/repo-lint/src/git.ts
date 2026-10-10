import { execFileSync } from 'node:child_process'
import { readPackage } from './update.ts'

// a git command's trimmed output, or undefined when it fails
const git = (dir: string, ...arguments_: string[]): string | undefined => {
  try {
    return execFileSync('git', arguments_, {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return undefined
  }
}

/**
`value` is a GitHub `owner/name`.
*/
export const isRepo = (value: unknown): value is string =>
  typeof value === 'string' && /^[\w.-]+\/[\w.-]+$/.test(value)

// the root package.json's `forge.repo`, when valid
const configuredRepo = (dir: string): string | undefined => {
  const forge = readPackage(dir)?.forge
  const repo = (forge as { repo?: unknown } | undefined)?.repo
  return isRepo(repo) ? repo : undefined
}

/**
The GitHub `owner/repo` of `dir`: the root `package.json`'s `forge.repo`, else
read from the `origin` remote.
*/
export const detectRepo = (dir: string = process.cwd()): string | undefined => {
  const configured = configuredRepo(dir)
  if (configured) return configured
  const remote = git(dir, 'remote', 'get-url', 'origin')
  return remote && /github\.com[:/](.+?)(?:\.git)?$/.exec(remote)?.[1]
}

/**
The git author name configured for `dir`.
*/
export const gitUsername = (dir: string): string | undefined =>
  git(dir, 'config', 'user.name')
