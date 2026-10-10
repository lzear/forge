import { execFileSync } from 'node:child_process'

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
Reads `owner/repo` from the GitHub `origin` remote of `dir`.
*/
export const detectRepo = (dir: string = process.cwd()): string | undefined => {
  const remote = git(dir, 'remote', 'get-url', 'origin')
  return remote && /github\.com[:/](.+?)(?:\.git)?$/.exec(remote)?.[1]
}

/**
The git author name configured for `dir`.
*/
export const gitUsername = (dir: string): string | undefined =>
  git(dir, 'config', 'user.name')
