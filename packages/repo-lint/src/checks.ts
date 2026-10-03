import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { publint } from 'publint'
import { maxSatisfying, satisfies } from 'semver'
import {
  detectPackageManager,
  getWorkspacePatterns,
  MIN_RELEASE_AGE_DAYS,
  type PackageManager,
  type PackageManagerName,
  readPackage,
  stepDeps,
} from './update.ts'

const _dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * A check result carrying an explanation.
 */
export interface CheckDetail {
  pass: boolean
  detail?: string
}
type CheckResult = boolean | CheckDetail | Promise<boolean | CheckDetail>

/**
 * A check run against a checkout directory.
 */
export interface LocalCheck {
  id: string
  desc: string
  type: 'local'
  publishedOnly?: boolean
  check: (dir: string) => CheckResult
}

/**
 * A check run against a GitHub repo through the `gh` CLI.
 */
export interface RemoteCheck {
  id: string
  desc: string
  type: 'remote'
  publishedOnly?: boolean
  check: (repo: string) => boolean
}

/**
 * Any local or remote check.
 */
export type Check = LocalCheck | RemoteCheck

const patternToBase = (rootDir: string, pattern: string): string | null => {
  const parts = pattern.split('/')
  if (parts.length === 2 && parts[1] === '*')
    return path.join(rootDir, parts[0] ?? '')
  return parts.length === 1 && parts[0] === '*' ? rootDir : null
}

const getWorkspaceDirectories = (rootDir: string): string[] => {
  const package_ = readPackage(rootDir)
  if (!package_) return []
  const directories: string[] = []
  for (const pattern of getWorkspacePatterns(package_)) {
    // a glob-free pattern names the package directory itself
    if (!pattern.includes('*')) {
      const packageDir = path.join(rootDir, pattern)
      if (existsSync(packageDir)) directories.push(packageDir)
      continue
    }
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

const head = (output: string): string =>
  output.trim().split('\n').slice(0, 20).join('\n')

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
  return package_
    ? package_.private !== true ||
        getWorkspaceDirectories(dir).some((d) => hasPublishedPkg(d))
    : false
}

const readmeIncludes = (dir: string, needle: string): boolean => {
  const f = path.join(dir, 'README.md')
  return existsSync(f) && readFileSync(f, 'utf8').includes(needle)
}

const FORGE_WORKFLOW_RE = /uses:\s*lzear\/forge\/\.github\/workflows\/ci\.yml@/
const FORGE_PRESET_RE = /^github>lzear\/forge(?:$|[#:])/

// The forge repo hosts the reusable workflow and calls it locally.
const isForgeRepo = (dir: string): boolean =>
  getWorkspaceDirectories(dir).some(
    (d) => readPackage(d)?.name === '@lzear/forge',
  )

const callsForgeWorkflow = (dir: string): boolean => {
  const wfDir = path.join(dir, '.github', 'workflows')
  return (
    existsSync(wfDir) &&
    readdirSync(wfDir)
      .filter((f) => /\.ya?ml$/.test(f))
      .some((f) =>
        FORGE_WORKFLOW_RE.test(readFileSync(path.join(wfDir, f), 'utf8')),
      )
  )
}

// size-limit's config files; it also reads a `size-limit` package.json field
const SIZE_LIMIT_FILE_RE = /^\.size-limit(?:\.json|\.[cm]?[jt]s)?$/

const hasSizeLimit = (dir: string): boolean =>
  readPackage(dir)?.['size-limit'] !== undefined ||
  readdirSync(dir).some((f) => SIZE_LIMIT_FILE_RE.test(f))

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

// where each package manager sets its minimum release age, in units per day
const RELEASE_AGE: Record<
  PackageManagerName,
  [file: string, key: string, perDay: number]
> = {
  bun: ['bunfig.toml', 'minimumReleaseAge', 86_400],
  npm: ['.npmrc', 'min-release-age', 1],
  pnpm: ['pnpm-workspace.yaml', 'minimumReleaseAge', 1440],
  yarn: ['.yarnrc.yml', 'npmMinimalAgeGate', 1440],
}

// yarn's goes through `yarn config`: it defaults to 1 day and takes `3d`
const releaseAgeDays = (dir: string, pm: PackageManagerName): number => {
  const [file, key, perDay] = RELEASE_AGE[pm]
  if (pm === 'yarn') {
    const r = spawnSync('yarn', ['config', 'get', key], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return (Number(r.stdout) || 0) / perDay
  }
  const f = path.join(dir, file)
  const config = existsSync(f) ? readFileSync(f, 'utf8') : ''
  const value = new RegExp(String.raw`^${key}\s*[=:]\s*(\d+)`, 'm').exec(
    config,
  )?.[1]
  return Number(value ?? 0) / perDay
}

/**
 * Checks run against a checkout directory.
 */
export const LOCAL_CHECKS: LocalCheck[] = [
  {
    id: 'readme-exists',
    desc: 'README',
    type: 'local',
    check: (dir) => existsSync(path.join(dir, 'README.md')),
  },
  {
    id: 'readme-npm-badge',
    desc: 'npm badge',
    type: 'local',
    publishedOnly: true,
    check: (dir) => readmeIncludes(dir, 'shields.io/npm/v/'),
  },
  {
    id: 'codacy',
    desc: 'Codacy',
    type: 'local',
    publishedOnly: true,
    check: (dir) => {
      const missing = [
        readmeIncludes(dir, 'project/badge/Grade/')
          ? null
          : 'grade badge missing in README',
        readmeIncludes(dir, 'project/badge/Coverage/')
          ? null
          : 'coverage badge missing in README',
        existsSync(path.join(dir, '.codacy.yml'))
          ? null
          : '.codacy.yml missing',
      ].filter((m): m is string => m !== null)
      return missing.length === 0 || { pass: false, detail: missing.join('\n') }
    },
  },
  {
    id: 'license',
    desc: 'LICENSE',
    type: 'local',
    publishedOnly: true,
    check: (dir) => existsSync(path.join(dir, 'LICENSE')),
  },
  {
    id: 'jsr-config',
    desc: 'deno.json in sync',
    type: 'local',
    publishedOnly: true,
    check: (dir) =>
      eachPublishedPackage(dir, (pkgDir) => {
        const denoPath = path.join(pkgDir, 'deno.json')
        if (!existsSync(denoPath)) return { pass: true }
        const package_ = readPackage(pkgDir)
        let deno: { name?: string; version?: string }
        try {
          deno = JSON.parse(readFileSync(denoPath, 'utf8')) as typeof deno
        } catch {
          return { pass: false, detail: 'deno.json is not valid JSON' }
        }
        const mismatches = [
          deno.name === package_?.name
            ? null
            : `name ${deno.name} does not match package.json`,
          deno.version === package_?.version
            ? null
            : `version ${deno.version} != ${package_?.version as string}`,
        ].filter((m): m is string => m !== null)
        return mismatches.length === 0
          ? { pass: true }
          : { pass: false, detail: mismatches.join('\n') }
      }),
  },
  {
    id: 'ci-workflow',
    desc: 'CI calls forge workflow',
    type: 'local',
    check: (dir) => {
      if (callsForgeWorkflow(dir) || isForgeRepo(dir)) return true
      return {
        pass: false,
        detail:
          'no workflow calls the forge reusable CI — replace the local ci.yml copy with:\n' +
          '  jobs:\n' +
          '    ci:\n' +
          '      uses: lzear/forge/.github/workflows/ci.yml@<sha> # vX.Y.Z\n' +
          '(pin to a commit SHA; renovate keeps it fresh)',
      }
    },
  },
  {
    id: 'renovate',
    desc: 'renovate extends forge',
    type: 'local',
    check: (dir) => {
      const file = path.join(dir, 'renovate.json')
      if (!existsSync(file)) return false
      let config: { extends?: string[] }
      try {
        config = JSON.parse(readFileSync(file, 'utf8')) as typeof config
      } catch {
        return { pass: false, detail: 'renovate.json is not valid JSON' }
      }
      return (
        config.extends?.some((p) => FORGE_PRESET_RE.test(p)) === true || {
          pass: false,
          detail: 'add "github>lzear/forge" to renovate.json extends',
        }
      )
    },
  },
  {
    id: 'pkg-publint',
    desc: 'publint',
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
    desc: 'attw',
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
        return r.status === 0
          ? { pass: true }
          : { pass: false, detail: (r.stdout + r.stderr).trim() }
      })
    },
  },
  {
    id: 'pkg-size-limit',
    desc: 'size-limit',
    type: 'local',
    // the repo's own bin: size-limit loads only plugins its package.json lists
    check: (dir) => {
      const failures = [dir, ...getWorkspaceDirectories(dir)]
        .filter((d) => hasSizeLimit(d))
        .flatMap((d) => {
          const bin = findBin('size-limit', d)
          if (!bin) return [`${d}: size-limit not installed`]
          const r = spawnSync(process.execPath, [bin], {
            cwd: d,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, NO_COLOR: '1' },
          })
          return r.status === 0 ? [] : [head(r.stdout + r.stderr)]
        })
      return (
        failures.length === 0 || { pass: false, detail: failures.join('\n') }
      )
    },
  },
  {
    id: 'pkg-fallow',
    desc: 'fallow',
    type: 'local',
    check: (dir) => {
      const bin = findBin('fallow', _dirname)
      if (!bin) return { pass: false, detail: 'fallow not available' }
      const r = spawnSync(
        process.execPath,
        [bin, 'dead-code', '--format', 'compact'],
        {
          cwd: dir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, NO_COLOR: '1' },
        },
      )
      if (r.status === 0) return { pass: true }
      const detail = (r.stdout + r.stderr).trim()
      return { pass: false, detail: `${detail}\n\nRun: npx fallow dead-code` }
    },
  },
  {
    id: 'monorepo-lint',
    desc: 'sherif (workspaces)',
    type: 'local',
    check: (dir) => {
      const package_ = readPackage(dir)
      if (!package_ || getWorkspacePatterns(package_).length === 0)
        return { pass: true, detail: 'not a monorepo' }
      const bin = findBin('sherif', _dirname)
      if (!bin) return { pass: false, detail: 'sherif not available' }
      const r = spawnSync(process.execPath, [bin], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1' },
      })
      if (r.status === 0) return true
      const detail = head(r.stdout + r.stderr)
      return { pass: false, detail }
    },
  },
  {
    id: 'deps-audit',
    desc: 'audit',
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
      const detail = head(r.stdout + r.stderr)
      return { pass: false, detail: detail || `audit exited ${r.status}` }
    },
  },
  {
    id: 'deps-deprecated',
    desc: 'no deprecated deps',
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
    desc: 'deps up to date',
    type: 'local',
    // the dry run of `forge update`, so .ncurc rejects apply to both
    check: async (dir) => {
      const { pass, changed, detail = '' } = await stepDeps(dir, true)
      return pass
        ? !changed || { pass: false, detail: `${detail}\n\nRun: forge update` }
        : { pass, detail }
    },
  },
  {
    id: 'deps-release-age',
    desc: 'minimum release age',
    type: 'local',
    check: (dir) => {
      const { name, version } = detectPackageManager(dir)
      if (name === 'yarn' && version?.startsWith('1.'))
        return { pass: false, detail: 'Yarn 1 has none; move to Yarn 4' }
      const days = releaseAgeDays(dir, name)
      if (days >= MIN_RELEASE_AGE_DAYS) return true
      const [file, key, perDay] = RELEASE_AGE[name]
      const value = MIN_RELEASE_AGE_DAYS * perDay
      return {
        pass: false,
        detail: `${days} days — set ${key} to ${value} in ${file}`,
      }
    },
  },
]

/**
 * Lists the repo's GitHub Actions secret names, or `null` when `gh` fails.
 */
export const listSecrets = (repo: string): string[] | null => {
  try {
    const result = spawnSync(
      'gh',
      ['secret', 'list', '--repo', repo, '--json', 'name'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    return result.status === 0
      ? (JSON.parse(result.stdout) as { name: string }[]).map((s) => s.name)
      : null
  } catch {
    return null
  }
}

/**
 * Checks run against the GitHub repo.
 */
export const REMOTE_CHECKS: RemoteCheck[] = [
  {
    id: 'secret-codacy-token',
    desc: 'Codacy secret',
    type: 'remote',
    publishedOnly: true,
    check: (repo) => {
      const secrets = listSecrets(repo)
      return secrets?.includes('CODACY_PROJECT_TOKEN') ?? false
    },
  },
]

/**
 * Every check, local then remote.
 */
export const CHECKS: Check[] = [...LOCAL_CHECKS, ...REMOTE_CHECKS]
