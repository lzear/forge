import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { run as ncuRun } from 'npm-check-updates'
import { publint } from 'publint'

const _dirname = path.dirname(fileURLToPath(import.meta.url))

export interface CheckDetail {
  pass: boolean
  detail?: string
}
type CheckResult = boolean | CheckDetail | Promise<boolean | CheckDetail>

export interface LocalCheck {
  id: string
  desc: string
  type: 'local'
  publishedOnly?: boolean
  check: (dir: string) => CheckResult
}

export interface RemoteCheck {
  id: string
  desc: string
  type: 'remote'
  publishedOnly?: boolean
  check: (repo: string) => boolean
}

export type Check = LocalCheck | RemoteCheck

const readPkg = (dir: string): Record<string, unknown> | null => {
  const f = path.join(dir, 'package.json')
  if (!existsSync(f)) return null
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

const getWorkspacePatterns = (pkg: Record<string, unknown>): string[] => {
  const ws = pkg.workspaces
  if (Array.isArray(ws)) return ws as string[]
  const wsPkg = ws as Record<string, unknown> | undefined
  if (Array.isArray(wsPkg?.packages)) return wsPkg.packages as string[]
  return []
}

const patternToBase = (rootDir: string, pattern: string): string | null => {
  const parts = pattern.split('/')
  if (parts.length === 2 && parts[1] === '*')
    return path.join(rootDir, parts[0] ?? '')
  if (parts.length === 1 && parts[0] === '*') return rootDir
  return null
}

const getWorkspaceDirs = (rootDir: string): string[] => {
  const pkg = readPkg(rootDir)
  if (!pkg) return []
  const dirs: string[] = []
  for (const pattern of getWorkspacePatterns(pkg)) {
    const base = patternToBase(rootDir, pattern)
    if (!base || !existsSync(base)) continue
    for (const entry of readdirSync(base, { withFileTypes: true }))
      if (entry.isDirectory()) dirs.push(path.join(base, entry.name))
  }
  return dirs
}

const findBin = (name: string, startDir: string): string | null => {
  let dir = startDir
  while (true) {
    const bin = path.join(dir, 'node_modules', '.bin', name)
    if (existsSync(bin)) return bin
    const parent = path.join(dir, '..')
    if (parent === dir) return null
    dir = parent
  }
}

const eachPublishedPkg = async (
  dir: string,
  fn: (pkgDir: string) => CheckDetail | Promise<CheckDetail>,
): Promise<CheckDetail> => {
  const pkg = readPkg(dir)
  if (!pkg) return { pass: true }
  if (pkg.private === true) {
    const wsDirs = getWorkspaceDirs(dir)
    if (wsDirs.length === 0) return { pass: true }
    const results = await Promise.all(
      wsDirs.map((d) => eachPublishedPkg(d, fn)),
    )
    const failures = results.filter((r) => !r.pass)
    if (failures.length === 0) return { pass: true }
    const detail = failures
      .flatMap((r) => (r.detail ? [r.detail] : []))
      .join('\n')
    return { pass: false, ...(detail && { detail }) }
  }
  return fn(dir)
}

export const hasPublishedPkg = (dir: string): boolean => {
  const pkg = readPkg(dir)
  if (!pkg) return false
  if (pkg.private !== true) return true
  return getWorkspaceDirs(dir).some((d) => hasPublishedPkg(d))
}

const readmeIncludes = (dir: string, needle: string): boolean => {
  const f = path.join(dir, 'README.md')
  return existsSync(f) && readFileSync(f, 'utf8').includes(needle)
}

export const LOCAL_CHECKS: LocalCheck[] = [
  {
    id: 'readme-exists',
    desc: 'README.md exists',
    type: 'local',
    check: (dir) => existsSync(path.join(dir, 'README.md')),
  },
  {
    id: 'readme-codacy-grade-badge',
    desc: 'README has Codacy grade badge',
    type: 'local',
    publishedOnly: true,
    check: (dir) => readmeIncludes(dir, 'project/badge/Grade/'),
  },
  {
    id: 'readme-codacy-coverage-badge',
    desc: 'README has Codacy coverage badge',
    type: 'local',
    publishedOnly: true,
    check: (dir) => readmeIncludes(dir, 'project/badge/Coverage/'),
  },
  {
    id: 'readme-npm-badge',
    desc: 'README has npm badge',
    type: 'local',
    publishedOnly: true,
    check: (dir) => readmeIncludes(dir, 'shields.io/npm/v/'),
  },
  {
    id: 'codacy-config',
    desc: '.codacy.yml exists',
    type: 'local',
    publishedOnly: true,
    check: (dir) => existsSync(path.join(dir, '.codacy.yml')),
  },
  {
    id: 'license',
    desc: 'LICENSE exists',
    type: 'local',
    publishedOnly: true,
    check: (dir) => existsSync(path.join(dir, 'LICENSE')),
  },
  {
    id: 'ci-workflow',
    desc: 'CI workflow exists',
    type: 'local',
    publishedOnly: true,
    check: (dir) => existsSync(path.join(dir, '.github/workflows/ci.yml')),
  },
  {
    id: 'renovate',
    desc: 'renovate.json exists',
    type: 'local',
    check: (dir) => existsSync(path.join(dir, 'renovate.json')),
  },
  {
    id: 'pkg-publint',
    desc: 'publint (all published packages)',
    type: 'local',
    publishedOnly: true,
    check: (dir) =>
      eachPublishedPkg(dir, async (pkgDir) => {
        const { messages } = await publint({ pkgDir })
        const failures = messages.filter(
          (m) => m.type === 'error' || m.type === 'warning',
        )
        if (failures.length === 0) return { pass: true }
        return {
          pass: false,
          detail: failures.map((m) => `[${m.type}] ${m.code}`).join('\n'),
        }
      }),
  },
  {
    id: 'pkg-attw',
    desc: 'attw (all published packages)',
    type: 'local',
    check: (dir) => {
      const bin = findBin('attw', _dirname)
      if (!bin) return { pass: false, detail: 'attw not available' }
      return eachPublishedPkg(dir, (pkgDir) => {
        const r = spawnSync(
          process.execPath,
          [bin, '--pack', '--profile', 'esm-only'],
          {
            cwd: pkgDir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        )
        if (r.status === 0) return { pass: true }
        return { pass: false, detail: (r.stdout + r.stderr).trim() }
      })
    },
  },
  {
    id: 'pkg-knip',
    desc: 'knip (no unused exports/deps)',
    type: 'local',
    check: (dir) => {
      const bin = findBin('knip', _dirname)
      if (!bin) return { pass: false, detail: 'knip not available' }
      const r = spawnSync(process.execPath, [bin], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1' },
      })
      if (r.status === 0) return { pass: true }
      const detail = (r.stdout + r.stderr).trim()
      return { pass: false, detail: `${detail}\n\nRun: npx knip` }
    },
  },
  {
    id: 'deps-fresh',
    desc: 'dependencies up to date (ncu)',
    type: 'local',
    check: async (dir) => {
      const pkg = readPkg(dir)
      const hasWorkspaces =
        Array.isArray(pkg?.workspaces) &&
        (pkg.workspaces as unknown[]).length > 0
      try {
        const result = (await ncuRun({
          packageFile: path.join(dir, 'package.json'),
          ...(hasWorkspaces ? { workspaces: true } : {}),
          silent: true,
        })) as Record<string, string> | Record<string, Record<string, string>>

        const entries = hasWorkspaces
          ? Object.values(
              result as Record<string, Record<string, string>>,
            ).flatMap((x) => Object.entries(x))
          : Object.entries(result as Record<string, string>)

        if (entries.length === 0) return true
        const lines = entries.map(([k, v]) => `${k}  →  ${v}`).join('\n')
        const cmd = hasWorkspaces
          ? 'yarn dlx npm-check-updates --dep dev,optional,peer,prod,packageManager -u --workspaces && yarn install'
          : 'yarn dlx npm-check-updates --dep dev,optional,peer,prod,packageManager -u && yarn install'
        return { pass: false, detail: `${lines}\n\nRun: ${cmd}` }
      } catch (error) {
        return { pass: false, detail: String(error) }
      }
    },
  },
]

const listSecrets = (repo: string): string[] | null => {
  try {
    const result = spawnSync(
      'gh',
      ['secret', 'list', '--repo', repo, '--json', 'name'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    if (result.status !== 0) return null
    return (JSON.parse(result.stdout) as { name: string }[]).map((s) => s.name)
  } catch {
    return null
  }
}

export const REMOTE_CHECKS: RemoteCheck[] = [
  {
    id: 'secret-npm-token',
    desc: 'Secret NPM_TOKEN set',
    type: 'remote',
    publishedOnly: true,
    check: (repo) => {
      const secrets = listSecrets(repo)
      return secrets?.includes('NPM_TOKEN') ?? false
    },
  },
  {
    id: 'secret-codacy-token',
    desc: 'Secret CODACY_PROJECT_TOKEN set',
    type: 'remote',
    publishedOnly: true,
    check: (repo) => {
      const secrets = listSecrets(repo)
      return secrets?.includes('CODACY_PROJECT_TOKEN') ?? false
    },
  },
]

export const CHECKS: Check[] = [...LOCAL_CHECKS, ...REMOTE_CHECKS]
