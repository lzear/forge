import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { run as ncuRun } from 'npm-check-updates'
import { publint } from 'publint'
import { maxSatisfying, satisfies } from 'semver'
import { detectPackageManager, type PackageManager } from './update.js'

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

const readPackage = (dir: string): Record<string, unknown> | null => {
  const f = path.join(dir, 'package.json')
  if (!existsSync(f)) return null
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

const getWorkspacePatterns = (package_: Record<string, unknown>): string[] => {
  const ws = package_.workspaces
  if (Array.isArray(ws)) return ws as string[]
  const wsPackage = ws as Record<string, unknown> | undefined
  if (Array.isArray(wsPackage?.packages)) return wsPackage.packages as string[]
  return []
}

const patternToBase = (rootDir: string, pattern: string): string | null => {
  const parts = pattern.split('/')
  if (parts.length === 2 && parts[1] === '*')
    return path.join(rootDir, parts[0] ?? '')
  if (parts.length === 1 && parts[0] === '*') return rootDir
  return null
}

const getWorkspaceDirectories = (rootDir: string): string[] => {
  const package_ = readPackage(rootDir)
  if (!package_) return []
  const directories: string[] = []
  for (const pattern of getWorkspacePatterns(package_)) {
    const base = patternToBase(rootDir, pattern)
    if (!base || !existsSync(base)) continue
    const entries = readdirSync(base, { withFileTypes: true })
    for (const entry of entries)
      if (entry.isDirectory()) directories.push(path.join(base, entry.name))
  }
  return directories
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

const eachPublishedPackage = async (
  dir: string,
  function_: (pkgDir: string) => CheckDetail | Promise<CheckDetail>,
): Promise<CheckDetail> => {
  const package_ = readPackage(dir)
  if (!package_) return { pass: true }
  if (package_.private === true) {
    const wsDirectories = getWorkspaceDirectories(dir)
    if (wsDirectories.length === 0) return { pass: true }
    const results = await Promise.all(
      wsDirectories.map((d) => eachPublishedPackage(d, function_)),
    )
    const failures = results.filter((r) => !r.pass)
    if (failures.length === 0) return { pass: true }
    const detail = failures
      .flatMap((r) => (r.detail ? [r.detail] : []))
      .join('\n')
    return { pass: false, ...(detail && { detail }) }
  }
  return function_(dir)
}

export const hasPublishedPkg = (dir: string): boolean => {
  const package_ = readPackage(dir)
  if (!package_) return false
  if (package_.private !== true) return true
  return getWorkspaceDirectories(dir).some((d) => hasPublishedPkg(d))
}

const readmeIncludes = (dir: string, needle: string): boolean => {
  const f = path.join(dir, 'README.md')
  return existsSync(f) && readFileSync(f, 'utf8').includes(needle)
}

const auditCommand = (pm: PackageManager): [string, ...string[]] => {
  switch (pm.name) {
    case 'npm':
      return ['npm', 'audit', '--omit', 'dev', '--audit-level', 'high']
    case 'pnpm':
      return ['pnpm', 'audit', '--prod', '--audit-level', 'high']
    case 'bun':
      return ['bun', 'audit']
    case 'yarn':
      return pm.version?.startsWith('1.')
        ? ['yarn', 'audit', '--level', 'high']
        : [
            'yarn',
            'npm',
            'audit',
            '--environment',
            'production',
            '--severity',
            'high',
          ]
  }
}

const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const

// Ranges that don't resolve against the npm registry
const NON_REGISTRY_RANGE_RE =
  /^(?:workspace:|file:|link:|portal:|catalog:|git|https?:)/

const collectEntry = (
  dependencies: Map<string, string>,
  name: string,
  range: unknown,
): void => {
  if (typeof range !== 'string' || NON_REGISTRY_RANGE_RE.test(range)) return
  // npm alias: "foo": "npm:real-pkg@^1"
  const alias = /^npm:(.+)@([^@]+)$/.exec(range)
  const target = alias?.[1] ?? name
  const targetRange = alias?.[2] ?? range
  if (!dependencies.has(target)) dependencies.set(target, targetRange)
}

const collectFromPackage = (
  dependencies: Map<string, string>,
  packageDir: string,
): void => {
  const package_ = readPackage(packageDir)
  for (const field of DEP_FIELDS) {
    const section = package_?.[field]
    if (typeof section !== 'object' || section === null) continue
    for (const [name, range] of Object.entries(section))
      collectEntry(dependencies, name, range)
  }
}

const collectDependencies = (dir: string): Map<string, string> => {
  const dependencies = new Map<string, string>()
  for (const packageDir of [dir, ...getWorkspaceDirectories(dir)])
    collectFromPackage(dependencies, packageDir)
  return dependencies
}

const findDeprecated = async (
  name: string,
  range: string,
): Promise<string | null> => {
  const response = await fetch(
    `https://registry.npmjs.org/${name.replace('/', '%2F')}`,
    {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = (await response.json()) as {
    versions: Record<string, { deprecated?: string }>
    'dist-tags'?: Record<string, string>
  }
  // Prefer the `latest` dist-tag when it satisfies the range — strict semver
  // maxSatisfying can pick a junk prerelease no package manager would install.
  const latest = data['dist-tags']?.latest
  const resolved =
    latest && satisfies(latest, range)
      ? latest
      : maxSatisfying(Object.keys(data.versions), range)
  if (!resolved) return null
  const deprecated = data.versions[resolved]?.deprecated
  return deprecated ? `${name}@${resolved} — ${deprecated.slice(0, 120)}` : null
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
      eachPublishedPackage(dir, async (pkgDir) => {
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
      return eachPublishedPackage(dir, (pkgDir) => {
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
    id: 'deps-audit',
    desc: 'no known vulnerabilities (audit)',
    type: 'local',
    check: (dir) => {
      const pm = detectPackageManager(dir)
      const [command, ...arguments_] = auditCommand(pm)
      const r = spawnSync(command, arguments_, {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      if (r.error) return { pass: false, detail: String(r.error) }
      if (r.status === 0) return true
      const detail = (r.stdout + r.stderr)
        .trim()
        .split('\n')
        .slice(0, 20)
        .join('\n')
      return { pass: false, detail: detail || `audit exited ${r.status}` }
    },
  },
  {
    id: 'deps-deprecated',
    desc: 'no deprecated dependencies',
    type: 'local',
    check: async (dir) => {
      const dependencies = collectDependencies(dir)
      const failures: string[] = []
      await Promise.all(
        [...dependencies].map(async ([name, range]) => {
          try {
            const deprecated = await findDeprecated(name, range)
            if (deprecated) failures.push(deprecated)
          } catch (error) {
            failures.push(`${name} — check failed: ${String(error)}`)
          }
        }),
      )
      if (failures.length === 0) return true
      return {
        pass: false,
        detail: failures.toSorted((a, b) => a.localeCompare(b)).join('\n'),
      }
    },
  },
  {
    id: 'deps-fresh',
    desc: 'dependencies up to date (ncu)',
    type: 'local',
    check: async (dir) => {
      const package_ = readPackage(dir)
      const hasWorkspaces =
        Array.isArray(package_?.workspaces) &&
        (package_.workspaces as unknown[]).length > 0
      try {
        const result = (await ncuRun({
          packageFile: path.join(dir, 'package.json'),
          ...(hasWorkspaces && { workspaces: true }),
          silent: true,
        })) as Record<string, string> | Record<string, Record<string, string>>

        const entries = hasWorkspaces
          ? Object.values(
              result as Record<string, Record<string, string>>,
            ).flatMap((x) => Object.entries(x))
          : Object.entries(result as Record<string, string>)

        if (entries.length === 0) return true
        const lines = entries.map(([k, v]) => `${k}  →  ${v}`).join('\n')
        return { pass: false, detail: `${lines}\n\nRun: forge update` }
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
